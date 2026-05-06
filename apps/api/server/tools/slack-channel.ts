import { SpanStatusCode } from "@opentelemetry/api";
import { z } from "zod";

import { defineTool } from "../agent/define-tool";
import { toolErr, toolResult } from "../agent/tool-result";
import { extractSlackChannelId } from "../slack/schemas";
import {
  buildSlackAccessNotFoundError,
  getChannelDisplayName,
  normalizeToolError,
} from "../utils/normalize-tool-error";
import { recordSpanError } from "../utils/record-span-error";
import { getISOFromSlackTimestamp } from "../utils/slack-timestamp";
import { slackTracer } from "../utils/slack-tracer";
import { truncateSnippet } from "../utils/truncate-snippet";
import {
  SLACK_CANVAS_MARKDOWN_MAX_CHARS,
  SLACK_CHANNEL_ACCESS_CHECK_LIMIT,
  SLACK_CHANNEL_HISTORY_DEFAULT_LIMIT,
  SLACK_CHANNEL_LIST_DEFAULT_LIMIT,
  SLACK_CHANNEL_LIST_PAGE_SIZE,
  SLACK_CHANNEL_RESOLVE_MAX_PAGES,
  SLACK_FILE_CONTENT_MAX_BYTES,
  SLACK_FILE_CONTENT_MAX_CHARS,
  SLACK_MESSAGE_SNIPPET_MAX_CHARS,
  SLACK_THREAD_DEFAULT_LIMIT,
} from "./constants";
import { resolveTokenContext } from "./slack-search";

import type { SlackAdapter } from "@chat-adapter/slack";
import type * as SlackAPI from "@slack/web-api";
import type * as ChatSDK from "chat";

import type { PookieToolError, PookieToolResult } from "../agent/tool-result";
import type {
  SlackChannel,
  SlackChannelLike,
  SlackFileLike,
  SlackMessage,
} from "../slack/types";

interface SlackChannelToolContext {
  currentMessage?: ChatSDK.Message;
  slack: SlackAdapter;
  thread: ChatSDK.Thread;
}

interface SlackSession {
  botToken?: string;
  client: SlackAPI.WebClient;
  teamId?: string;
  userCache: Map<string, string>;
  userToken?: string;
}

interface SlackChannelFetchOptions {
  filter?: string;
  includePrivate: boolean;
  limit: number;
  stopOnExactName?: boolean;
}

interface SlackChannelResolution {
  channel: string;
  matchedChannel?: FormattedSlackChannel;
}

interface SlackFileContentResult {
  completeness: "full" | "preview" | "unavailable";
  content?: string;
  source?: string;
  unavailableReason?: "missing_user_token" | "other";
}

// Slack's huddle_thread subtype carries `room` data that the SDK's auto-generated
// MessageElement doesn't expose. We widen SlackMessage at the formatter boundary.
type SlackMessageWithRoom = SlackMessage & {
  room?: { id?: string; name?: string; participant_history?: string[] };
};

const formattedSlackChannelSchema = z.object({
  id: z.string().optional(),
  isArchived: z.boolean().optional(),
  isMember: z.boolean().optional(),
  isPrivate: z.boolean().optional(),
  name: z.string().optional(),
  numMembers: z.number().optional(),
  topic: z.string().optional(),
});

type FormattedSlackChannel = z.infer<typeof formattedSlackChannelSchema>;

const formattedSlackFileSchema = z.object({
  filetype: z.string().optional(),
  id: z.string().optional(),
  mimetype: z.string().optional(),
  name: z.string().optional(),
  permalink: z.string().optional(),
  prettyType: z.string().optional(),
  preview: z.string().optional(),
  title: z.string().optional(),
});

const formattedSlackMessageSchema = z.object({
  author: z.string(),
  files: z.array(formattedSlackFileSchema).optional(),
  isHuddle: z.boolean(),
  replyCount: z.number().optional(),
  room: z
    .object({
      id: z.string().optional(),
      name: z.string().optional(),
      participantIds: z.array(z.string()).optional(),
    })
    .optional(),
  subtype: z.string().optional(),
  text: z.string(),
  threadTs: z.string().optional(),
  timestamp: z.string().optional(),
  ts: z.string().optional(),
});

const getAttachmentText = (message: SlackMessage): string | undefined =>
  message.attachments
    ?.flatMap((attachment) => [
      attachment.pretext,
      attachment.title,
      attachment.text,
      attachment.fallback,
    ])
    .filter((value): value is string => Boolean(value?.trim()))
    .join("\n");

const formatSlackChannel = (
  channel: SlackChannelLike,
): FormattedSlackChannel => ({
  id: channel.id,
  isArchived: channel.is_archived,
  isMember: channel.is_member,
  isPrivate: channel.is_private,
  name: channel.name,
  numMembers: channel.num_members,
  topic: channel.topic?.value,
});

