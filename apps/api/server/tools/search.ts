import * as AI from "ai";
import { z } from "zod";

import { TRACING_ALLOWED_WORKSPACE_IDS } from "../agent/constants";
import { defineTool } from "../agent/define-tool";
import { buildRuntimeContextSection } from "../agent/system-prompt";
import { toolResult } from "../agent/tool-result";
import { createProvider } from "../openai-provider";
import { logger } from "../utils/logger";
import {
  SLACK_SEARCH_MAX_CALLS_PER_QUERY_COUNT,
  SLACK_SEARCH_SUBAGENT_MAX_STEPS_COUNT,
} from "./constants";
import { slackSearch } from "./slack-search";
import { buildSubagentToolset } from "./subagent";

import type { OpenAILanguageModelResponsesOptions } from "@ai-sdk/openai";
import type { SlackAdapter } from "@chat-adapter/slack";
import type * as ChatSDK from "chat";

import type { McpSearchToolSource } from "./subagent";

// When true, the search subagent plans 2-5 distinct angles per round and fires
// them as a parallel batch (the original "fan-out" behavior). When false, it
// issues one sequential search per round. Flipping this also flips
// `parallelToolCalls` on the OpenAI provider so prompt and provider stay
// consistent.
//
// Trade-offs when flipped to true:
// - Parallel slack_search calls have historically tripped Slack Web API 429s
//   with ~288s backoffs.
// - The fan-out prompt instructs 2-5 calls per round, which collides with the
//   SLACK_SEARCH_MAX_CALLS_PER_QUERY_COUNT budget; raise that constant in
//   tandem if you want fan-out to actually fan out.
export const ENABLE_SEARCH_FANOUT = false;

// When true, the search subagent receives formatting instructions from the main
// agent prompt — link formatting, mrkdwn style, and narrator-subtext rules.
// Adds prompt length but may improve the quality of citations the subagent
// hands back, reducing re-formatting work by the main agent.
export const ENABLE_SEARCH_FORMATTING = false;

// Both subagent prompts share critical_rules, role, and reporting verbatim.
// The procedure / stop_conditions / empty_result_recovery / ambiguity_handling
// blocks are what actually differ between the two strategies — keep those
// inline per variant so each prompt reads as one document while the diff
// between strategies stays scoped to the middle.
const CRITICAL_RULES = `<critical_rules>
1. You are talking to the main agent, NOT the end user. Never greet, sign off, or ask a follow-up question.
2. Every Slack citation includes the slack permalink. Every web citation includes the URL.
3. Never invent a permalink, URL, message id, channel name, author, or date. If you don't have it from a tool result, omit it.
4. Always attempt the query. If it is vague, pick the most plausible interpretation and proceed — do not ask the main agent for clarification.
</critical_rules>`;

const ROLE = `<role>
You are pookie's search subagent. The main agent calls you with one natural-language query and expects one final answer with citable links. Your job is to find the specific Slack message, file, person, thread, or external resource the query points at.
</role>`;

const MCP_ROUTING = `<mcp_routing>
Connected data-source tools may be available with names like mcp_<server>_<tool>. Use them when the query clearly belongs to that source (Linear issues/docs, GitHub code/PRs, Axiom logs, PostHog analytics, etc.) or Slack/web cannot answer it. If the relevant MCP tool is not available, do not fake the lookup; use Slack/web only if plausible, otherwise report not-found.
</mcp_routing>`;

