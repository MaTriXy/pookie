export const TYPING_INDICATOR_REFRESH_INTERVAL_MS = 5000;

// Per-thread generation lock TTL. A crashed invocation auto-releases
// after this window so a thread is never permanently blocked.
export const THREAD_LOCK_TTL_SECONDS = 120;

// Suppress duplicate MCP reauth ephemeral notices within the same
// thread — once shown, the user has the link and doesn't need a
// repeat on every subsequent message.
export const REAUTH_NOTICE_TTL_SECONDS = 3600;

// How many additional generation rounds the lock holder runs after
// draining queued follow-up messages. Bounds cost when a bursty
// thread fires many messages while the agent is responding.
export const MAX_FOLLOW_UP_ROUNDS = 4;

// Cap on hosted-tool calls (web_search, image_generation, code_interpreter,
// tool_search) per model response. Each is billable; this guards against a
// runaway model racking up cost in a single turn. stepCountIs(100) caps the
// outer loop separately.
export const MAX_BUILTIN_TOOL_CALLS_PER_RESPONSE = 30;

export const CARD_TITLE_MAX_CHARS = 150;
export const CARD_SUBTITLE_MAX_CHARS = 150;
export const CARD_TEXT_MAX_CHARS = 3000;
export const CARD_FIELD_LABEL_MAX_CHARS = 2000;
export const CARD_FIELD_VALUE_MAX_CHARS = 2000;
export const CARD_LINK_LABEL_MAX_CHARS = 75;
export const CARD_BUTTON_LABEL_MAX_CHARS = 75;
export const CARD_TABLE_CELL_MAX_CHARS = 1000;
export const CARD_HEADER_MAX_CHARS = 150;
export const CARD_QUOTE_AUTHOR_MAX_CHARS = 100;
export const CARD_QUOTE_TIMESTAMP_MAX_CHARS = 50;
export const CARD_FILE_NAME_MAX_CHARS = 200;
export const CARD_FILE_MIME_MAX_CHARS = 100;
export const CARD_CODE_LANGUAGE_MAX_CHARS = 40;
export const CARD_CODE_FILENAME_MAX_CHARS = 200;
// Slack's section text limit is ~3000 chars. The renderer wraps `code.content`
// in ```\n...\n``` (8 chars overhead) so the schema cap must leave headroom.
export const CARD_CODE_CONTENT_MAX_CHARS = 2900;

export const TRACE_FOOTER_CHANNEL_NAME = "pookie-debug";

// Privacy: only these Slack workspaces opt in to AI SDK telemetry
// and verbose logging. All other workspaces get zero data collection.
export const TRACING_ALLOWED_WORKSPACE_IDS: readonly string[] = [
  "T06F418RJ3H", // Million
];
