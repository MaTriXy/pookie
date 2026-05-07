export const SCHEDULED_TASK_TOPIC = "pookie-scheduled-task";

const SCHEDULE_KEY_PREFIX = "pookie:schedule";

export const scheduleTaskKey = (taskId: string): string =>
  `${SCHEDULE_KEY_PREFIX}:task:${taskId}`;

export const scheduleTeamSetKey = (teamId: string): string =>
  `${SCHEDULE_KEY_PREFIX}:team:${teamId}`;

// Used by the consumer to dedupe at-least-once redeliveries. Vercel Queues
// can redeliver any accepted message (AZ failover, lease expiry); the
// ledger records messageIds we've already finished processing so the
// second copy is acked and skipped instead of running the task twice.
// See processScheduledTaskMessage.
export const scheduleDedupKey = (messageId: string): string =>
  `${SCHEDULE_KEY_PREFIX}:dedup:${messageId}`;

export const SCHEDULE_MIN_DELAY_SECONDS = 60;
export const SCHEDULE_MAX_DELAY_SECONDS = 7 * 24 * 60 * 60;
export const SCHEDULE_MAX_PER_TEAM = 50;
export const SCHEDULE_RECORD_TTL_SECONDS = 90 * 24 * 60 * 60;

// 24h is comfortably longer than Vercel's max visibility timeout (1h) and
// any realistic redelivery window, while not bloating Redis with old
// dedup keys for tasks that fire weekly.
export const SCHEDULE_DEDUP_TTL_SECONDS = 24 * 60 * 60;

export const SCHEDULE_PROMPT_MAX_CHARS = 1000;

// Vercel Queues' SendMessage caps `delaySeconds` per message at 7 days, so
// recurring schedules longer than that have to be daisy-chained — the
// consumer keeps re-publishing chunks until the total delay reaches
// `intervalSeconds`. See run-task.ts.
export const SCHEDULE_FAILED_MESSAGE_LIMIT = 5;
