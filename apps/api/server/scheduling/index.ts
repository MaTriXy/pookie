import { randomUUID } from "node:crypto";

import { z } from "zod";

import { logger } from "../utils/logger";
import { redactError } from "../utils/redact-error";
import { getQueueSend, isQueuesAvailable } from "./capability";
import {
  SCHEDULED_TASK_TOPIC,
  SCHEDULE_MAX_DELAY_SECONDS,
  SCHEDULE_PROMPT_MAX_CHARS,
} from "./constants";
import { validateCronExpression } from "./cron";
import {
  deleteScheduledTask,
  listScheduledTasksForTeam,
  loadScheduledTask,
  markScheduledTaskCancelled,
  saveScheduledTask,
} from "./store";

import type { ScheduledTaskRecord } from "./store";

export const scheduledTaskMessageSchema = z.object({
  taskId: z.string().min(1),
  // Total seconds remaining when this message was published. The consumer
  // uses this to know whether the queue's 7-day delay cap forced a daisy-
  // chain split, in which case there's still time left on the *current*
  // occurrence and we shouldn't run the task yet — we just republish with
  // the next chunk. Zero/undefined means "fire now".
  remainingDelaySeconds: z.number().int().min(0).optional(),
});

export type ScheduledTaskMessage = z.infer<typeof scheduledTaskMessageSchema>;

interface ScheduleTaskInput {
  teamId: string;
  channelId: string;
  threadId: string;
  isDM: boolean;
  createdByUserId: string;
  prompt: string;
  cronExpression: string;
  recurring: boolean;
  userTimezone: string;
}

type ScheduleFailureReason =
  | "queues_unavailable"
  | "validation"
  | "send_failed";

type ScheduleTaskResult =
  | { ok: true; record: ScheduledTaskRecord }
  | { ok: false; reason: ScheduleFailureReason; message: string };

const QUEUES_UNAVAILABLE_MESSAGE =
  "scheduled tasks aren't available on this deployment. " +
  "Pookie's scheduler is built on Vercel Queues, which only runs on a Vercel-hosted deployment. " +
  "Self-hosted Pookie (Docker, Railway, Render, Fly, VPS) doesn't have a managed scheduler — " +
  "either redeploy Pookie on Vercel, or set up an external cron (the host's cron service, GitHub Actions schedule, etc.) that pings Pookie at the right time.";

const fail = (
  reason: ScheduleFailureReason,
  message: string,
): ScheduleTaskResult => ({ ok: false, reason, message });

const validatePromptShape = (prompt: string): string | null => {
  const trimmed = prompt.trim();
  if (!trimmed) return "prompt cannot be empty";
  if (trimmed.length > SCHEDULE_PROMPT_MAX_CHARS) {
    return `prompt is too long (max ${SCHEDULE_PROMPT_MAX_CHARS} chars)`;
  }
  return null;
};

// Vercel Queues' SendMessage caps `delaySeconds` per message at 7 days, so
// anything longer has to be daisy-chained. Returns the chunk the next publish
// should use and how many seconds remain after that.
export const splitDelay = (
  totalSeconds: number,
): { chunkSeconds: number; remainingSeconds: number } =>
  totalSeconds <= SCHEDULE_MAX_DELAY_SECONDS
    ? { chunkSeconds: Math.max(0, totalSeconds), remainingSeconds: 0 }
    : {
        chunkSeconds: SCHEDULE_MAX_DELAY_SECONDS,
        remainingSeconds: totalSeconds - SCHEDULE_MAX_DELAY_SECONDS,
      };

