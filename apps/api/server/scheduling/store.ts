import { z } from "zod";

import { redis } from "../mcp/redis";
import { redactError } from "../utils/redact-error";
import { decryptJson, encryptJson } from "../utils/secure-store";
import {
  SCHEDULE_DEDUP_TTL_SECONDS,
  SCHEDULE_FAILED_MESSAGE_LIMIT,
  SCHEDULE_RECORD_TTL_SECONDS,
  scheduleDedupKey,
  scheduleTaskKey,
  scheduleTeamSetKey,
} from "./constants";

const scheduledTaskRecordSchema = z.object({
  id: z.string().min(1),
  teamId: z.string().min(1),
  channelId: z.string().min(1),
  threadId: z.string().min(1),
  isDM: z.boolean().default(false),
  createdByUserId: z.string().min(1),
  prompt: z.string().min(1),
  cronExpression: z.string().min(1),
  recurring: z.boolean(),
  // IANA zone name (e.g., "America/Los_Angeles"). Resolved from the
  // scheduling user's Slack profile at create-time and frozen with the
  // record so subsequent fires interpret the cron the same way every
  // time, even if the user changes their TZ later.
  userTimezone: z.string().min(1),
  nextRunAt: z.number().int().positive(),
  createdAt: z.number().int().positive(),
  cancelled: z.boolean().default(false),
  failureCount: z.number().int().min(0).default(0),
  lastError: z.string().optional(),
  lastRunAt: z.number().int().positive().optional(),
});

export type ScheduledTaskRecord = z.infer<typeof scheduledTaskRecordSchema>;

// Records are encrypted at rest with the same Cryptr key the memory tools
// use (SLACK_ENCRYPTION_KEY). The prompt and lastError fields are the
// privacy-sensitive bits — stored plaintext they'd leak intent + Slack
// IDs into anyone with a Redis dump. decryptJson gracefully handles
// legacy plaintext records too, so this rolls forward without a migration.
//
// The multi() also re-asserts team-set membership and refreshes the team
// set's TTL on every record write. Without that, recurring tasks running
// longer than SCHEDULE_RECORD_TTL_SECONDS (90d) would orphan: the record
// keeps refreshing its own TTL on each run via writeRecord, but the team
// set key — only EXPIRE'd at saveScheduledTask time — eventually expires
// and the task disappears from listScheduledTasksForTeam, becoming
// invisible to cron_list / cron_delete even though
// the queue keeps firing it.
const writeRecord = (record: ScheduledTaskRecord): Promise<unknown> =>
  redis
    .multi()
    .set(
      scheduleTaskKey(record.id),
      encryptJson(record) as string,
      "EX",
      SCHEDULE_RECORD_TTL_SECONDS,
    )
    .sadd(scheduleTeamSetKey(record.teamId), record.id)
    .expire(scheduleTeamSetKey(record.teamId), SCHEDULE_RECORD_TTL_SECONDS)
    .exec();

const parseRecord = (raw: string | null): ScheduledTaskRecord | null => {
  if (!raw) return null;
  try {
    const decrypted = decryptJson<unknown>(raw);
    const parsed = scheduledTaskRecordSchema.safeParse(decrypted);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};

export const saveScheduledTask = async (
  record: ScheduledTaskRecord,
): Promise<void> => {
  await writeRecord(record);
};

export const loadScheduledTask = (
  taskId: string,
): Promise<ScheduledTaskRecord | null> =>
  redis.get(scheduleTaskKey(taskId)).then(parseRecord);

export const listScheduledTasksForTeam = async (
  teamId: string,
): Promise<ScheduledTaskRecord[]> => {
  const taskIds = await redis.smembers(scheduleTeamSetKey(teamId));
  if (taskIds.length === 0) return [];

  const values = await redis.mget(...taskIds.map(scheduleTaskKey));
  const records: ScheduledTaskRecord[] = [];
  const orphanedIds: string[] = [];

  values.forEach((raw, recordIndex) => {
    const record = parseRecord(raw);
    if (record) records.push(record);
    else if (raw === null) orphanedIds.push(taskIds[recordIndex]!);
    // raw exists but failed to parse: leave the set entry; the consumer's
    // failure tracking will eventually retire the record.
  });

  if (orphanedIds.length > 0) {
    await redis.srem(scheduleTeamSetKey(teamId), ...orphanedIds);
  }

  return records.sort(
    (leftRecord, rightRecord) => leftRecord.nextRunAt - rightRecord.nextRunAt,
  );
};

export const markScheduledTaskCancelled = async (
  taskId: string,
): Promise<ScheduledTaskRecord | null> => {
  const existing = await loadScheduledTask(taskId);
  if (!existing || existing.cancelled) return existing;
  const cancelled: ScheduledTaskRecord = { ...existing, cancelled: true };
  await writeRecord(cancelled);
  return cancelled;
};

export const deleteScheduledTask = async (
  record: ScheduledTaskRecord,
): Promise<void> => {
  await redis
    .multi()
    .del(scheduleTaskKey(record.id))
    .srem(scheduleTeamSetKey(record.teamId), record.id)
    .exec();
};

// Returns the updated record so callers can pass *that* (with the reset
// failureCount and bumped nextRunAt/lastRunAt) into downstream operations.
// Without this, a publish failure right after a successful run would call
// recordScheduledTaskFailure with the stale pre-update record, reverting
// nextRunAt and incorrectly counting against the retire threshold.
export const updateScheduledTaskAfterRun = async (
  record: ScheduledTaskRecord,
  nextRunAt: number,
): Promise<ScheduledTaskRecord> => {
  const updated: ScheduledTaskRecord = {
    ...record,
    nextRunAt,
    lastRunAt: Date.now(),
    failureCount: 0,
    lastError: undefined,
  };
  await writeRecord(updated);
  return updated;
};

export const recordScheduledTaskFailure = async (
  record: ScheduledTaskRecord,
  errorMessage: string,
): Promise<{ shouldRetire: boolean }> => {
  const failureCount = record.failureCount + 1;
  if (failureCount >= SCHEDULE_FAILED_MESSAGE_LIMIT) {
    await deleteScheduledTask(record);
    return { shouldRetire: true };
  }
  // The encrypted record protects `lastError` from raw-Redis-dump leakage,
  // but the error string still flows through logs and debug surfaces.
  // Redact secret-shaped substrings (long opaque tokens, base64 ids,
  // partial JWTs) before persisting — see redactError.
  await writeRecord({
    ...record,
    failureCount,
    lastError: redactError(errorMessage),
  });
  return { shouldRetire: false };
};

// Returns true if this is the first time we've seen this Vercel-Queues
// messageId; false (and the caller should ack-and-skip) if it's a
// redelivery. Implemented as SET NX with a TTL — atomic, no read-then-
// write race. See SCHEDULE_DEDUP_TTL_SECONDS for retention rationale.
export const claimDedupSlot = async (messageId: string): Promise<boolean> => {
  const result = await redis.set(
    scheduleDedupKey(messageId),
    "1",
    "EX",
    SCHEDULE_DEDUP_TTL_SECONDS,
    "NX",
  );
  return result === "OK";
};
