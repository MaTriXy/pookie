import { SpanStatusCode } from "@opentelemetry/api";
import * as SlackAPI from "@slack/web-api";
import { z } from "zod";

import { env } from "@/env";

import { defineTool } from "../agent/define-tool";
import { toolErr, toolResult } from "../agent/tool-result";
import { extractSlackChannelId } from "../slack/schemas";
import { pookiebotTracer } from "../utils/get-current-trace-id";
import { getSlackErrorCode } from "../utils/normalize-tool-error";
import { pickDefined } from "../utils/pick-defined";
import { recordSpanError } from "../utils/record-span-error";
import { decryptSecret, encryptSecret } from "../utils/secure-store";
import { getISOFromSlackTimestamp } from "../utils/slack-timestamp";
import { truncateSnippet } from "../utils/truncate-snippet";
import {
  SLACK_SEARCH_DEFAULT_LIMIT,
  SLACK_SEARCH_MAX_CALLS_PER_QUERY_COUNT,
  SLACK_SEARCH_SNIPPET_MAX_CHARS,
  SLACK_SEARCH_WEB_CLIENT_MAX_CONCURRENCY_COUNT,
  SLACK_SEARCH_WEB_CLIENT_RETRY_COUNT,
} from "./constants";

import type { SlackAdapter } from "@chat-adapter/slack";
import type * as ChatSDK from "chat";

import type {
  PookieSlackInstallation,
  SlackEventTeamId,
  SlackSearchFileMatch,
  SlackSearchMessageMatch,
} from "../slack/types";

// `assistant.search.context` is not yet exposed in @slack/web-api typed methods,
// so we describe its response shape ourselves and call it through `apiCall`.
interface AssistantSearchContextMessage {
  author_name?: string;
  text?: string;
  ts?: string;
  user_id?: string;
}

interface AssistantSearchMessageResult {
  author_name?: string;
  author_user_id?: string;
  channel_id?: string;
  channel_name?: string;
  content?: string;
  context_messages?: {
    after?: AssistantSearchContextMessage[];
    before?: AssistantSearchContextMessage[];
  };
  is_author_bot?: boolean;
  message_ts?: string;
  permalink?: string;
  team_id?: string;
  thread_ts?: string;
}

interface AssistantSearchFileResult {
  channel_id?: string;
  channel_name?: string;
  created?: number;
  filetype?: string;
  name?: string;
  permalink?: string;
  preview?: string;
  team_id?: string;
  title?: string;
  url_private?: string;
  user_id?: string;
  username?: string;
}

interface AssistantSearchResponse extends SlackAPI.WebAPICallResult {
  next_cursor?: string;
  results?: {
    files?: AssistantSearchFileResult[];
    messages?: AssistantSearchMessageResult[];
  };
}

export interface TokenContext {
  botToken?: string;
  client: SlackAPI.WebClient;
  teamId?: string;
  userToken?: string;
}

interface SearchContext extends TokenContext {
  actionToken?: string;
  contextChannelId?: string;
}

interface StoredSearchContext {
  actionToken?: string;
  contextChannelId?: string;
  teamId?: string;
}

interface SlackSearchThreadState {
  slackSearchContext?: StoredSearchContext;
}

interface SlackSearchBudget {
  tryConsume: () => boolean;
}

const slackSearchWebClientOptions: SlackAPI.WebClientOptions = {
  maxRequestConcurrency: SLACK_SEARCH_WEB_CLIENT_MAX_CONCURRENCY_COUNT,
  rejectRateLimitedCalls: true,
  retryConfig: { retries: SLACK_SEARCH_WEB_CLIENT_RETRY_COUNT },
};

const slackInstallationSchema: z.ZodType<PookieSlackInstallation> = z.object({
  botToken: z.string().min(1),
  botUserId: z.string().min(1).optional(),
  teamName: z.string().min(1).optional(),
  userToken: z.string().min(1).optional(),
});

interface SlackSearchRawEvent {
  action_token?: string;
  assistant_thread?: {
    action_token?: string;
  };
  team?: SlackEventTeamId;
  team_id?: string;
}

const slackSearchRawEventSchema: z.ZodType<SlackSearchRawEvent> = z.object({
  action_token: z.string().min(1).optional(),
  assistant_thread: z
    .object({ action_token: z.string().min(1).optional() })
    .optional(),
  team: z.string().min(1).optional(),
  team_id: z.string().min(1).optional(),
});

