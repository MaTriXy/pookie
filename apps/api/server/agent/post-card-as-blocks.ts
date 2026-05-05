import { resolveTokenContext } from "../tools/slack-search";

import type { SlackAdapter } from "@chat-adapter/slack";
import type { MessageAttachment } from "@slack/types";
import type * as ChatSDK from "chat";

import type { RenderedCard } from "./render-card-blocks";

interface PostCardAsBlocksOptions {
  thread: ChatSDK.Thread;
  slack: SlackAdapter;
  fallbackText: string;
  card: RenderedCard;
  currentMessage?: ChatSDK.Message;
}

interface DecodedSlackThreadId {
  channel: string;
  threadTs: string | undefined;
}

const decodeSlackThreadId = (threadId: string): DecodedSlackThreadId => {
  const parts = threadId.split(":");
  if (parts.length < 2 || parts.length > 3 || parts[0] !== "slack") {
    throw new Error(`Unexpected Slack thread id format: ${threadId}`);
  }
  return {
    channel: parts[1],
    threadTs: parts.length === 3 && parts[2] ? parts[2] : undefined,
  };
};

export const postCardAsBlocks = async ({
  thread,
  slack,
  fallbackText,
  card,
  currentMessage,
}: PostCardAsBlocksOptions): Promise<void> => {
  const { client } = await resolveTokenContext(slack, thread, currentMessage);
  const { channel, threadTs } = decodeSlackThreadId(thread.id);
  const threadField = threadTs ? { thread_ts: threadTs } : {};

  // Framed cards put the body inside the legacy attachments container so
  // Slack draws a rounded border around it; the footer button stays at the
  // message root so it renders BELOW the framed body, full-width on mobile.
  if (card.frame === "attachment") {
    const attachment: MessageAttachment = {
      blocks: card.bodyBlocks,
      fallback: fallbackText,
    };
    await client.chat.postMessage({
      channel,
      text: fallbackText,
      attachments: [attachment],
      ...(card.footerBlocks.length > 0 ? { blocks: card.footerBlocks } : {}),
      ...threadField,
    });
    return;
  }

  await client.chat.postMessage({
    channel,
    text: fallbackText,
    blocks: [...card.bodyBlocks, ...card.footerBlocks],
    ...threadField,
  });
};