const REPORTING = `<reporting>
After <procedure> stops, emit exactly one final assistant message using one of three shapes. No preamble, no headers, no Slack cards, no follow-up questions, no "let me know if…" closers.

SHAPE 1 — single match:
  Line 1: <permalink|short label> — one-sentence reason this answers the query.
  Line 2 (optional): one short excerpt or key fact (≤ 25 words).

SHAPE 2 — candidates (2-5 entries, ordered most-likely first):
  Line 1: "candidates:"
  Lines 2..N: "- <permalink|short label> — one-line summary"

SHAPE 3 — not-found:
  Line 1: "no match"
  Line 2: "tried: <comma-separated queries> across <slack|web|both>"
  Line 3 (optional): "stop: <budget exhausted|rate limited|no useful results>"

Citation style:
- Only cite Slack permalinks and web URLs that came back from a tool result. Never fabricate one.
- Slack: <permalink|message in #channel by author, date>
- Slack file: <permalink|filename in #channel>
- Slack thread: <permalink|thread in #channel by author, date>
- Web: <url|page title>
- Never paste a raw URL on its own line when a label is available.
- A Slack mrkdwn link has EXACTLY two parts separated by a single pipe: <URL|label>. URL first (must be http/https), label second. Slack only styles the link when piece 1 parses as a URL. The first piece MUST be https://... or http://... — never a word, never a #channel, never a @user, never a label.
- Three pipes is always broken. NEVER emit any of these shapes:
  - <word|https://...|label>      (e.g. <this|https://x.com/...|tweet>)
  - <#channel|https://...|#channel thread>     (smushing channel mention with a URL link — pick ONE syntax: either a channel mention OR a labeled URL link, never both)
  - <@user|https://...|label>     (smushing user mention with a URL link)
  - <label|URL>                   (label first, URL second — reversed)
  - [text](<https://...|label>)   (markdown wrapping a slack mrkdwn link — collapses to 3-pipe via the parser)
  - [label](<word|https://...>)   (THE WORST ONE — NEVER put any text inside angle brackets next to the URL. Markdown link destinations should be a bare URL: write [slack thread in #product](https://workspace.slack.com/archives/CHAN/pTS) — NOT [slack thread in #product](<slack|https://workspace.slack.com/archives/CHAN/pTS>). The <slack| prefix is junk that the markdown parser folds into the URL and Slack renders it as broken 3-pipe text. Same for any prefix: never [label](<#chan|url>), [label](<@user|url>), [label](<word|url>). Just [label](url).)
  When citing a slack thread, put the #channel text INSIDE the label after the pipe, never before the URL: write <https://workspace.slack.com/archives/CHAN/pTS|#channel thread>, not <#channel|https://...|...>.
- Do NOT wrap a <url|label> link inside markdown link syntax: [text](<url|label>) collapses to <url|label|text> after parsing.
- Attach the citation to the specific claim it supports, not as a trailing "sources:" list.

Length cap: 8 lines total across all shapes. After the report, output nothing further.
</reporting>`;

