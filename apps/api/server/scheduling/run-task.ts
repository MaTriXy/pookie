import { Message, ThreadImpl, parseMarkdown } from "chat";

import { handleSlackMessage } from "../agent";
import { slackBot } from "../slack-bot";
import { logger } from "../utils/logger";
import { redactError } from "../utils/redact-error";
import { stripSlackBroadcasts } from "../utils/strip-slack-broadcasts";
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

interface ProcessScheduledTaskResult {
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

// Strips `<!channel>`/`<!here>`/`<!everyone>`/`<!subteam^…>` from the prompt
// before it's posted by the bot. Without this, a user could schedule a task
// containing a broadcast directive and the bot would fire the notification
// under its own permissions, laundering @channel-class privileges that the
// scheduling user might not have. The agent still sees the un-stripped
// prompt internally so it can act on the user's intent — only the visible
// post is sanitized.
//
// We also prepend `_(scheduled by <@user>)_` so the actual originator of
// the post is always visible in-thread, defusing identity laundering.
const buildPostBody = (
  record: ScheduledTaskRecord,
  botUserId: string | undefined,
): string => {
  const safePrompt = stripSlackBroadcasts(record.prompt);
  const mention = botUserId ? `<@${botUserId}> ` : "";
  return `_(scheduled by <@${record.createdByUserId}>)_ ${mention}${safePrompt}`;
};

const runScheduledTaskInner = async (
  record: ScheduledTaskRecord,
): Promise<void> => {
  const slack: SlackAdapter = slackBot.getAdapter("slack");

  // The slack adapter resolves the bot token from per-request context that
  // a webhook handler sets implicitly. Queue invocations have NO inbound
  // webhook, so we must look up the workspace's installation by teamId
  // and wrap the entire run (refresh, post, agent) in `withBotToken`.
  // Without this, every adapter call throws AUTH_FAILED ("No bot token
  // available. In multi-workspace mode, ensure the webhook is being
  // processed.") and the user sees nothing.
  await slackBot.initialize();
  const installation = await slack.getInstallation(record.teamId);
  if (!installation?.botToken) {
    logger.warn("[scheduling] no slack installation for team — skipping fire", {
      teamId: record.teamId,
      taskId: record.id,
    });
    return;
  }

  const thread = ThreadImpl.fromJSON({
    _type: "chat:Thread",
    adapterName: "slack",
    id: record.threadId,
    channelId: record.channelId,
    isDM: record.isDM,
  });

  await slack.withBotToken(installation.botToken, async () => {
    await thread
      .refresh()
      .catch((refreshError: unknown) =>
        logger.warn("[scheduling] failed to refresh thread", refreshError),
      );

    // Visible post: sanitized prompt + scheduler attribution + bot mention.
    // Synthetic message text seen by the agent: the original (un-stripped)
    // prompt, so the agent can reason about and respond to the full intent.
    const postBody = buildPostBody(record, slack.botUserId);
    const promptForAgent = slack.botUserId
      ? `<@${slack.botUserId}> ${record.prompt}`
      : record.prompt;
    const postedMessage = await thread
      .post({ markdown: postBody })
      .catch((postError: unknown) => {
        logger.warn("[scheduling] failed to post self-prompt", postError);
        return undefined;
      });
    const postedTs =
      postedMessage?.id ?? `scheduled-${record.id}-${Date.now()}`;

    await handleSlackMessage(
      thread,
      buildSyntheticMessage(record, postedTs, promptForAgent),
    );
  });
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

// `messageId` is the Vercel-Queues messageId — the canonical at-least-once
// dedup key. Every accepted message gets a unique id; redeliveries of that
// message reuse the same id. The consumer route forwards `metadata.messageId`.
export const processScheduledTaskMessage = async ({
  message,
  messageId,
}: {
  message: ScheduledTaskMessage;
  messageId: string;
}): Promise<ProcessScheduledTaskResult> => {
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
  // Republish for the next chunk and don't run the task yet. Pass the
  // record's nextRunAt as the occurrence id so consumer-retry republishes
  // collapse to the same idempotency key.
  if (message.remainingDelaySeconds && message.remainingDelaySeconds > 0) {
    const publishResult = await publishScheduledTaskMessage(
      record.id,
      message.remainingDelaySeconds,
      record.nextRunAt,
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
      // Same redaction as recordScheduledTaskFailure performs at rest —
      // logs ship to Axiom/Vercel and shouldn't carry token-shaped strings.
      error: redactError(errorMessage),
    });
    return trackFailure(record, errorMessage);
  }

  const intervalSeconds = record.intervalSeconds;
  if (intervalSeconds === undefined) {
    await deleteScheduledTask(record);
    return { status: "ran", taskId: record.id };
  }

  // Capture the post-run record (failureCount reset, nextRunAt + lastRunAt
  // bumped). If the next-occurrence publish below fails, trackFailure must
  // see THIS updated record — passing the pre-update `record` would revert
  // failureCount and incorrectly approach the retire threshold.
  const updatedRecord = await updateScheduledTaskAfterRun(
    record,
    Date.now() + intervalSeconds * 1000,
  );
  const publishResult = await publishScheduledTaskMessage(
    updatedRecord.id,
    intervalSeconds,
    updatedRecord.nextRunAt,
  );
  if (!publishResult.ok)
    return trackFailure(updatedRecord, publishResult.error);
  return { status: "ran", taskId: updatedRecord.id };
};