export const publishScheduledTaskMessage = async (
  taskId: string,
  totalDelaySeconds: number,
  // ms-epoch of the occurrence this publish is for. Stable across consumer
  // retries of the same fire (so a flaky publish step doesn't fan out into
  // duplicate fires inside the queue's dedup window) but unique per
  // recurring occurrence (so the next fire's publish doesn't collide
  // with the previous one and get silently dropped). For daisy-chain
  // republishes, callers pass the *original* fire time so all chunks of
  // one occurrence share the same key.
  occurrenceTimeMs: number,
): Promise<{ ok: true } | { ok: false; error: string }> => {
  const { chunkSeconds, remainingSeconds } = splitDelay(totalDelaySeconds);
  try {
    const send = await getQueueSend();
    await send(
      SCHEDULED_TASK_TOPIC,
      { taskId, remainingDelaySeconds: remainingSeconds },
      {
        delaySeconds: chunkSeconds,
        idempotencyKey: `${taskId}:${occurrenceTimeMs}:${remainingSeconds}`,
      },
    );
    return { ok: true };
  } catch (publishError) {
    const errorMessage =
      publishError instanceof Error
        ? publishError.message
        : String(publishError);
    logger.warn("[scheduling] failed to publish queue message", {
      taskId,
      error: redactError(errorMessage),
    });
    return { ok: false, error: errorMessage };
  }
};

export const scheduleTask = async (
  input: ScheduleTaskInput,
): Promise<ScheduleTaskResult> => {
  if (!isQueuesAvailable()) {
    return fail("queues_unavailable", QUEUES_UNAVAILABLE_MESSAGE);
  }

  const promptError = validatePromptShape(input.prompt);
  if (promptError) return fail("validation", promptError);

  const now = Date.now();
  const cronValidation = validateCronExpression(
    input.cronExpression,
    input.userTimezone,
    now,
  );
  if (!cronValidation.ok) return fail("validation", cronValidation.message);

  const record: ScheduledTaskRecord = {
    id: randomUUID(),
    teamId: input.teamId,
    channelId: input.channelId,
    threadId: input.threadId,
    isDM: input.isDM,
    createdByUserId: input.createdByUserId,
    prompt: input.prompt.trim(),
    cronExpression: input.cronExpression,
    recurring: input.recurring,
    userTimezone: input.userTimezone,
    nextRunAt: cronValidation.firstFireMs,
    createdAt: now,
    cancelled: false,
    failureCount: 0,
  };

  await saveScheduledTask(record);

  const delaySeconds = Math.max(
    0,
    Math.round((cronValidation.firstFireMs - now) / 1000),
  );
  const sendResult = await publishScheduledTaskMessage(
    record.id,
    delaySeconds,
    record.nextRunAt,
  );
  if (!sendResult.ok) {
    // Best-effort cleanup. If this also fails (Redis blip), we'd otherwise
    // leak a "ghost" record that occupies a per-team slot but has no queue
    // message backing it. Surface the original send error to the caller
    // and log the cleanup failure so an operator can investigate; the
    // scheduling user can still recover via `cron_delete`.
    try {
      await deleteScheduledTask(record);
    } catch (cleanupError) {
      logger.warn("[scheduling] cleanup after send failure also failed", {
        taskId: record.id,
        error: redactError(
          cleanupError instanceof Error
            ? cleanupError.message
            : String(cleanupError),
        ),
      });
    }
    return fail("send_failed", sendResult.error);
  }

  return { ok: true, record };
};

export const cancelScheduledTask = async (
  taskId: string,
  teamId: string,
  callerUserId: string,
): Promise<
  | { ok: true; record: ScheduledTaskRecord }
  | { ok: false; reason: "not_found" | "wrong_team" | "wrong_user" }
> => {
  const existing = await loadScheduledTask(taskId);
  if (!existing) return { ok: false, reason: "not_found" };
  if (existing.teamId !== teamId) return { ok: false, reason: "wrong_team" };
  // Authorization: only the user who scheduled the task can cancel it.
  // Workspace admins are not given an override here — keeping the
  // authority model simple and consistent. A later /pookie-config flow
  // can expose admin cancellation if it becomes necessary.
  if (existing.createdByUserId !== callerUserId) {
    return { ok: false, reason: "wrong_user" };
  }
  const cancelled = await markScheduledTaskCancelled(taskId);
  if (!cancelled) return { ok: false, reason: "not_found" };
  return { ok: true, record: cancelled };
};

export const listScheduledTasksForUser = async (
  teamId: string,
  userId: string,
): Promise<ScheduledTaskRecord[]> => {
  const teamTasks = await listScheduledTasksForTeam(teamId);
  return teamTasks.filter((entry) => entry.createdByUserId === userId);
};

export { isQueuesAvailable };
export type { ScheduledTaskRecord };
