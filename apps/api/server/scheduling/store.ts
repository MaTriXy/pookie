import { z } from "zod";

import { redis } from "../mcp/redis";
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
  intervalSeconds: z.number().int().positive().optional(),
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
const writeRecord = (record: ScheduledTaskRecord): Promise<unknown> =>
  redis.set(
    scheduleTaskKey(record.id),
    encryptJson(record) as string,
    "EX",
    SCHEDULE_RECORD_TTL_SECONDS,
  );

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
  await redis
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

export const updateScheduledTaskAfterRun = (
  record: ScheduledTaskRecord,
  nextRunAt: number,
): Promise<unknown> =>
  writeRecord({
    ...record,
    nextRunAt,
    lastRunAt: Date.now(),
    failureCount: 0,
    lastError: undefined,
  });

export const recordScheduledTaskFailure = async (
  record: ScheduledTaskRecord,
  errorMessage: string,
): Promise<{ shouldRetire: boolean }> => {
  const failureCount = record.failureCount + 1;
  if (failureCount >= SCHEDULE_FAILED_MESSAGE_LIMIT) {
    await deleteScheduledTask(record);
    return { shouldRetire: true };
  }
  // Only the error class + message are surfaced from `errorMessage`, but a
  // future failure mode could embed a token or PII into the string. Truncate
  // hard, and store as part of the encrypted record so it can't leak via a
  // raw Redis dump.
  await writeRecord({
    ...record,
    failureCount,
    lastError: errorMessage.slice(0, 500),
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