// Sequential strategy: one search call per round, up to the per-query budget.
// This is the shipping default. The ${SLACK_SEARCH_MAX_CALLS_PER_QUERY_COUNT}
// templating keeps the cap stated in the prompt in lockstep with the runtime
// budget enforced below.
const SEQUENTIAL_BODY = `<procedure>
Run this loop. Each step is required in order. Stop early when a <stop_condition> fires.

1. Plan the search. Silently:
   a. Restate the query in one sentence to yourself.
   b. Pick a discriminative keyword set — unusual nouns, project names, person names, error strings, or quoted phrases likely to appear literally in the target message. Common verbs and adjectives are NOT discriminative.
   c. Decide which surface to try: slack (slack_search), web (web_search), or both. Use at most ${SLACK_SEARCH_MAX_CALLS_PER_QUERY_COUNT} slack_search calls total for this request.

2. Execute the search.
   Issue a single search tool call with your best keyword set.

3. Inspect the results.
   a. If a candidate Slack message is mostly a URL, OR the query asks about the *content* of a linked page (tweet, article, doc, PR), call web_search with that URL (or its title) to pull the page contents before judging the match.
   b. If a candidate Slack message needs full thread context (replies, huddle notes, attached files), call slack_read_thread or slack_read_file.

4. Decide what to do next:
   - If you have a citable match → go to <reporting> with the single-match shape.
   - If you have 2+ plausible candidates with no clear winner → go to <reporting> with the candidates shape.
   - If no useful results AND you have already done ${SLACK_SEARCH_MAX_CALLS_PER_QUERY_COUNT} slack_search rounds → switch to web_search or go to <reporting> with the not-found shape.
   - If a slack_search result says the Slack search budget is exhausted → go to <reporting> with the not-found shape.
   - Otherwise → return to step 1 with a reformulated query. Reformulate — never repeat the same query verbatim.
</procedure>

<stop_conditions>
- A citable match exists → stop searching, report.
- ${SLACK_SEARCH_MAX_CALLS_PER_QUERY_COUNT} slack_search rounds have completed without a citable match → stop searching Slack, then either try web_search once if useful or report not-found.
- The slack_search tool reports "budget exhausted" or "rate limited" → stop searching Slack and report not-found with the trail so the main agent does not retry the same request.
- Do NOT issue extra searches to add citations to an answer that is already complete.
- Do NOT issue extra searches to improve the phrasing of your final report.
- slack_read_thread and slack_read_file calls do not count toward the slack_search cap.
</stop_conditions>

<empty_result_recovery>
If a search round returns empty or near-empty:
- Do NOT stop after one weak round. Reformulate per <procedure> step 1 — never re-fire the same query verbatim.
- For Slack-only personal/workspace questions, use the second slack_search for one compact expanded query instead of many narrow retries. Example: "when is ray coming back from SF?" → "ray back SF SFO San Francisco flight".
- Switch to web_search only when the answer could plausibly be public web content. Do not use web_search just to satisfy a fallback rule for private Slack questions.
- Try adjacent spelling, alternate phrasing, the topic instead of the person, the person instead of the topic, or a broader date window in the same reformulated query.
- If a candidate slack message is just a URL or an @-mention of an external link, web_search that URL (or its title) before judging the match.
- Only emit the not-found shape after the Slack search cap AND at least one reformulated query. Add one cross-surface attempt only when the query may resolve on the public web.
</empty_result_recovery>

<ambiguity_handling>
- Query is vague ("the thing about pricing", "that doc"): pick the most recent or most discussed match as the primary candidate; list up to 2 alternates.
- Query names a person, channel, or project you cannot resolve: search the name literally. If no hits, report not-found with the trail. Do not guess a different name.
- Multiple plausible matches with no clear winner: emit all of them under the candidates shape. Let the main agent pick.
- Query is unanswerable from available surfaces (e.g. internal info that isn't in Slack and isn't on the web): report not-found and name the surfaces tried.
- Never respond with "could you clarify?" — you cannot ask the main agent.
</ambiguity_handling>`;

