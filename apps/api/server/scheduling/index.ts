import { randomUUID } from "node:crypto";

import { z } from "zod";

import { logger } from "../utils/logger";
import { redactError } from "../utils/redact-error";
import { getQueueSend, isQueuesAvailable } from "./capability";
import {
  SCHEDULED_TASK_TOPIC,
  SCHEDULE_MAX_DELAY_SECONDS,
  SCHEDULE_MAX_PER_TEAM,
  SCHEDULE_MAX_PER_USER,
  SCHEDULE_MIN_DELAY_SECONDS,
  SCHEDULE_MIN_RECURRING_INTERVAL_SECONDS,
  SCHEDULE_PROMPT_MAX_CHARS,
} from "./constants";
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
  delaySeconds: number;
  intervalSeconds?: number;
}

type ScheduleFailureReason =
  | "queues_unavailable"
  | "validation"
  | "limit_reached"
  | "user_limit_reached"
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

const validateInput = (input: ScheduleTaskInput): string | null => {
  const trimmedPrompt = input.prompt.trim();
  if (!trimmedPrompt) return "prompt cannot be empty";
  if (trimmedPrompt.length > SCHEDULE_PROMPT_MAX_CHARS) {
    return `prompt is too long (max ${SCHEDULE_PROMPT_MAX_CHARS} chars)`;
  }
  if (
    !Number.isFinite(input.delaySeconds) ||
    input.delaySeconds < SCHEDULE_MIN_DELAY_SECONDS
  ) {
    return `delaySeconds must be at least ${SCHEDULE_MIN_DELAY_SECONDS} (1 minute)`;
  }
  if (
    input.intervalSeconds !== undefined &&
    (!Number.isFinite(input.intervalSeconds) ||
      input.intervalSeconds < SCHEDULE_MIN_RECURRING_INTERVAL_SECONDS)
  ) {
    return `intervalSeconds must be at least ${SCHEDULE_MIN_RECURRING_INTERVAL_SECONDS} (10 minutes) for recurring tasks`;
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
): Promise<{ ok: true } | { ok: false; error: string }> => {
  const { chunkSeconds, remainingSeconds } = splitDelay(totalDelaySeconds);
  try {
    const send = await getQueueSend();
    await send(
      SCHEDULED_TASK_TOPIC,
      { taskId, remainingDelaySeconds: remainingSeconds },
      {
        delaySeconds: chunkSeconds,
        // Stable idempotency key tied to the task's intended fire time
        // (computed by the caller via splitDelay). Re-publishes from a
        // crashed consumer retry collapse to the original message inside
        // the queue's dedup window, so a flaky publish step can't fan
        // out into duplicate fires.
        idempotencyKey: `${taskId}:${chunkSeconds}:${remainingSeconds}`,
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

  const validationError = validateInput(input);
  if (validationError) return fail("validation", validationError);

  const existing = await listScheduledTasksForTeam(input.teamId);
  const activeTasks = existing.filter((entry) => !entry.cancelled);
  if (activeTasks.length >= SCHEDULE_MAX_PER_TEAM) {
    return fail(
      "limit_reached",
      `this workspace already has ${activeTasks.length} active scheduled tasks (max ${SCHEDULE_MAX_PER_TEAM}). Cancel one before scheduling another.`,
    );
  }
  const userActiveCount = activeTasks.filter(
    (entry) => entry.createdByUserId === input.createdByUserId,
  ).length;
  if (userActiveCount >= SCHEDULE_MAX_PER_USER) {
    return fail(
      "user_limit_reached",
      `you already have ${userActiveCount} active scheduled tasks (max ${SCHEDULE_MAX_PER_USER} per user). Cancel one of yours before scheduling another.`,
    );
  }

  const now = Date.now();
  const record: ScheduledTaskRecord = {
    id: randomUUID(),
    teamId: input.teamId,
    channelId: input.channelId,
    threadId: input.threadId,
    isDM: input.isDM,
    createdByUserId: input.createdByUserId,
    prompt: input.prompt.trim(),
    intervalSeconds: input.intervalSeconds,
    nextRunAt: now + Math.round(input.delaySeconds * 1000),
    createdAt: now,
    cancelled: false,
    failureCount: 0,
  };

  await saveScheduledTask(record);

  const sendResult = await publishScheduledTaskMessage(
    record.id,
    input.delaySeconds,
  );
  if (!sendResult.ok) {
    // Best-effort cleanup. If this also fails (Redis blip), we'd otherwise
    // leak a "ghost" record that occupies a per-team slot but has no queue
    // message backing it. Surface the original send error to the caller
    // and log the cleanup failure so an operator can investigate; the
    // scheduling user can still recover via `cancel_scheduled_task`.
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