const extractSlackSearchRawEvent = (
  raw: unknown,
): SlackSearchRawEvent | undefined =>
  slackSearchRawEventSchema.safeParse(raw).data;

const findFromMessages = <T>(
  messages: readonly ChatSDK.Message[],
  extractor: (raw: unknown) => T | undefined,
): T | undefined => {
  for (
    let messageIndex = messages.length - 1;
    messageIndex >= 0;
    messageIndex--
  ) {
    const candidate = extractor(messages[messageIndex]?.raw);
    if (candidate !== undefined) return candidate;
  }
  return undefined;
};

const extractTeamId = (raw: unknown): string | undefined => {
  const event = extractSlackSearchRawEvent(raw);
  return event?.team_id ?? event?.team;
};

const extractActionToken = (raw: unknown): string | undefined => {
  const event = extractSlackSearchRawEvent(raw);
  return event?.assistant_thread?.action_token ?? event?.action_token;
};

const getStoredSearchContext = async (
  thread: ChatSDK.Thread,
): Promise<StoredSearchContext | undefined> => {
  const state = (await thread.state) as SlackSearchThreadState | null;
  const stored = state?.slackSearchContext;
  if (!stored) return stored;

  if (stored.actionToken) {
    const decrypted = await decryptSecret(stored.actionToken);
    return { ...stored, actionToken: decrypted ?? stored.actionToken };
  }
  return stored;
};

export const resolveTokenContext = async (
  slack: SlackAdapter,
  thread: ChatSDK.Thread,
  currentMessage?: ChatSDK.Message,
  webClientOptions?: SlackAPI.WebClientOptions,
): Promise<TokenContext> => {
  const storedContext = await getStoredSearchContext(thread);

  const teamId =
    extractTeamId(currentMessage?.raw) ??
    findFromMessages(thread.recentMessages, extractTeamId) ??
    storedContext?.teamId;

  if (teamId) {
    const installation = slackInstallationSchema
      .nullable()
      .safeParse(await slack.getInstallation(teamId)).data;
    if (installation?.botToken) {
      return {
        botToken: installation.botToken,
        client: new SlackAPI.WebClient(installation.botToken, webClientOptions),
        teamId,
        userToken:
          installation.userToken ??
          (env.IS_SELF_DEPLOYED ? env.SLACK_USER_TOKEN : undefined),
      };
    }
  }

  if (process.env.SLACK_BOT_TOKEN) {
    return {
      botToken: process.env.SLACK_BOT_TOKEN,
      client: new SlackAPI.WebClient(
        process.env.SLACK_BOT_TOKEN,
        webClientOptions,
      ),
      teamId,
      userToken: env.IS_SELF_DEPLOYED ? env.SLACK_USER_TOKEN : undefined,
    };
  }

  throw new Error(
    "couldn't resolve a slack bot token for this workspace. make sure the app is installed and the token is available.",
  );
};

const resolveSearchContext = async (
  slack: SlackAdapter,
  thread: ChatSDK.Thread,
  currentMessage?: ChatSDK.Message,
): Promise<SearchContext> => {
  const tokenContext = await resolveTokenContext(
    slack,
    thread,
    currentMessage,
    slackSearchWebClientOptions,
  );
  const storedContext = await getStoredSearchContext(thread);

  const actionToken =
    extractActionToken(currentMessage?.raw) ??
    findFromMessages(thread.recentMessages, extractActionToken) ??
    storedContext?.actionToken;

  const contextChannelId =
    extractSlackChannelId(currentMessage?.raw) ??
    findFromMessages(thread.recentMessages, extractSlackChannelId) ??
    storedContext?.contextChannelId;

  return { ...tokenContext, actionToken, contextChannelId };
};

/**
 * Persist action_token, teamId, and contextChannelId to thread state.
 * The initial app_mention carries assistant_thread.action_token, but
 * follow-up replies are regular message events without it. This cache
 * ensures subsequent messages in the thread can still use slack_search.
 */
export const cacheSlackSearchContext = async (
  thread: ChatSDK.Thread,
  currentMessage?: ChatSDK.Message,
): Promise<void> => {
  const rawActionToken = extractActionToken(currentMessage?.raw);
  const incoming = pickDefined<StoredSearchContext>({
    actionToken: rawActionToken
      ? await encryptSecret(rawActionToken)
      : undefined,
    teamId: extractTeamId(currentMessage?.raw),
    contextChannelId: extractSlackChannelId(currentMessage?.raw),
  });

  if (Object.keys(incoming).length === 0) return;

  const existingState = (await thread.state) as SlackSearchThreadState | null;
  await thread.setState({
    slackSearchContext: {
      ...existingState?.slackSearchContext,
      ...incoming,
    },
  } satisfies Partial<SlackSearchThreadState>);
};