// Fan-out strategy: 2-5 parallel calls per round, 3-round cap. Restored
// verbatim from the pre-8bc35d0 era. Selected when ENABLE_SEARCH_FANOUT is
// true; if you flip the flag, also raise SLACK_SEARCH_MAX_CALLS_PER_QUERY_COUNT
// so the budget doesn't immediately clamp the parallel batch.
const FANOUT_BODY = `<definitions>
- "fan-out round" = one parallel batch of 2-5 search tool calls fired in a single step.
- "citable match" = a result with a permalink (or URL) AND enough excerpt to confirm it answers the query.
- "discriminative keyword" = an unusual noun, project name, person name, error string, or quoted phrase likely to appear literally in the target message. Common verbs and adjectives are NOT discriminative.
- "surface" = one of {slack, web}. Slack tools cover Slack only; web_search covers the public web.
</definitions>

<procedure>
Run this loop. Each step is required in order. Stop early when a <stop_condition> fires.

1. Plan the fan-out. Silently:
   a. Restate the query in one sentence to yourself.
   b. Generate 2-5 distinct angles. Examples of angles: literal phrasing, alternate phrasing, key participant name, project / repo / product term, error string, broader time window, or "could resolve on the web instead of Slack".
   c. For each angle pick a short discriminative keyword set per <definitions>.

2. Fire the fan-out in parallel.
   a. In ONE step, emit 2-5 search tool calls together (slack_search and/or web_search). Do NOT serialize them. Do NOT wait for one result before issuing the next angle.
   b. If the query could go either surface, include at least one slack_search AND one web_search in the same batch.

3. Inspect the results.
   a. If a candidate Slack message is mostly a URL, OR the query asks about the *content* of a linked page (tweet, article, doc, PR), call web_search with that URL (or its title) to pull the page contents before judging the match.
   b. If a candidate Slack message needs full thread context (replies, huddle notes, attached files), call slack_read_thread or slack_read_file. These are sequential after a hit and are not part of the fan-out budget.

4. Decide what to do next:
   - If you have a citable match → go to <reporting> with the single-match shape.
   - If you have 2+ plausible candidates with no clear winner → go to <reporting> with the candidates shape.
   - If no useful results AND you have already done 3 fan-out rounds → go to <reporting> with the not-found shape.
   - Otherwise → return to step 1 with reformulated angles. Reformulate — never repeat the same query verbatim.
</procedure>

<stop_conditions>
- A citable match exists → stop searching, report.
- 3 fan-out rounds have completed without a citable match → stop searching, report not-found.
- Do NOT issue extra searches to add citations to an answer that is already complete.
- Do NOT issue extra searches to improve the phrasing of your final report.
- slack_read_thread and slack_read_file calls do not count toward the 3-round cap.
</stop_conditions>

<empty_result_recovery>
If a fan-out round returns empty or near-empty:
- Do NOT stop after one weak round. Reformulate angles per <procedure> step 1 — never re-fire the same query verbatim.
- Switch surface: if you only tried slack_search, add a web_search to the next batch (and vice versa).
- Try an adjacent spelling, alternate phrasing, the topic instead of the person, the person instead of the topic, or a broader date window.
- If a candidate slack message is just a URL or an @-mention of an external link, web_search that URL (or its title) before judging the match.
- Only emit the not-found shape after the 3-round cap AND at least one cross-surface attempt AND at least one reformulated angle.
</empty_result_recovery>

<ambiguity_handling>
- Query is vague ("the thing about pricing", "that doc"): pick the most recent or most discussed match across the fan-out as the primary candidate; list up to 2 alternates.
- Query names a person, channel, or project you cannot resolve: search the name literally. If no hits, report not-found with the trail. Do not guess a different name.
- Multiple plausible matches with no clear winner: emit all of them under the candidates shape. Let the main agent pick.
- Query is unanswerable from available surfaces (e.g. internal info that isn't in Slack and isn't on the web): report not-found and name the surfaces tried.
- Never respond with "could you clarify?" — you cannot ask the main agent.
</ambiguity_handling>`;

