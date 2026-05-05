import { logger } from "./logger";

import type { ModelMessage } from "ai";

// Pipe-character link bugs come in several flavors. Each produces broken
// Slack output via a slightly different path through the markdown parser
// + Slack adapter renderer.
//
// Two output canonical forms exist depending on where the text is
// going:
//
// - PROSE (thread.post({ markdown })): the adapter parses markdown and
//   converts it to Slack mrkdwn before posting. Canonical form is
//   `[label](URL)` standard markdown. Emitting `<URL|label>` is risky
//   for single-word labels because remark autolinks them and the
//   adapter then re-renders as `<URL|label|URL|label>` (4-piece).
//
// - CARD MRKDWN (`{ type: "mrkdwn", text }` section blocks): Slack
//   reads the text as Slack mrkdwn directly — no markdown parsing.
//   Canonical form is `<URL|label>`. Emitting `[label](URL)` is broken
//   because Slack shows the literal `[label](URL)` text.
//
// `sanitizeForMarkdown` is for the prose path; `sanitizeForCardMrkdwn`
// is for the card path. Both fix the same set of malformed shapes —
// they just project to a different canonical form.
//
// Malformed shapes both functions must fix:
//   1. RENDERED 3-PIPE       <word|URL|label>
//   2. MARKDOWN JUNK DEST    [label](<word|URL>)  /  [label](word|URL)
//                            [label](URL|junk)    /  [label](<URL>)
//   3. (markdown-only)       <URL|tweet>          autolink re-mangle
//
// Channel/user mentions like `<#C123|name>` and `<@U123|name>` never
// have an http URL in slot 1, so the patterns naturally skip them.

const RENDERED_3_PIPE_PATTERN =
  /<([^|<>\n]+)\|(https?:\/\/[^|<>\s]+)\|([^<>\n]+?)>/g;

const MARKDOWN_LINK_PATTERN = /\[([^\]]+)\]\(([^)]*)\)/g;
const URL_INSIDE_PATTERN = /https?:\/\/[^|<>\s)]+/;
const CLEAN_URL_DEST_PATTERN = /^\s*https?:\/\/[^|<>\s)]+\s*$/;

const SLACK_LABELED_URL_PATTERN = /<(https?:\/\/[^|<>\s]+)\|([^<>\n]+?)>/g;

const STANDARD_MARKDOWN_LINK_PATTERN =
  /\[([^\]]+)\]\((https?:\/\/[^|<>\s)]+)\)/g;

const repairMarkdownJunkDest = (text: string, matches: string[]): string =>
  text.replace(MARKDOWN_LINK_PATTERN, (whole, label, dest) => {
    if (CLEAN_URL_DEST_PATTERN.test(dest)) return whole;
    const url = dest.match(URL_INSIDE_PATTERN);
    if (!url) return whole;
    matches.push(whole);
    return `[${label}](${url[0]})`;
  });

const stripRendered3Pipe = (text: string, matches: string[]): string => {
  const found = text.match(RENDERED_3_PIPE_PATTERN);
  if (!found) return text;
  matches.push(...found);
  return text.replace(RENDERED_3_PIPE_PATTERN, "<$2|$3>");
};

const logRewrites = (label: string, matches: string[]): void => {
  if (matches.length === 0) return;
  logger.warn(
    `[sanitize-slack-mrkdwn] rewrote (${label})`,
    matches.slice(0, 5),
  );
};

/**
 * Sanitize text bound for `thread.post({ markdown: ... })`. The Slack
 * adapter parses markdown and converts to Slack mrkdwn. Canonical form
 * is `[label](URL)` markdown so the adapter does the link conversion;
 * leaving `<URL|label>` autolinks risks re-mangling for single-word
 * labels (remark autolinks `<URL|tweet>` whole, then the adapter emits
 * `<URL|tweet|URL|tweet>`).
 */
export const sanitizeForMarkdown = (text: string): string => {
  let out = text;
  const rendered: string[] = [];
  out = stripRendered3Pipe(out, rendered);
  logRewrites("rendered 3-pipe → markdown", rendered);

  const markdown: string[] = [];
  out = repairMarkdownJunkDest(out, markdown);
  logRewrites("markdown junk dest → markdown", markdown);

  if (out.match(SLACK_LABELED_URL_PATTERN)) {
    out = out.replace(SLACK_LABELED_URL_PATTERN, "[$2]($1)");
  }
  return out;
};

/**
 * Sanitize text bound for a Block Kit `{ type: "mrkdwn", text }` block
 * (card section text). Slack reads the text as Slack mrkdwn directly —
 * no markdown parsing happens. Canonical form is `<URL|label>` so the
 * link renders. Emitting `[label](URL)` markdown into a card shows up
 * as literal `[label](URL)` text in Slack — which was the regression
 * introduced when we normalized everything to markdown form.
 */
export const sanitizeForCardMrkdwn = (text: string): string => {
  let out = text;
  const rendered: string[] = [];
  out = stripRendered3Pipe(out, rendered);
  logRewrites("rendered 3-pipe → card mrkdwn", rendered);

  const markdown: string[] = [];
  out = repairMarkdownJunkDest(out, markdown);
  logRewrites("markdown junk dest → card mrkdwn", markdown);

  // Convert any standard-markdown links the model may have written into
  // a card to Slack mrkdwn — Slack mrkdwn doesn't recognize markdown
  // link syntax in section block text.
  if (out.match(STANDARD_MARKDOWN_LINK_PATTERN)) {
    out = out.replace(STANDARD_MARKDOWN_LINK_PATTERN, "<$2|$1>");
  }
  return out;
};

interface AssistantTextPart {
  type: "text";
  text: string;
}

const isAssistantTextPart = (part: unknown): part is AssistantTextPart => {
  if (!part || typeof part !== "object") return false;
  const candidate = part as { type?: unknown; text?: unknown };
  return candidate.type === "text" && typeof candidate.text === "string";
};

/**
 * Sanitize assistant text content before persisting to thread state. The
 * markdown canonical form is the safer choice here — it's the more
 * common shape the model produces and emits, so persisting in that
 * form keeps context coherent and avoids re-introducing autolink risks
 * if the same text is read back in a future turn and routed to prose.
 */
export const sanitizeAssistantTextInMessages = (
  messages: ReadonlyArray<ModelMessage>,
): ModelMessage[] =>
  messages.map((message) => {
    if (message.role !== "assistant") return message;
    if (typeof message.content === "string") {
      const cleaned = sanitizeForMarkdown(message.content);
      if (cleaned === message.content) return message;
      return { ...message, content: cleaned };
    }
    if (!Array.isArray(message.content)) return message;
    let mutated = false;
    const nextParts = message.content.map((part) => {
      if (!isAssistantTextPart(part)) return part;
      const cleaned = sanitizeForMarkdown(part.text);
      if (cleaned === part.text) return part;
      mutated = true;
      return { ...part, text: cleaned };
    });
    if (!mutated) return message;
    return {
      ...message,
      content: nextParts as typeof message.content,
    };
  });
