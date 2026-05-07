import { SlackFormatConverter } from "@chat-adapter/slack";
import { Message, ThreadImpl, parseMarkdown } from "chat";

import { handleSlackMessage } from "../agent";
import { slackBot } from "../slack-bot";
import { resolveSlackWebClient } from "../slack/web-client";
import { logger } from "../utils/logger";
import { redactError } from "../utils/redact-error";
import { stripSlackBroadcasts } from "../utils/strip-slack-broadcasts";
import { SCHEDULE_FAILED_MESSAGE_LIMIT } from "./constants";
import { nextFireMs } from "./cron";
import { publishScheduledTaskMessage } from "./index";
import {
  claimDedupSlot,
  deleteScheduledTask,
  loadScheduledTask,
  recordScheduledTaskFailure,
  updateScheduledTaskAfterRun,
} from "./store";

import type { SlackAdapter } from "@chat-adapter/slack";
import type { ChatPostMessageArguments } from "@slack/web-api";

import type { ScheduledTaskMessage } from "./index";
import type { ScheduledTaskRecord } from "./store";

// Reused across fires — the converter is stateless and doing the
// markdown→mrkdwn conversion ourselves is the trade-off for bypassing the
// chat-adapter's `thread.post()` (which doesn't expose `reply_broadcast`).
const slackFormatConverter = new SlackFormatConverter();

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
//   originally called cron_create), NOT the actively-acting user — there
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

interface RunResult {
  // True when we ran (or attempted to run) the agent. False when we
  // observed a cancellation between the consumer's initial record load
  // and the actual post — the caller should treat this as a no-op fire,
  // NOT a successful run that needs post-run cleanup (which would
  // double-delete and double-publish).
  ran: boolean;
}

const runScheduledTaskInner = async (
  record: ScheduledTaskRecord,
): Promise<RunResult> => {
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
    return { ran: false };
  }

  return slack.withBotToken(installation.botToken, async () => {
    // Late-cancel re-check: closes the race where the user calls
    // cron_delete AFTER the consumer's initial loadScheduledTask but
    // BEFORE we post the visible "say hi" / run the agent. Without this,
    // a sub-minute cron could deliver one extra "queued gremlin" fire
    // post-cancel because the consumer was already mid-flight when the
    // cancel committed. We can't abort an already-started agent run —
    // but we can avoid even posting the prompt if the cancel landed in
    // time.
    const fresh = await loadScheduledTask(record.id);
    if (!fresh || fresh.cancelled) {
      logger.info("[scheduling] cancellation observed before fire — aborting", {
        taskId: record.id,
      });
      if (fresh) await deleteScheduledTask(fresh);
      return { ran: false };
    }

    const postBody = buildPostBody(record, slack.botUserId);
    const promptForAgent = slack.botUserId
      ? `<@${slack.botUserId}> ${record.prompt}`
      : record.prompt;

    // Channel-routed fires: post a fresh top-level message in the target
    // channel and run the agent on a brand-new thread keyed to that ts.
    // The originating thread (where the user scheduled from) is NOT
    // touched — schedules act as one-way automations into the target.
    if (record.targetChannelId) {
      await fireIntoTargetChannel(
        record,
        slack,
        postBody,
        promptForAgent,
        record.targetChannelId,
      );
      return { ran: true };
    }

    // Default path: reply in the originating thread, but ALSO surface the
    // fire in the parent channel via `reply_broadcast: true`. Without
    // this, recurring automations get buried inside whatever thread they
    // were scheduled from and channel members never see them. One Slack
    // message — appears in the thread AND at the top of the channel feed.
    // No-op for DMs (no separate channel feed) and for top-level threads
    // (no thread_ts); guarded below so we don't pass it spuriously.
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
    const postedTs = await postSelfPromptToThread(record, slack, postBody);
    await handleSlackMessage(
      thread,
      buildSyntheticMessage(record, postedTs, promptForAgent),
    );
    return { ran: true };
  });
};

