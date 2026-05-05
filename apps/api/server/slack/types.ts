import type { SlackInstallation } from "@chat-adapter/slack";
import type * as SlackEvents from "@slack/types";
import type * as SlackAPI from "@slack/web-api";

// `@chat-adapter/slack` types `SlackInstallation` with only `botToken`/`botUserId`/`teamName`,
// but the runtime carries an OAuth user-scoped token alongside the bot token. We persist it
// at install time and read it back where user-context APIs (search, file download) need it.
export type PookieSlackInstallation = SlackInstallation & {
  userToken?: string;
};

export type SlackEvent = SlackEvents.SlackEvent;

export type SlackIncomingMessageEvent =
  | SlackEvents.AppMentionEvent
  | SlackEvents.BotMessageEvent
  | SlackEvents.FileShareMessageEvent
  | SlackEvents.GenericMessageEvent
  | SlackEvents.ThreadBroadcastMessageEvent;

export type SlackEventTeamId =
  | SlackEvents.AppMentionEvent["team"]
  | SlackEvents.GenericMessageEvent["team"];

export type SlackMessage = NonNullable<
  SlackAPI.ConversationsHistoryResponse["messages"]
>[number];

export type SlackChannel = NonNullable<
  SlackAPI.ConversationsListResponse["channels"]
>[number];

export type SlackFile = NonNullable<SlackAPI.FilesInfoResponse["file"]>;

export type SlackSearchMessageMatch = NonNullable<
  NonNullable<SlackAPI.SearchMessagesResponse["messages"]>["matches"]
>[number];

export type SlackSearchFileMatch = NonNullable<
  NonNullable<SlackAPI.SearchFilesResponse["files"]>["matches"]
>[number];

// `messages[].files[]` (FileElement in ConversationsHistoryResponse) and `files.info` (File
// in FilesInfoResponse) are auto-generated as nominally distinct types whose deep fields
// diverge. We only ever read the leaf-string fields below; this Pick lets one formatter
// accept either source without `as` casts.
export type SlackFileLike = Pick<
  SlackFile,
  | "filetype"
  | "id"
  | "mimetype"
  | "name"
  | "permalink"
  | "pretty_type"
  | "preview"
  | "plain_text"
  | "preview_highlight"
  | "title"
  | "url_private"
  | "url_private_download"
>;

export type SlackChannelLike = Pick<
  SlackChannel,
  | "id"
  | "is_archived"
  | "is_member"
  | "is_private"
  | "name"
  | "num_members"
  | "topic"
>;
