import { Message, ThreadImpl, parseMarkdown } from "chat";

import { handleSlackMessage } from "../agent";
import { slackBot } from "../slack-bot";
import { logger } from "../utils/logger";
import { publishScheduledTaskMessage } from "./index";
import {
  claimDedupSlot,
  deleteScheduledTask,
  loadScheduledTask,
  recordScheduledTaskFailure,
  updateScheduledTaskAfterRun,
} from "./store";

import type { SlackAdapter } from "@chat-adapter/slack";

import type { ScheduledTaskMessage } from "./index";
import type { ScheduledTaskRecord } from "./store";

export interface ProcessScheduledTaskResult {
  status:
    | "ran"
    | "republished"
    | "cancelled"
    | "expired"
    | "missing"
    | "retired"
    | "redelivered";
  taskId: string;
}

// Authority contract for the synthetic Message:
//
//   raw.user / author.userId is set to the SCHEDULING user (the person who
//   originally called schedule_task), NOT the actively-acting user — there
//   is no actively-acting user, the queue invoked us. handleSlackMessage
//   uses these values to resolve memory scope (`current_user_id`) and the
//   runtime context block, which is the right behavior: scheduled runs
//   should look at the scheduler's personal memory.
//
//   IMPORTANT: any future tool that authorizes off `currentMessage.raw.user`
//   ("is this user an admin?", "may this user delete X?") would treat the
//   scheduling user as the requester. That's a privilege question. If a
//   tool ever needs to gate on "interactive vs non-interactive", thread
//   that signal through explicitly rather than reading raw.user.
const buildSyntheticMessage = (
  record: ScheduledTaskRecord,
  postedTs: string,
  promptMarkdown: string,
): Message => {
  const slack: SlackAdapter = slackBot.getAdapter("slack");
  return new Message({
    id: postedTs,
    threadId: record.threadId,
    text: promptMarkdown,
    formatted: parseMarkdown(promptMarkdown),
    raw: {
      user: record.createdByUserId,
      channel: record.channelId,
      team: record.teamId,
      type: "message" as const,
      ts: postedTs,
    },
    isMention: true,
    author: {
      userId: record.createdByUserId,
      userName: record.createdByUserId,
      fullName: record.createdByUserId,
      isBot: false,
      isMe: slack.botUserId === record.createdByUserId,
    },
    metadata: { dateSent: new Date(), edited: false },
    attachments: [],
  });
};

const runScheduledTaskInner = async (
  record: ScheduledTaskRecord,
): Promise<void> => {
  const slack: SlackAdapter = slackBot.getAdapter("slack");
  const thread = ThreadImpl.fromJSON({
    _type: "chat:Thread",
    adapterName: "slack",
    id: record.threadId,
    channelId: record.channelId,
    isDM: record.isDM,
  });
  await thread
    .refresh()
    .catch((refreshError: unknown) =>
      logger.warn("[scheduling] failed to refresh thread", refreshError),
    );

  // Slack mentions render as <@U123>, which the client displays as @pookie.
  // Posting "<@bot> {prompt}" makes the scheduled fire look exactly like a
  // user prompting Pookie in-thread, which is the whole point: the agent
  // then responds in-thread off that prompt.
  const promptMarkdown = slack.botUserId
    ? `<@${slack.botUserId}> ${record.prompt}`
    : record.prompt;
  const postedMessage = await thread
    .post({ markdown: promptMarkdown })
    .catch((postError: unknown) => {
      logger.warn("[scheduling] failed to post self-prompt", postError);
      return undefined;
    });
  const postedTs = postedMessage?.id ?? `scheduled-${record.id}-${Date.now()}`;

  await handleSlackMessage(
    thread,
    buildSyntheticMessage(record, postedTs, promptMarkdown),
  );
};

const trackFailure = async (
  record: ScheduledTaskRecord,
  errorMessage: string,
): Promise<ProcessScheduledTaskResult> => {
  const failure = await recordScheduledTaskFailure(record, errorMessage);
  return {
    status: failure.shouldRetire ? "retired" : "expired",
    taskId: record.id,
  };
};

export interface ProcessScheduledTaskOptions {
  message: ScheduledTaskMessage;
  // Vercel-Queues messageId — the canonical at-least-once dedup key. Every
  // accepted message gets a unique id; redeliveries of that message reuse
  // the same id. The consumer route forwards `metadata.messageId` here.
  messageId: string;
}

export const processScheduledTaskMessage = async ({
  message,
  messageId,
}: ProcessScheduledTaskOptions): Promise<ProcessScheduledTaskResult> => {
  const isFirstDelivery = await claimDedupSlot(messageId);
  if (!isFirstDelivery) {
    logger.info("[scheduling] redelivery suppressed", {
      taskId: message.taskId,
      messageId,
    });
    return { status: "redelivered", taskId: message.taskId };
  }

  const record = await loadScheduledTask(message.taskId);
  if (!record) {
    logger.warn("[scheduling] no record for task", message.taskId);
    return { status: "missing", taskId: message.taskId };
  }

  if (record.cancelled) {
    await deleteScheduledTask(record);
    return { status: "cancelled", taskId: record.id };
  }

  // Daisy-chain split: this message is just a chunk of a longer delay.
  // Republish for the next chunk and don't run the task yet.
  if (message.remainingDelaySeconds && message.remainingDelaySeconds > 0) {
    const publishResult = await publishScheduledTaskMessage(
      record.id,
      message.remainingDelaySeconds,
    );
    if (!publishResult.ok) return trackFailure(record, publishResult.error);
    return { status: "republished", taskId: record.id };
  }

  try {
    await runScheduledTaskInner(record);
  } catch (runError) {
    const errorMessage =
      runError instanceof Error ? runError.message : String(runError);
    logger.error("[scheduling] task run failed", {
      taskId: record.id,
      error: errorMessage,
    });
    return trackFailure(record, errorMessage);
  }

  if (record.intervalSeconds === undefined) {
    await deleteScheduledTask(record);
    return { status: "ran", taskId: record.id };
  }

  await updateScheduledTaskAfterRun(
    record,
    Date.now() + record.intervalSeconds * 1000,
  );
  const publishResult = await publishScheduledTaskMessage(
    record.id,
    record.intervalSeconds,
  );
  if (!publishResult.ok) return trackFailure(record, publishResult.error);
  return { status: "ran", taskId: record.id };
};