const postSelfPromptToThread = async (
  record: ScheduledTaskRecord,
  slack: SlackAdapter,
  postBody: string,
): Promise<string> => {
  const fallbackTs = `scheduled-${record.id}-${Date.now()}`;
  const webClient = await resolveSlackWebClient(record.teamId);
  if (!webClient) {
    logger.warn(
      "[scheduling] no slack web client available for broadcast — skipping visible self-prompt",
      { taskId: record.id, teamId: record.teamId },
    );
    return fallbackTs;
  }

  const { channel, threadTs } = slack.decodeThreadId(record.threadId);
  const renderedText = slackFormatConverter.renderPostable({
    markdown: postBody,
  });

  // Slack's discriminated union for ChatPostMessageArguments requires a
  // string `thread_ts` whenever `reply_broadcast` is present. Branch the
  // payload so:
  //   - thread + non-DM   → thread reply broadcast back to the channel
  //   - thread + DM       → plain thread reply (no channel feed to surface)
  //   - no thread (root)  → top-level post (broadcast is meaningless)
  const baseArgs = {
    channel,
    text: renderedText,
    unfurl_links: false as const,
    unfurl_media: false as const,
  };
  const args: ChatPostMessageArguments = threadTs
    ? {
        ...baseArgs,
        thread_ts: threadTs,
        reply_broadcast: !record.isDM,
      }
    : baseArgs;

  try {
    const response = await webClient.chat.postMessage(args);
    return response.ts ?? fallbackTs;
  } catch (postError) {
    logger.warn("[scheduling] failed to post self-prompt", postError);
    return fallbackTs;
  }
};

const fireIntoTargetChannel = async (
  record: ScheduledTaskRecord,
  slack: SlackAdapter,
  postBody: string,
  promptForAgent: string,
  targetChannelId: string,
): Promise<void> => {
  // Channel-only threadId tells the slack adapter to post top-level
  // (no thread_ts) — see SlackAdapter.decodeThreadId. The returned
  // sentMessage.id is the ts of the new top-level message, which then
  // becomes the thread root for the agent's reply.
  const channelOnlyThreadId = `slack:${targetChannelId}`;
  const sentMessage = await slack
    .postMessage(channelOnlyThreadId, { markdown: postBody })
    .catch((postError: unknown) => {
      logger.warn(
        "[scheduling] failed to post into target channel — skipping fire",
        {
          taskId: record.id,
          targetChannelId,
          error:
            postError instanceof Error ? postError.message : String(postError),
        },
      );
      return undefined;
    });
  if (!sentMessage?.id) {
    // Throw so trackFailure records it; otherwise the chain proceeds as
    // if the fire succeeded and the bot is "silently broken in
    // #engineering" until someone notices.
    throw new Error(
      `failed to post into target channel ${targetChannelId} (no ts returned)`,
    );
  }

  const newThreadId = `slack:${targetChannelId}:${sentMessage.id}`;
  const thread = ThreadImpl.fromJSON({
    _type: "chat:Thread",
    adapterName: "slack",
    id: newThreadId,
    channelId: targetChannelId,
    isDM: false,
  });

  // Synthetic message rebound to the target channel's new thread —
  // agent's reply lands as a reply on the top-level we just posted.
  const reroutedRecord: ScheduledTaskRecord = {
    ...record,
    channelId: targetChannelId,
    threadId: newThreadId,
  };
  await handleSlackMessage(
    thread,
    buildSyntheticMessage(reroutedRecord, sentMessage.id, promptForAgent),
  );
};