const formatContextMessages = (
  entries: AssistantSearchContextMessage[] | undefined,
): string[] =>
  (entries ?? [])
    .map((entry) => {
      const text = truncateSnippet(
        entry.text ?? "",
        SLACK_SEARCH_SNIPPET_MAX_CHARS,
      );
      if (!text) return undefined;
      const author = entry.author_name?.trim();
      return author ? `${author}: ${text}` : text;
    })
    .filter((value): value is string => Boolean(value));

const messageResultSchema = z.object({
  type: z.literal("message"),
  author: z.string(),
  channel: z.string(),
  channelId: z.string().optional(),
  isAuthorBot: z.boolean(),
  permalink: z.string().optional(),
  teamId: z.string().optional(),
  text: z.string(),
  threadId: z.string().optional(),
  timestamp: z.string().optional(),
  context: z.object({
    after: z.array(z.string()),
    before: z.array(z.string()),
  }),
});

const fileResultSchema = z.object({
  type: z.literal("file"),
  title: z.string(),
  filetype: z.string(),
  author: z.string(),
  channel: z.string(),
  channelId: z.string().optional(),
  permalink: z.string().optional(),
  url: z.string().optional(),
  preview: z.string().optional(),
  teamId: z.string().optional(),
  timestamp: z.string().optional(),
});

const mapAssistantFile = (file: AssistantSearchFileResult) => ({
  type: "file" as const,
  title: file.title || file.name || "untitled",
  filetype: file.filetype ?? "unknown",
  author: file.username?.trim() || "unknown",
  channel: file.channel_name
    ? `#${file.channel_name}`
    : (file.channel_id ?? "unknown"),
  channelId: file.channel_id,
  permalink: file.permalink,
  url: file.url_private,
  preview: file.preview
    ? truncateSnippet(file.preview, SLACK_SEARCH_SNIPPET_MAX_CHARS)
    : undefined,
  teamId: file.team_id,
  timestamp: file.created
    ? new Date(file.created * 1000).toISOString()
    : undefined,
});

const mapAssistantMessage = (message: AssistantSearchMessageResult) => {
  const messageTs = message.message_ts ?? message.thread_ts ?? "";
  const threadTs = message.thread_ts ?? message.message_ts ?? "";
  return {
    type: "message" as const,
    author:
      message.author_name?.trim() ||
      (message.is_author_bot ? "slack bot" : "unknown"),
    channel: message.channel_name
      ? `#${message.channel_name}`
      : (message.channel_id ?? "unknown"),
    channelId: message.channel_id,
    isAuthorBot: message.is_author_bot ?? false,
    permalink: message.permalink,
    teamId: message.team_id,
    text: truncateSnippet(
      message.content ?? "",
      SLACK_SEARCH_SNIPPET_MAX_CHARS,
    ),
    threadId:
      message.channel_id && threadTs
        ? `slack:${message.channel_id}:${threadTs}`
        : undefined,
    timestamp: messageTs ? getISOFromSlackTimestamp(messageTs) : undefined,
    context: {
      after: formatContextMessages(message.context_messages?.after),
      before: formatContextMessages(message.context_messages?.before),
    },
  };
};

const mapSearchMessageMatch = (match: SlackSearchMessageMatch) => {
  const messageTs = match.ts ?? "";
  return {
    type: "message" as const,
    author: match.username?.trim() || "unknown",
    channel: match.channel?.name
      ? `#${match.channel.name}`
      : (match.channel?.id ?? "unknown"),
    channelId: match.channel?.id,
    isAuthorBot: false,
    permalink: match.permalink,
    teamId: match.team,
    text: truncateSnippet(match.text ?? "", SLACK_SEARCH_SNIPPET_MAX_CHARS),
    threadId:
      match.channel?.id && messageTs
        ? `slack:${match.channel.id}:${messageTs}`
        : undefined,
    timestamp: messageTs ? getISOFromSlackTimestamp(messageTs) : undefined,
    context: { after: [] as string[], before: [] as string[] },
  };
};