const formatSlackFile = (file: SlackFileLike) => ({
  filetype: file.filetype,
  id: file.id,
  mimetype: file.mimetype,
  name: file.name,
  permalink: file.permalink,
  prettyType: file.pretty_type,
  preview: file.preview ?? file.preview_highlight ?? file.plain_text,
  title: file.title,
});

const buildChannelToolError = (
  caughtError: unknown,
  fallback: string,
  channel?: string,
  matchedChannel?: FormattedSlackChannel,
): PookieToolError =>
  normalizeToolError(caughtError, fallback, {
    channelDisplayName: getChannelDisplayName(channel, matchedChannel?.name),
  });

const normalizeChannelInput = (channel: string): string => {
  const trimmed = channel.trim();
  const mentionMatch = trimmed.match(/^<#([A-Z0-9]+)(?:\|[^>]+)?>$/i);
  if (mentionMatch?.[1]) return mentionMatch[1];
  return trimmed.replace(/^#/, "");
};

const isSlackChannelId = (channel: string): boolean =>
  /^[CGD][A-Z0-9]{8,}$/.test(channel);

const fetchVisibleChannels = async (
  session: SlackSession,
  options: SlackChannelFetchOptions,
): Promise<{ channels: SlackChannel[]; hasMore: boolean }> => {
  const channels: SlackChannel[] = [];
  const normalizedFilter = options.filter?.toLowerCase();
  let cursor: string | undefined;
  let pageCount = 0;

  do {
    const response = await session.client.conversations.list({
      ...(cursor !== undefined ? { cursor } : {}),
      exclude_archived: true,
      limit: SLACK_CHANNEL_LIST_PAGE_SIZE,
      types: options.includePrivate
        ? "public_channel,private_channel"
        : "public_channel",
    });

    for (const channel of response.channels ?? []) {
      const channelName = channel.name?.toLowerCase();
      const isExactMatch =
        normalizedFilter !== undefined && channelName === normalizedFilter;
      if (options.stopOnExactName) {
        if (isExactMatch) return { channels: [channel], hasMore: false };
        continue;
      }

      const isMatch = normalizedFilter
        ? channelName?.includes(normalizedFilter)
        : true;
      if (isMatch) channels.push(channel);
      if (channels.length >= options.limit) {
        return {
          channels,
          hasMore: Boolean(response.response_metadata?.next_cursor),
        };
      }
    }

    cursor = response.response_metadata?.next_cursor || undefined;
    pageCount += 1;
  } while (cursor && pageCount < SLACK_CHANNEL_RESOLVE_MAX_PAGES);

  return { channels, hasMore: Boolean(cursor) };
};

const resolveSlackChannel = async (
  session: SlackSession,
  channel: string | undefined,
  currentMessage?: ChatSDK.Message,
): Promise<PookieToolResult<SlackChannelResolution>> => {
  const fallbackChannel = extractSlackChannelId(currentMessage?.raw);
  if (!channel && fallbackChannel)
    return toolResult({ channel: fallbackChannel });
  if (!channel) {
    return toolErr(
      "validation",
      "Need a channel ID or channel name. If you're asking about the current channel, mention the channel like #channel-name or invite Pookie to the channel first.",
    );
  }

  const normalizedChannel = normalizeChannelInput(channel);
  if (isSlackChannelId(normalizedChannel))
    return toolResult({ channel: normalizedChannel });

  const { channels } = await fetchVisibleChannels(session, {
    filter: normalizedChannel,
    includePrivate: true,
    limit: SLACK_CHANNEL_ACCESS_CHECK_LIMIT,
    stopOnExactName: true,
  });
  const matchedChannel =
    channels.find(
      (visibleChannel) =>
        visibleChannel.name?.toLowerCase() === normalizedChannel.toLowerCase(),
    ) ?? channels[0];

  if (matchedChannel?.id) {
    return toolResult({
      channel: matchedChannel.id,
      matchedChannel: formatSlackChannel(matchedChannel),
    });
  }

  return buildSlackAccessNotFoundError(channel);
};

const parseSlackFileId = (value: string): string | undefined => {
  const fileIdMatch = value.match(
    /(?:^|[^A-Z0-9])(F[A-Z0-9]{8,})(?:$|[^A-Z0-9])/i,
  );
  if (fileIdMatch?.[1]) return fileIdMatch[1];

  const parsedUrl = URL.canParse(value) ? new URL(value) : undefined;
  return parsedUrl?.pathname
    .split("/")
    .find((pathPart) => /^F[A-Z0-9]+$/i.test(pathPart));
};

const isCanvasFile = (file: SlackFileLike): boolean => {
  const filetype = file.filetype?.toLowerCase() ?? "";
  const prettyType = file.pretty_type?.toLowerCase() ?? "";
  return filetype === "canvas" || prettyType.includes("canvas");
};

const isHtmlContent = (content: string): boolean => {
  const prefix = content.slice(0, 500).toLowerCase();
  return (
    prefix.includes("<!doctype html") ||
    prefix.includes("<html") ||
    prefix.includes("<div") ||
    prefix.includes("<p") ||
    prefix.includes("<h1")
  );
};

const isSlackLoginPage = (content: string): boolean => {
  const lower = content.toLowerCase();
  return (
    lower.includes("sign in to slack") ||
    lower.includes("slack-edge.com/bv1") ||
    (lower.includes("<form") && lower.includes("signin"))
  );
};

const extractMarkdownFromHtml = async (html: string): Promise<string> => {
  const { Defuddle } = await import("defuddle/node");
  const wrappedHtml = html.trimStart().startsWith("<!")
    ? html
    : `<!DOCTYPE html><html><head><title>canvas</title></head><body>${html}</body></html>`;
  const result = await Defuddle(wrappedHtml);
  return (result.content ?? result.title ?? "").trim();
};

const isReadableSlackFile = (file: SlackFileLike): boolean => {
  const mimetype = file.mimetype?.toLowerCase() ?? "";
  const filetype = file.filetype?.toLowerCase() ?? "";
  if (isCanvasFile(file)) return true;
  if (mimetype.startsWith("text/")) return true;
  if (mimetype.includes("json") || mimetype.includes("xml")) return true;
  if (mimetype === "application/vnd.slack-docs") return true;
  return [
    "canvas",
    "html",
    "huddle_transcript",
    "markdown",
    "post",
    "quip",
    "text",
  ].includes(filetype);
};

const getSlackFileText = (file: SlackFileLike): SlackFileContentResult => {
  const content = [file.plain_text, file.preview, file.preview_highlight]
    .find((value) => Boolean(value?.trim()))
    ?.slice(0, SLACK_FILE_CONTENT_MAX_CHARS);
  return {
    completeness: content ? "preview" : "unavailable",
    content,
    source: content ? "slack file metadata preview" : undefined,
  };
};

// Slack embeds huddle transcriptions directly in the file object from files.info.
// The field isn't in our SlackFileLike Pick, so we access it dynamically.
interface HuddleTranscriptionLine {
  contents?: string;
  speaker_id?: string;
}

const extractHuddleTranscription = (file: object): string | undefined => {
  const transcription = (file as Record<string, unknown>)
    .huddle_transcription as { lines?: HuddleTranscriptionLine[] } | undefined;
  if (!transcription?.lines?.length) return undefined;

  const text = transcription.lines
    .filter((line): line is HuddleTranscriptionLine & { contents: string } =>
      Boolean(line.contents?.trim()),
    )
    .map((line) =>
      line.speaker_id
        ? `<@${line.speaker_id}>: ${line.contents}`
        : line.contents,
    )
    .join("\n");

  return text.length > 0
    ? text.slice(0, SLACK_FILE_CONTENT_MAX_CHARS)
    : undefined;
};

const UNAVAILABLE_FILE_CONTENT: SlackFileContentResult = {
  completeness: "unavailable",
  unavailableReason: "other",
};

const readSlackFileContent = async (
  session: SlackSession,
  file: SlackFileLike,
): Promise<SlackFileContentResult> => {
  return slackTracer.startActiveSpan("slack.file.download", async (span) => {
    const url = file.url_private_download ?? file.url_private;
    const isCanvas = isCanvasFile(file);
    const isReadable = isReadableSlackFile(file);
    const fileReadToken = session.userToken ?? session.botToken;

    span.setAttribute("slack.file.filetype", file.filetype ?? "");
    span.setAttribute("slack.file.is_canvas", isCanvas);
    span.setAttribute("slack.file.has_url", Boolean(url));
    span.setAttribute(
      "slack.file.token_type",
      session.userToken ? "user" : "bot",
    );

    try {
      if (!fileReadToken) {
        span.setAttribute(
          "slack.file.unavailable_reason",
          "missing_file_token",
        );
        return UNAVAILABLE_FILE_CONTENT;
      }

      if (!url) {
        span.setAttribute(
          "slack.file.unavailable_reason",
          "missing_private_url",
        );
        return UNAVAILABLE_FILE_CONTENT;
      }

      if (!isReadable) {
        span.setAttribute(
          "slack.file.unavailable_reason",
          "unreadable_filetype",
        );
        return UNAVAILABLE_FILE_CONTENT;
      }

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${fileReadToken}` },
      });

      if (!response.ok) {
        span.setAttribute("slack.file.unavailable_reason", "download_not_ok");
        return UNAVAILABLE_FILE_CONTENT;
      }

      const contentLength = Number(response.headers.get("content-length"));
      if (
        Number.isFinite(contentLength) &&
        contentLength > SLACK_FILE_CONTENT_MAX_BYTES
      ) {
        span.setAttribute("slack.file.unavailable_reason", "content_too_large");
        return UNAVAILABLE_FILE_CONTENT;
      }

      const content = await response.text();

      let finalContent = content;
      let extractionSource = "slack private file download";
      let didExtractFromHtml = false;
      const contentIsHtml = isHtmlContent(content);
      span.setAttribute("slack.file.content_is_html", contentIsHtml);

      if (contentIsHtml && isSlackLoginPage(content)) {
        const needsUserToken = !session.userToken;
        span.setAttribute("slack.file.unavailable_reason", "slack_login_page");
        span.setAttribute("slack.file.needs_user_token", needsUserToken);
        return {
          completeness: "unavailable" as const,
          unavailableReason: needsUserToken
            ? ("missing_user_token" as const)
            : ("other" as const),
        };
      }

      if (contentIsHtml) {
        const extractedMarkdown = await extractMarkdownFromHtml(content);
        if (extractedMarkdown.length > 0) {
          finalContent = extractedMarkdown;
          extractionSource = "slack canvas html extraction (defuddle)";
          didExtractFromHtml = true;
        }
      }

      const result = {
        completeness: didExtractFromHtml || !isCanvas ? "full" : "preview",
        content: finalContent.slice(0, SLACK_FILE_CONTENT_MAX_CHARS),
        source: extractionSource,
      } satisfies SlackFileContentResult;

      span.setAttribute("slack.file.content_completeness", result.completeness);
      span.setAttribute("slack.file.content_chars", result.content.length);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      recordSpanError(span, error);
      throw error;
    } finally {
      span.end();
    }
  });
};

const resolveUserName = async (
  session: SlackSession,
  userId: string,
): Promise<string> => {
  const cached = session.userCache.get(userId);
  if (cached) return cached;

  try {
    const response = await session.client.users.info({ user: userId });
    const user = response.user;
    const name =
      user?.profile?.display_name ||
      user?.profile?.real_name ||
      user?.real_name ||
      user?.name ||
      userId;
    session.userCache.set(userId, name);
    return name;
  } catch {
    return userId;
  }
};

const formatSlackMessage = async (
  session: SlackSession,
  message: SlackMessageWithRoom,
) => {
  const author = message.user
    ? await resolveUserName(session, message.user)
    : (message.bot_id ?? "unknown");
  const text = truncateSnippet(
    message.text || getAttachmentText(message) || "",
    SLACK_MESSAGE_SNIPPET_MAX_CHARS,
  );

  return {
    author,
    files: message.files?.map(formatSlackFile),
    isHuddle: message.subtype === "huddle_thread",
    replyCount: message.reply_count,
    room: message.room
      ? {
          id: message.room.id,
          name: message.room.name,
          participantIds: message.room.participant_history,
        }
      : undefined,
    subtype: message.subtype,
    text,
    threadTs: message.thread_ts ?? message.ts,
    timestamp: message.ts ? getISOFromSlackTimestamp(message.ts) : undefined,
    ts: message.ts,
  };
};

const parseSlackPermalink = (
  permalink: string,
): { channel: string; messageTs: string; threadTs?: string } | undefined => {
  const parsedUrl = URL.canParse(permalink) ? new URL(permalink) : undefined;
  const pathParts = parsedUrl?.pathname.split("/").filter(Boolean) ?? [];
  const channel = pathParts.at(-2);
  const encodedTimestamp = pathParts.at(-1);
  if (!channel || !encodedTimestamp?.startsWith("p")) return undefined;

  const timestampDigits = encodedTimestamp.slice(1);
  if (timestampDigits.length < 7) return undefined;

  const messageTs = `${timestampDigits.slice(0, -6)}.${timestampDigits.slice(-6)}`;
  return {
    channel,
    messageTs,
    threadTs: parsedUrl?.searchParams.get("thread_ts") ?? undefined,
  };
};

const formatMessagesForModel = (
  messages: { author: string; text: string; timestamp?: string; ts?: string }[],
): string =>
  messages
    .map((message) => {
      // Use full-precision `ts` (microseconds) over `timestamp` (ISO ms via
      // `new Date`). The model builds slack permalinks from this string;
      // ms-precision drops the trailing 3 µs digits and produces broken
      // `p<seconds><ms>000` URLs.
      const time = message.ts ?? message.timestamp ?? "";
      const text = message.text || "(no text)";
      return `[${time}] ${message.author}: ${text}`;
    })
    .join("\n");

const formatToolErrorForModel = (error: PookieToolError["error"]): string =>
  [error.message, error.instructions].filter(Boolean).join("\n");

const channelHistoryResultSchema = z.object({
  channel: z.string(),
  hasMore: z.boolean(),
  messageCount: z.number(),
  messages: z.array(formattedSlackMessageSchema),
  resolvedChannel: formattedSlackChannelSchema.optional(),
});

const threadResultSchema = z.object({
  channel: z.string(),
  messageCount: z.number(),
  messages: z.array(formattedSlackMessageSchema),
  threadTs: z.string(),
  resolvedChannel: formattedSlackChannelSchema.optional(),
});

const fileResultSchema = z.object({
  file: formattedSlackFileSchema,
  content: z.string().optional(),
  contentCompleteness: z.enum(["full", "preview", "unavailable"]),
  contentSource: z.string().optional(),
  isCanvas: z.boolean(),
  nextSteps: z.array(z.string()).optional(),
  readable: z.boolean(),
});

const accessCheckResultSchema = z.object({
  canReadHistory: z.literal(true),
  channel: formattedSlackChannelSchema.optional(),
});

const channelListResultSchema = z.object({
  channelCount: z.number(),
  channels: z.array(formattedSlackChannelSchema),
  hasMore: z.boolean(),
  missingChannelInstructions: z.string(),
});

export const slackChannelTools = ({
  currentMessage,
  slack,
  thread,
}: SlackChannelToolContext) => {
  let session: SlackSession | undefined;
  const getSession = async (): Promise<SlackSession> => {
    if (!session) {
      const tokenContext = await resolveTokenContext(
        slack,
        thread,
        currentMessage,
      );
      session = { ...tokenContext, userCache: new Map() };
    }
    return session;
  };

  const resolveChannelContext = async (
    channel: string | undefined,
  ): Promise<
    PookieToolResult<{
      activeSession: SlackSession;
      effectiveChannel: string;
      matchedChannel?: FormattedSlackChannel;
    }>
  > => {
    const activeSession = await getSession();
    const resolvedChannel = await resolveSlackChannel(
      activeSession,
      channel,
      currentMessage,
    );
    if (resolvedChannel.type === "error") return resolvedChannel;
    return toolResult({
      activeSession,
      effectiveChannel: resolvedChannel.result.channel,
      matchedChannel: resolvedChannel.result.matchedChannel,
    });
  };

  const slack_channel_history = defineTool({
    description:
      "Read recent top-level messages from a Slack channel. Best for recent context in a known/current channel, finding what happened lately, or finding the last huddle_thread before reading its threadTs. Accepts a channel ID, #channel name, Slack channel mention, or plain channel name like general. If no channel is provided, uses the current channel.",
    inputSchema: z.object({
      channel: z
        .string()
        .optional()
        .describe(
          "Channel ID, #channel name, Slack channel mention, or plain channel name like general. Defaults to the current Slack channel.",
        ),
      latest: z
        .string()
        .optional()
        .describe(
          "Only messages before this Slack message ts string, e.g. 1712345678.000100",
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe(
          `Maximum messages to return (default ${SLACK_CHANNEL_HISTORY_DEFAULT_LIMIT}). Slack enforces its own per-method ceiling and will surface an error if exceeded.`,
        ),
      oldest: z
        .string()
        .optional()
        .describe(
          "Only messages after this Slack message ts string, e.g. 1712345678.000100",
        ),
    }),
    resultSchema: channelHistoryResultSchema,
    errorFallback: "failed to read channel history",
    execute: async ({
      channel,
      latest,
      limit = SLACK_CHANNEL_HISTORY_DEFAULT_LIMIT,
      oldest,
    }) => {
      await thread.startTyping("Reading Slack channel...");
      let effectiveChannel = channel;
      let matchedChannel: FormattedSlackChannel | undefined;

      try {
        const resolved = await resolveChannelContext(channel);
        if (resolved.type === "error") return resolved;
        const { activeSession } = resolved.result;
        ({ effectiveChannel, matchedChannel } = resolved.result);

        const response = await activeSession.client.conversations.history({
          channel: effectiveChannel,
          inclusive: true,
          ...(latest !== undefined ? { latest } : {}),
          limit,
          ...(oldest !== undefined ? { oldest } : {}),
        });
        const messages = await Promise.all(
          (response.messages ?? []).map((message) =>
            formatSlackMessage(activeSession, message as SlackMessageWithRoom),
          ),
        );

        return toolResult({
          channel: effectiveChannel,
          hasMore: response.has_more ?? false,
          messageCount: messages.length,
          messages,
          resolvedChannel: matchedChannel,
        });
      } catch (caughtError) {
        return buildChannelToolError(
          caughtError,
          "failed to read channel history",
          effectiveChannel,
          matchedChannel,
        );
      }
    },
    toModelOutput: (output) => {
      if (output.type === "error") return formatToolErrorForModel(output.error);
      const { messageCount, messages, hasMore, channel } = output.result;
      if (messageCount === 0) return `${channel}: No messages`;
      return `${channel} (${messageCount} messages${hasMore ? ", more available" : ""}):\n${formatMessagesForModel(messages)}`;
    },
  });

  const slack_read_thread = defineTool({
    description:
      "Fetch all messages in a Slack thread. Use after a Slack search result or slack_channel_history when the answer depends on replies, huddle details, or full thread context. Provide a permalink or a channel plus threadTs. The channel can be a channel ID, #channel name, Slack channel mention, or plain channel name like general. If channel is omitted, uses the current channel.",
    inputSchema: z.object({
      channel: z
        .string()
        .optional()
        .describe(
          "Channel ID, #channel name, Slack channel mention, or plain channel name like general. Defaults to the current Slack channel.",
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe(
          `Maximum messages to return (default ${SLACK_THREAD_DEFAULT_LIMIT}). Slack enforces its own per-method ceiling and will surface an error if exceeded.`,
        ),
      permalink: z.string().optional().describe("Slack message permalink URL"),
      threadTs: z
        .string()
        .optional()
        .describe("Thread parent Slack ts string, e.g. 1712345678.000100"),
    }),
    resultSchema: threadResultSchema,
    errorFallback: "failed to read thread",
    execute: async ({
      channel,
      limit = SLACK_THREAD_DEFAULT_LIMIT,
      permalink,
      threadTs,
    }) => {
      await thread.startTyping("Reading Slack thread...");

      const parsedPermalink = permalink
        ? parseSlackPermalink(permalink)
        : undefined;
      const effectiveThreadTs =
        parsedPermalink?.threadTs ?? parsedPermalink?.messageTs ?? threadTs;

      if (!effectiveThreadTs) {
        return toolErr(
          "validation",
          "Need a permalink or a threadTs with a channel ID",
        );
      }

      let effectiveChannel = parsedPermalink?.channel ?? channel;
      let matchedChannel: FormattedSlackChannel | undefined;

      try {
        const resolved = await resolveChannelContext(
          parsedPermalink?.channel ?? channel,
        );
        if (resolved.type === "error") return resolved;
        const { activeSession } = resolved.result;
        ({ effectiveChannel, matchedChannel } = resolved.result);

        const response = await activeSession.client.conversations.replies({
          channel: effectiveChannel,
          inclusive: true,
          limit,
          ts: effectiveThreadTs,
        });
        const messages = await Promise.all(
          (response.messages ?? []).map((message) =>
            formatSlackMessage(activeSession, message as SlackMessageWithRoom),
          ),
        );

        return toolResult({
          channel: effectiveChannel,
          messageCount: messages.length,
          messages,
          threadTs: effectiveThreadTs,
          resolvedChannel: matchedChannel,
        });
      } catch (caughtError) {
        return buildChannelToolError(
          caughtError,
          "failed to read thread",
          effectiveChannel,
          matchedChannel,
        );
      }
    },
    toModelOutput: (output) => {
      if (output.type === "error") return formatToolErrorForModel(output.error);
      const { channel, threadTs, messageCount, messages } = output.result;
      if (messageCount === 0) return `${channel}@${threadTs}: No messages`;
      return `${channel}@${threadTs} (${messageCount} messages):\n${formatMessagesForModel(messages)}`;
    },
  });

  const slack_read_file = defineTool({
    description:
      "Read Slack file metadata and text-like content by file ID, file permalink, or private file URL. Use this for huddle notes, canvases, text files, or attachments returned from slack_read_thread or slack_channel_history. If content is preview-only or unavailable, tell the user what could not be read and ask for the smallest missing text only when needed.",
    inputSchema: z.object({
      file: z
        .string()
        .min(1)
        .describe("Slack file ID, file permalink, or private file URL"),
    }),
    resultSchema: fileResultSchema,
    errorFallback: "failed to read file",
    execute: async ({ file }) => {
      return slackTracer.startActiveSpan(
        "slack.file.read_tool",
        async (span) => {
          span.setAttribute("slack.file.input_length", file.length);

          try {
            await thread.startTyping("Reading Slack file...");

            const fileId = parseSlackFileId(file);
            if (!fileId) {
              return toolErr(
                "validation",
                "Need a Slack file ID or file permalink",
              );
            }

            const activeSession = await getSession();

            const response = await activeSession.client.files.info({
              file: fileId,
            });

            if (!response.file) {
              return toolErr("slack_api", "Slack file was not found", {
                code: "file_not_found",
              });
            }

            const isCanvas = isCanvasFile(response.file);
            span.setAttribute(
              "slack.file.filetype",
              response.file.filetype ?? "",
            );
            span.setAttribute("slack.file.is_canvas", isCanvas);

            const downloadedContent = await readSlackFileContent(
              activeSession,
              response.file,
            );

            // Slack's `files.info` returns the actual text of small text files at the
            // response top level (`response.content`), not on `response.file`. When the
            // private-URL download fails (e.g. canvases, missing scopes), this is the
            // next-best source before falling back to metadata-only previews.
            const responseContent = response.content?.slice(
              0,
              SLACK_FILE_CONTENT_MAX_CHARS,
            );

            const huddleTranscript = extractHuddleTranscription(response.file);

            const fallbackContent = responseContent
              ? {
                  completeness: "full" as const,
                  content: responseContent,
                  source: "slack files.info response.content",
                }
              : huddleTranscript
                ? {
                    completeness: "full" as const,
                    content: huddleTranscript,
                    source: "slack files.info huddle_transcription",
                  }
                : getSlackFileText(response.file);

            const fileContent: SlackFileContentResult =
              downloadedContent.completeness !== "unavailable"
                ? downloadedContent
                : fallbackContent.completeness !== "unavailable"
                  ? fallbackContent
                  : {
                      completeness: "unavailable",
                      content: fallbackContent.content,
                      source: fallbackContent.source,
                      unavailableReason: downloadedContent.unavailableReason,
                    };
            span.setAttribute(
              "slack.file.final_completeness",
              fileContent.completeness,
            );
            span.setAttribute(
              "slack.file.content_chars",
              fileContent.content?.length ?? 0,
            );
            span.setStatus({ code: SpanStatusCode.OK });

            const needsReinstall =
              fileContent.unavailableReason === "missing_user_token";

            const nextSteps: string[] = [];
            if (needsReinstall) {
              nextSteps.push(
                "This file requires user-level access that the current installation doesn't have. Ask a workspace admin to re-install the app so it can read canvases and huddle notes.",
              );
            } else if (isCanvas && fileContent.completeness !== "full") {
              nextSteps.push(
                "Canvas content could not be fully extracted. Ask the user to paste the huddle notes text for a complete recap.",
              );
            }

            return toolResult({
              file: formatSlackFile(response.file),
              content: fileContent.content,
              contentCompleteness: fileContent.completeness,
              contentSource: fileContent.source,
              isCanvas,
              nextSteps: nextSteps.length > 0 ? nextSteps : undefined,
              readable: Boolean(fileContent.content),
            });
          } catch (caughtError) {
            recordSpanError(span, caughtError);
            throw caughtError;
          } finally {
            span.end();
          }
        },
      );
    },
    toModelOutput: (output) => {
      if (output.type === "error") return formatToolErrorForModel(output.error);
      const {
        file,
        content,
        readable,
        contentCompleteness,
        isCanvas,
        nextSteps,
      } = output.result;
      const header = `${file.title ?? file.name ?? file.id ?? "file"} (${file.prettyType ?? file.filetype ?? "unknown"})`;
      const link = file.permalink
        ? `\n<${file.permalink}|${file.title ?? file.name ?? "view file"}>`
        : "";
      const body =
        readable && content ? `\n\n${content}` : "\n(No readable content)";
      const completenessNote =
        contentCompleteness === "full"
          ? ""
          : `\n\n[Content completeness: ${contentCompleteness}${isCanvas ? ", canvas" : ""}]`;
      const guidance = nextSteps?.length ? `\n\n${nextSteps.join("\n")}` : "";
      return `${header}${link}${body}${completenessNote}${guidance}`;
    },
  });

  const slack_check_channel_access = defineTool({
    description:
      "Check whether Pookie can see and read a Slack channel. Accepts a channel ID, #channel name, or channel mention. If Pookie cannot access it, returns user-facing invite instructions.",
    inputSchema: z.object({
      channel: z
        .string()
        .optional()
        .describe(
          "Channel ID, #channel name, or Slack channel mention. Defaults to the current channel when available.",
        ),
    }),
    resultSchema: accessCheckResultSchema,
    errorFallback: "failed to check channel access",
    execute: async ({ channel }) => {
      await thread.startTyping("Checking Slack channel access...");
      let effectiveChannel = channel;
      let matchedChannel: FormattedSlackChannel | undefined;

      try {
        const resolved = await resolveChannelContext(channel);
        if (resolved.type === "error") return resolved;
        const { activeSession } = resolved.result;
        ({ effectiveChannel, matchedChannel } = resolved.result);

        const infoResponse = await activeSession.client.conversations.info({
          channel: effectiveChannel,
        });

        await activeSession.client.conversations.history({
          channel: effectiveChannel,
          limit: SLACK_CHANNEL_ACCESS_CHECK_LIMIT,
        });

        return toolResult({
          canReadHistory: true as const,
          channel: infoResponse.channel
            ? formatSlackChannel(infoResponse.channel)
            : matchedChannel,
        });
      } catch (caughtError) {
        return buildChannelToolError(
          caughtError,
          "failed to check channel access",
          effectiveChannel,
          matchedChannel,
        );
      }
    },
    toModelOutput: (output) => {
      if (output.type === "error") return formatToolErrorForModel(output.error);
      const display = getChannelDisplayName(
        undefined,
        output.result.channel?.name,
      );
      return `Can read ${display}`;
    },
  });

  const slack_list_channels = defineTool({
    description:
      "List Slack channels Pookie can see. Use this to find channel IDs, confirm visible channels, and explain that missing private channels require inviting Pookie.",
    inputSchema: z.object({
      filter: z
        .string()
        .optional()
        .describe("Filter channels whose name contains this text"),
      includePrivate: z
        .boolean()
        .optional()
        .describe("Include private channels visible to Pookie (default true)"),
      limit: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe(
          `Maximum channels to return (default ${SLACK_CHANNEL_LIST_DEFAULT_LIMIT}). Slack enforces its own per-method ceiling and will surface an error if exceeded.`,
        ),
    }),
    resultSchema: channelListResultSchema,
    errorFallback: "failed to list channels",
    execute: async ({
      filter,
      includePrivate = true,
      limit = SLACK_CHANNEL_LIST_DEFAULT_LIMIT,
    }) => {
      await thread.startTyping("Listing Slack channels...");

      const activeSession = await getSession();
      const listed = await fetchVisibleChannels(activeSession, {
        filter,
        includePrivate,
        limit,
      });
      const channels = listed.channels.map(formatSlackChannel);

      return toolResult({
        channelCount: channels.length,
        channels,
        hasMore: listed.hasMore,
        missingChannelInstructions:
          "If the channel is private or not listed here, Pookie likely has not been invited. Ask a channel member to open the channel and run `/invite @pookie`, or add Pookie from channel details > integrations/apps.",
      });
    },
    toModelOutput: (output) => {
      if (output.type === "error") return formatToolErrorForModel(output.error);
      const { channelCount, channels, hasMore, missingChannelInstructions } =
        output.result;
      if (channelCount === 0)
        return `No channels visible. ${missingChannelInstructions}`;
      const list = channels
        .map((channel) =>
          channel.name
            ? `#${channel.name}${channel.isPrivate ? " (private)" : ""} — ${channel.id}`
            : (channel.id ?? "unknown"),
        )
        .join("\n");
      return `${channelCount} channel(s)${hasMore ? " (more available)" : ""}:\n${list}\n\nIf the target channel is missing, ${missingChannelInstructions}`;
    },
  });

  const canvasCreateResultSchema = z.object({
    canvasId: z.string(),
    permalink: z.string().optional(),
    title: z.string(),
    sharedWithChannel: z.string().optional(),
  });

  const slack_create_canvas = defineTool({
    description:
      "Create a Slack canvas document with markdown content. Use for reports, summaries, analysis write-ups, or any structured content that benefits from a persistent, shareable document. Optionally share it with a channel. Supports headings (h1-h3), bold, italic, lists, code blocks, tables, dividers, checklists, links, and emoji. IMPORTANT: Canvas content is a formal document, not a chat message. Write the title and markdown body in standard professional casing (capitalize headings, sentences, and proper nouns normally) regardless of your chat personality style.",
    inputSchema: z.object({
      title: z.string().min(1).describe("Canvas title"),
      markdown: z
        .string()
        .min(1)
        .describe(
          "Canvas body content in markdown. Supports h1-h3, bold, italic, bulleted/ordered lists, checklists, code blocks, tables, dividers, links, and emoji.",
        ),
      channel: z
        .string()
        .optional()
        .describe(
          "Channel to share the canvas with (read access). Channel ID, #channel name, Slack channel mention, or plain channel name. If omitted, the canvas is created as a standalone document.",
        ),
    }),
    resultSchema: canvasCreateResultSchema,
    errorFallback: "failed to create canvas",
    execute: async ({ title, markdown, channel }) => {
      await thread.startTyping("Creating Slack canvas...");

      const trimmedMarkdown = markdown.slice(
        0,
        SLACK_CANVAS_MARKDOWN_MAX_CHARS,
      );
      const activeSession = await getSession();

      const createResponse = (await activeSession.client.apiCall(
        "canvases.create",
        {
          title,
          document_content: { type: "markdown", markdown: trimmedMarkdown },
        },
      )) as SlackAPI.WebAPICallResult & { canvas_id?: string };

      if (!createResponse.ok || !createResponse.canvas_id) {
        return toolErr("slack_api", "Canvas creation failed", {
          code:
            typeof createResponse.error === "string"
              ? createResponse.error
              : "canvas_creation_failed",
        });
      }

      const canvasId = createResponse.canvas_id;
      let sharedWithChannel: string | undefined;
      let permalink: string | undefined;

      try {
        const fileInfo = await activeSession.client.files.info({
          file: canvasId,
        });
        permalink = fileInfo.file?.permalink;
      } catch {
        // permalink lookup is best-effort
      }

      if (channel) {
        const resolved = await resolveChannelContext(channel);
        if (resolved.type === "error") {
          return toolResult({
            canvasId,
            permalink,
            title,
            sharedWithChannel: undefined,
          });
        }

        try {
          await activeSession.client.apiCall("canvases.access.set", {
            canvas_id: canvasId,
            access_level: "read",
            channel_ids: [resolved.result.effectiveChannel],
          });
          sharedWithChannel = resolved.result.effectiveChannel;
        } catch {
          // Canvas was created successfully — sharing failed but that's non-fatal
        }
      }

      return toolResult({ canvasId, permalink, title, sharedWithChannel });
    },
    toModelOutput: (output) => {
      if (output.type === "error") return formatToolErrorForModel(output.error);
      const {
        canvasId,
        permalink,
        title: canvasTitle,
        sharedWithChannel,
      } = output.result;
      const link = permalink
        ? `<${permalink}|${canvasTitle}>`
        : `"${canvasTitle}" (${canvasId})`;
      const sharing = sharedWithChannel
        ? `, shared with <#${sharedWithChannel}>`
        : "";
      return `Created canvas ${link}${sharing}. Always include the canvas link in your reply so the user can open it.`;
    },
  });

  return {
    slack_channel_history,
    slack_read_thread,
    slack_read_file,
    slack_check_channel_access,
    slack_list_channels,
    slack_create_canvas,
  };
};