// On retire, surface the failure to the scheduler — the chain has stopped
// and they need to know. Posts an ephemeral in the originating thread so
// only they see it. Best-effort: if the workspace uninstalled Pookie or
// the thread is no longer accessible, we just log and move on (the queue
// message has already been deleted by recordScheduledTaskFailure).
const notifyScheduledTaskRetired = async (
  record: ScheduledTaskRecord,
  errorMessage: string,
): Promise<void> => {
  try {
    const slack: SlackAdapter = slackBot.getAdapter("slack");
    await slackBot.initialize();
    const installation = await slack.getInstallation(record.teamId);
    if (!installation?.botToken) return;

    const errorSnippet = redactError(errorMessage).slice(0, 120);
    const message =
      `🔔 your cron job \`${record.cronExpression}\` (${record.recurring ? "recurring" : "one-shot"}) ` +
      `was retired after ${SCHEDULE_FAILED_MESSAGE_LIMIT} consecutive failures and won't fire again. ` +
      `prompt: _${record.prompt.slice(0, 200)}_. ` +
      `last error: \`${errorSnippet}\`. ` +
      `recreate it if you still need it — open this thread and ask me to schedule again.`;

    await slack.withBotToken(installation.botToken, async () => {
      await slack.postEphemeral(
        record.threadId,
        record.createdByUserId,
        message,
      );
    });
  } catch (notifyError) {
    logger.warn("[scheduling] failed to notify scheduler of cron retirement", {
      taskId: record.id,
      error:
        notifyError instanceof Error
          ? notifyError.message
          : String(notifyError),
    });
  }
};

const trackFailure = async (
  record: ScheduledTaskRecord,
  errorMessage: string,
): Promise<ProcessScheduledTaskResult> => {
  const failure = await recordScheduledTaskFailure(record, errorMessage);
  if (failure.shouldRetire) {
    await notifyScheduledTaskRetired(record, errorMessage);
  }
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

  let runResult: RunResult;
  try {
    runResult = await runScheduledTaskInner(record);
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

  // Late-cancel observed inside runScheduledTaskInner — the record was
  // already cleaned up there. Don't double-delete via the post-run path,
  // and don't publish the next chained fire (the chain ends here).
  if (!runResult.ran) {
    return { status: "cancelled", taskId: record.id };
  }

  if (!record.recurring) {
    await deleteScheduledTask(record);
    return { status: "ran", taskId: record.id };
  }

  // Anchor the next fire to the previous fire's nextRunAt, not Date.now().
  // The agent run may have taken seconds to minutes; without anchoring,
  // each fire's clock-time would drift forward by that amount and a
  // 9:00am daily task would creep to 9:01, 9:02, etc. Computing from
  // record.nextRunAt against the cron expression gives us the next valid
  // slot in the schedule itself (e.g., the next 9am occurrence in
  // userTimezone) regardless of how long this fire took.
  let nextOccurrenceMs: number;
  try {
    nextOccurrenceMs = nextFireMs(
      record.cronExpression,
      record.userTimezone,
      record.nextRunAt,
    );
  } catch (cronError) {
    const errorMessage =
      cronError instanceof Error ? cronError.message : String(cronError);
    logger.error("[scheduling] failed to compute next cron fire", {
      taskId: record.id,
      cron: record.cronExpression,
      error: errorMessage,
    });
    return trackFailure(record, errorMessage);
  }

  // Capture the post-run record (failureCount reset, nextRunAt + lastRunAt
  // bumped). If the next-occurrence publish below fails, trackFailure must
  // see THIS updated record — passing the pre-update `record` would revert
  // failureCount and incorrectly approach the retire threshold.
  const updatedRecord = await updateScheduledTaskAfterRun(
    record,
    nextOccurrenceMs,
  );
  const delaySeconds = Math.max(
    0,
    Math.round((nextOccurrenceMs - Date.now()) / 1000),
  );
  const publishResult = await publishScheduledTaskMessage(
    updatedRecord.id,
    delaySeconds,
    updatedRecord.nextRunAt,
  );
  if (!publishResult.ok)
    return trackFailure(updatedRecord, publishResult.error);
  return { status: "ran", taskId: updatedRecord.id };
};