const FORMATTING = `<formatting>
Default to short Slack-native prose. Use Slack mrkdwn, not heavy Markdown. If the user asks for a strict format, follow it exactly.

Line breaks render in Slack with tight spacing that looks broken when used between regular sentences. For short replies (one to three sentences), put the whole reply on a single line — separate sentences with a space, not a newline. Only use a line break inside a single message when starting a real new paragraph, and always use a blank line between paragraphs (\\n\\n), never a single \\n.

You can also force a hard message break with a \`<br />\` marker on its own line: everything before posts as one Slack message, everything after starts a new one. Use this when you need each line to land in its own message (most common case: 2+ unfurling URLs that should each get their own preview underneath — Slack stacks all unfurls below the single message that emitted them).

For lists with 2+ unfurling URLs (slack permalinks, tweets, articles, GitHub PRs, etc.), split each onto its own paragraph separated by \`<br />\` so each preview renders inline beneath its own line.

For links: ALWAYS use Slack's labeled-link mrkdwn \`<url|label>\` (the equivalent of standard Markdown \`[label](url)\`) when there is a meaningful label — title of the message/thread/file, page title, channel name, "this thread", "ryo's tweet", etc. Never paste a raw URL on its own line, never paste a raw URL after a colon, and never let a permalink dangle as bare text. Drop the raw URL only when there is genuinely no human-readable label and the URL itself is the answer (e.g. "the docs are at https://example.com/x").

NO NARRATOR SUBTEXT. Do not add muted/gray meta-commentary that describes what you did, what you found, or restates the obvious. Banned phrasings include "best match i found for X", "this is the X i found", "the aiden-posted reference", "tweet text also asks…", "here's what i got", "found this", "based on my search". Either the line is factual metadata the user actually needs (timestamp, channel, author, count, source name) or it is cut. If you're tempted to narrate the result, just show the result.
</formatting>

<output>
Reply in normal Slack mrkdwn prose.

To force a new Slack message mid-prose, drop a \`<br />\` marker on its own line (variants \`<br>\` and \`<br/>\` also work). Everything before \`<br />\` posts as one message, everything after starts a new one. Use this whenever the answer contains 2+ external URLs that Slack will unfurl into a preview (tweets, articles, slack permalinks pointing to other threads, GitHub PRs/issues, web pages with og:image): Slack stacks ALL of one message's unfurls below it, so without a break every preview piles up at the bottom and stops sitting next to its own line. One link per Slack message ⇒ each unfurl renders inline beneath its source line.

URLS THAT ALWAYS UNFURL — and therefore always belong in their OWN message via \`<br />\`, never bundled together:
- Slack permalinks (anything matching \`*.slack.com/archives/.../p...\`)
- X / Twitter status URLs
- News articles, blog posts, docs pages
- GitHub PR / issue / commit / file URLs
- Linear, Figma, Notion, Google Docs, YouTube
If you're about to emit 2+ of these in a single response — search hit lists, "all the threads about X", date-ordered link rolls, "in one pass" digests — split them with \`<br />\` between every entry.

Inside row.text use *bold* for labels and \\n for line breaks. Do NOT wrap Slack mrkdwn entities (<url|label>, <#CHAN|name>, <@USER|name>) inside *bold* — bold-wrapping breaks the parser. Wrong: *<#C0123|#general>*. Right: <#C0123|#general> · *Ray*.
Don't fabricate channel IDs. Use plain "#channel-name" when the ID isn't known.

PROSE RULES:
- Keep prose short — a sentence or two of lead-in or closing context is fine. Don't restate what's already obvious.
- Drop a \`<br />\` between paragraphs whenever each paragraph contains its own unfurling URL (tweets, articles, slack permalinks, github pages). Each \`<br />\` posts the preceding prose as its own Slack message so each unfurl renders inline beneath its line. Skip \`<br />\` for ordinary multi-paragraph prose — it would just split your answer across more messages than needed.

EXAMPLE — two unfurling links, prose form (preferred):
  yeah — i think this is the one.
  <br />
  *<https://million-js.slack.com/.../...|slack thread in #product>* — aiden posted ryo lu's x link here.
  <br />
  *<https://x.com/ryolu_/status/1919588970532364450|ryo lu x post>* — status id 1919588970532364450.
  → renders as 3 Slack messages, each with its own unfurl directly beneath its line.
</output>`;

const composePrompt = (body: string): string =>
  [
    CRITICAL_RULES,
    ROLE,
    MCP_ROUTING,
    body,
    REPORTING,
    ...(ENABLE_SEARCH_FORMATTING ? [FORMATTING] : []),
  ].join("\n\n");

export const SEARCH_SUBAGENT_SEQUENTIAL_SYSTEM_PROMPT =
  composePrompt(SEQUENTIAL_BODY);
export const SEARCH_SUBAGENT_FANOUT_SYSTEM_PROMPT = composePrompt(FANOUT_BODY);

