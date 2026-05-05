import type * as ChatSDK from "chat";

import type { SlackIncomingMessageEvent } from "./types";

export interface SlackMessageRaw extends Pick<
  SlackIncomingMessageEvent,
  "text" | "thread_ts" | "ts"
> {}

export interface SlackThreadMessage {
  author?: Partial<ChatSDK.Message["author"]>;
  raw?: ChatSDK.Message["raw"];
}

export const hasSlackBotMention = (
  text: string | undefined,
  botUserId: string | undefined,
): boolean => Boolean(botUserId && text?.includes(`<@${botUserId}>`));

export const isTopLevelSlackMessage = (
  raw: SlackMessageRaw | undefined,
): boolean => {
  const threadTs = raw?.thread_ts;
  return !threadTs || threadTs === raw?.ts;
};

const isOwnBotMessage = (
  raw: unknown,
  botUserId: string | undefined,
): boolean => {
  if (!raw || typeof raw !== "object" || !botUserId) return false;
  const record = raw as Record<string, unknown>;
  return record["user"] === botUserId;
};

export const hasBotParticipatedInThread = (
  messages: SlackThreadMessage[],
  botUserId?: string,
): boolean =>
  messages.some((recentMessage) => {
    if (recentMessage.author?.isMe) return true;
    return isOwnBotMessage(recentMessage.raw, botUserId);
  });