const mapSearchFileMatch = (match: SlackSearchFileMatch) => ({
  type: "file" as const,
  title: match.title || match.name || "untitled",
  filetype: match.filetype ?? "unknown",
  author: match.username?.trim() || "unknown",
  channel: match.channels?.[0] ?? "unknown",
  channelId: match.channels?.[0],
  permalink: match.permalink,
  url: match.url_private,
  preview: undefined as string | undefined,
  teamId: undefined as string | undefined,
  timestamp: match.created
    ? new Date(match.created * 1000).toISOString()
    : undefined,
});

const cleanQuery = (query: string): string =>
  query
    .replace(/<@([A-Z0-9]+)>/gi, "@$1")
    .replace(/<#([A-Z0-9]+)\|([^>]+)>/g, "#$2")
    .replace(/<([^>|]+)\|([^>]+)>/g, "$2")
    .replace(/<([^>]+)>/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

const shouldFallbackToLegacySearch = (error: unknown): boolean =>
  ["not_allowed_token_type", "method_not_supported_for_channel_type"].includes(
    getSlackErrorCode(error) ?? "",
  );

const slackSearchResultSchema = z.object({
  query: z.string(),
  results: z.object({
    messages: z.array(messageResultSchema),
    files: z.array(fileResultSchema),
  }),
  searched: z.object({
    contextChannelId: z.string().optional(),
    nextCursor: z.string().optional(),
    teamId: z.string().optional(),
  }),
});

interface SlackSearchToolContext {
  budget?: SlackSearchBudget;
  currentMessage?: ChatSDK.Message;
  slack: SlackAdapter;
  thread: ChatSDK.Thread;
}

export const slackSearch = ({
  budget,
  currentMessage,
  slack,
  thread,
}: SlackSearchToolContext) =>
  defineTool({
    description:
      'Search Slack using Slack\'s Real-time Search API. Best for workspace-wide discovery: finding where a topic came up, who mentioned it, old threads, or files across channels. Use slack_channel_history instead for recent context in a known/current channel. Searches the full available history of the workspace; to narrow by date, include Slack search operators in the query itself (e.g. "after:2024-01-01", "before:2024-06-30", "during:january"). Results include permalink URLs — always include these links in your response so users can jump to the original message.',
    inputSchema: z.object({
      query: z
        .string()
        .min(2)
        .describe(
          "Short, discriminative Slack search query. Prefer names, project terms, quoted phrases, or unique keywords over full user questions. Supports Slack search operators like in:#channel, from:@user, after:YYYY-MM-DD, before:YYYY-MM-DD, has:link, has:file.",
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe(
          `Maximum number of matching results to return (default ${SLACK_SEARCH_DEFAULT_LIMIT}). Slack enforces its own per-method ceiling and will surface an error if exceeded.`,
        ),
    }),
    resultSchema: slackSearchResultSchema,
    errorFallback: "slack real-time search failed unexpectedly",
    execute: async ({ query, limit = SLACK_SEARCH_DEFAULT_LIMIT }) => {
      if (budget && !budget.tryConsume()) {
        return toolErr(
          "slack_api",
          `slack search budget exhausted after ${SLACK_SEARCH_MAX_CALLS_PER_QUERY_COUNT} attempts. try narrower keywords or wait for Slack rate limits to clear.`,
          { code: "slack_search_budget_exhausted" },
        );
      }

      const span = pookiebotTracer.startSpan("slack.search.execute");
      try {
        await thread.startTyping("Searching Slack...");

        const cleanedQuery = cleanQuery(query);
        if (!cleanedQuery) {
          return toolErr(
            "validation",
            "Search query was empty after cleaning Slack formatting",
          );
        }

        const { actionToken, client, contextChannelId, teamId, userToken } =
          await resolveSearchContext(slack, thread, currentMessage);

        // action_token scopes results to the requesting user — preferred for multi-user workspaces.
        // Without it, fall back to the installer's userToken (broader but not per-user).
        // Bot-only: limited to public channels the bot is in.
        const sendActionToken = Boolean(actionToken);
        const useUserTokenClient = !sendActionToken && Boolean(userToken);

        const searchClient = useUserTokenClient
          ? new SlackAPI.WebClient(userToken, slackSearchWebClientOptions)
          : client;
        const canUseAssistantSearch = sendActionToken || useUserTokenClient;

        const tokenStrategy = sendActionToken
          ? "action_token"
          : useUserTokenClient
            ? "installer_user_token"
            : "bot_only";
        span.setAttribute("slack.search.token_strategy", tokenStrategy);
        span.setAttribute(
          "slack.search.token_type",
          useUserTokenClient ? "user" : "bot",
        );
        span.setAttribute("slack.search.has_action_token", sendActionToken);

        let messages: ReturnType<typeof mapAssistantMessage>[] | undefined;
        let files: ReturnType<typeof mapAssistantFile>[] | undefined;
        let nextCursor: string | undefined;

        if (canUseAssistantSearch) {
          try {
            const result: AssistantSearchResponse = await searchClient.apiCall(
              "assistant.search.context",
              {
                channel_types: [
                  "public_channel",
                  "private_channel",
                  "mpim",
                  "im",
                ],
                content_types: ["messages", "files"],
                include_bots: true,
                include_context_messages: true,
                limit,
                query: cleanedQuery,
                ...(sendActionToken ? { action_token: actionToken } : {}),
                ...(contextChannelId
                  ? { context_channel_id: contextChannelId }
                  : {}),
              },
            );
            messages = (result.results?.messages ?? []).map(
              mapAssistantMessage,
            );
            files = (result.results?.files ?? []).map(mapAssistantFile);
            nextCursor = result.next_cursor;
            span.setAttribute(
              "slack.search.method",
              "assistant.search.context",
            );
          } catch (error) {
            if (!shouldFallbackToLegacySearch(error)) throw error;
            span.setAttribute(
              "slack.search.fallback_reason",
              getSlackErrorCode(error) ?? "unknown",
            );
          }
        }

        if (!messages || !files) {
          const messagesResponse = await searchClient.search.messages({
            query: cleanedQuery,
            count: limit,
            sort: "timestamp",
            sort_dir: "desc",
          });
          messages = (messagesResponse.messages?.matches ?? []).map(
            mapSearchMessageMatch,
          );
          files =
            messages.length === 0
              ? ((
                  await searchClient.search.files({
                    query: cleanedQuery,
                    count: limit,
                    sort: "timestamp",
                    sort_dir: "desc",
                  })
                ).files?.matches?.map(mapSearchFileMatch) ?? [])
              : [];
          span.setAttribute(
            "slack.search.legacy_files_skipped",
            messages.length > 0,
          );
          span.setAttribute("slack.search.method", "legacy_search");
        }

        const total = messages.length + files.length;
        span.setAttribute("slack.search.total_count", total);
        span.setStatus({ code: SpanStatusCode.OK });

        return toolResult({
          query: cleanedQuery,
          results: { messages, files },
          searched: { contextChannelId, nextCursor, teamId },
        });
      } catch (error) {
        recordSpanError(span, error);
        throw error;
      } finally {
        span.end();
      }
    },
    toModelOutput: (output) => {
      if (output.type === "error") return output.error.message;
      const { query, results } = output.result;
      const total = results.messages.length + results.files.length;
      if (total === 0)
        return `No Slack search results found for "${query}". If this seems incomplete, try alternate keywords, Slack search operators (after:, before:, in:#channel, from:@user), slack_channel_history for a known channel, or another source.`;

      const messageLines = results.messages.map(
        (message) =>
          `- ${message.author} in ${message.channel}: "${message.text}"${message.permalink ? ` (<${message.permalink}|${message.channel} thread>)` : ""}`,
      );
      const fileLines = results.files.map(
        (file) =>
          `- file "${file.title}" in ${file.channel}${file.permalink ? ` (<${file.permalink}|${file.title}>)` : ""}`,
      );
      const renderingHint =
        total >= 2
          ? "Render these as a single <card> with one row per hit (channel · author title link in row.text, snippet/context in row.context). Do NOT inline these as numbered/bulleted prose. The <url|label> strings below are already formed — pass them through verbatim. Do NOT wrap them in [text](<url|label>) markdown syntax (it collapses to a broken 3-pipe shape) and do NOT prepend your own label."
          : "Include the permalink as the <url|label> string given below verbatim. Never re-wrap as [text](<url|label>) and never prepend a leading label like <text|<url|label>> — Slack mrkdwn links are exactly two pipe-separated parts (URL first, label second).";
      return `Found ${results.messages.length} message(s) and ${results.files.length} file(s) for "${query}". ${renderingHint}\n${[...messageLines, ...fileLines].join("\n")}`;
    },
  });