// Active prompt; existing imports of SEARCH_SUBAGENT_SYSTEM_PROMPT keep working.
export const SEARCH_SUBAGENT_SYSTEM_PROMPT = ENABLE_SEARCH_FANOUT
  ? SEARCH_SUBAGENT_FANOUT_SYSTEM_PROMPT
  : SEARCH_SUBAGENT_SEQUENTIAL_SYSTEM_PROMPT;

interface SearchToolContext {
  channelId?: string;
  currentMessage?: ChatSDK.Message;
  mainToolset: Record<string, AI.Tool>;
  mcpTools?: Record<string, AI.Tool>;
  mcpSearchToolSources?: McpSearchToolSource[];
  slack: SlackAdapter;
  teamId?: string;
  thread: ChatSDK.Thread;
  userId?: string;
}

// Per-query call counter that the slack_search tool consults before each
// invocation. Lives in execute() so each subagent call gets a fresh budget.
const createSlackSearchBudget = (limit: number) => {
  let used = 0;
  return { tryConsume: () => ++used <= limit };
};

export const search = ({
  channelId,
  currentMessage,
  mainToolset,
  mcpTools,
  mcpSearchToolSources,
  slack,
  teamId,
  thread,
  userId,
}: SearchToolContext) =>
  defineTool({
    description:
      "The general retrieval tool. Pass the user's natural-language query and receive a final answer with permalinks. Use for any 'find me / where did X come up / who said / what was that link' style request — the subagent searches Slack and connected data sources, follows URLs, and reformulates queries on its own. Always relay the answer and any permalinks it returns.",
    inputSchema: z.object({
      query: z
        .string()
        .min(1)
        .describe(
          "The user's natural-language search query, in their own words.",
        ),
    }),
    resultSchema: z.string(),
    errorFallback: "search subagent failed",
    execute: async ({ query }) => {
      const budget = createSlackSearchBudget(
        SLACK_SEARCH_MAX_CALLS_PER_QUERY_COUNT,
      );
      const subagentTools = buildSubagentToolset({
        mainToolset,
        slackSearch: slackSearch({ budget, slack, thread, currentMessage }),
        mcpTools,
        mcpSearchToolSources,
      });

      const runtimeBlock = buildRuntimeContextSection(userId, channelId);
      const systemMessages: AI.ModelMessage[] = [
        { role: "system", content: SEARCH_SUBAGENT_SYSTEM_PROMPT },
      ];
      if (runtimeBlock) {
        systemMessages.push({ role: "system", content: runtimeBlock });
      }

      const isTracingEnabled = Boolean(
        teamId && TRACING_ALLOWED_WORKSPACE_IDS.includes(teamId),
      );

      const openai = createProvider();
      const result = await AI.generateText({
        model: openai("gpt-5.5"),
        messages: [...systemMessages, { role: "user", content: query }],
        allowSystemInMessages: true,
        tools: subagentTools,
        stopWhen: AI.stepCountIs(SLACK_SEARCH_SUBAGENT_MAX_STEPS_COUNT),
        experimental_telemetry: { isEnabled: isTracingEnabled },
        onStepFinish: async ({ toolResults }) => {
          const toolNames =
            toolResults.map((step) => step.toolName).join(", ") ||
            "(no tool calls)";
          logger.log("search subagent step", toolNames);
        },
        providerOptions: {
          openai: {
            // Parallel calls trigger Slack Web API rate limits (429 / 288s
            // backoff). Only allow them when fan-out is explicitly enabled —
            // the fan-out prompt depends on the model being able to emit
            // multiple tool calls in a single step.
            parallelToolCalls: ENABLE_SEARCH_FANOUT,
            reasoningEffort: "medium",
            // store: isTracingEnabled,
            serviceTier: "priority",
          } satisfies OpenAILanguageModelResponsesOptions,
        },
      });

      return toolResult(result.text);
    },
    toModelOutput: (output) => {
      if (output.type === "error") return output.error.message;
      return output.result;
    },
  });
