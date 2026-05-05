import {
  REAUTH_NOTICE_TTL_SECONDS,
  THREAD_LOCK_TTL_SECONDS,
} from "./constants";

import type { Redis } from "ioredis";

export interface QueuedFollowUp {
  messageId: string;
  text: string;
}

const lockKey = (threadId: string): string => `pookie:gen-lock:${threadId}`;

const queueKey = (threadId: string): string => `pookie:followups:${threadId}`;

// Reverse-mapping so onMessageDeleted can locate which thread queue a
// message was enqueued into, given only channelId + messageTs.
const followUpRefKey = (channelId: string, messageTs: string): string =>
  `pookie:followup-ref:${channelId}:${messageTs}`;

export const tryAcquireThreadLock = async (
  kv: Redis,
  threadId: string,
): Promise<boolean> => {
  const result = await kv.set(
    lockKey(threadId),
    "1",
    "EX",
    THREAD_LOCK_TTL_SECONDS,
    "NX",
  );
  return result === "OK";
};

export const releaseThreadLock = async (
  kv: Redis,
  threadId: string,
): Promise<void> => {
  await kv.del(lockKey(threadId));
};

export const enqueueFollowUp = async (
  kv: Redis,
  threadId: string,
  channelId: string,
  followUp: QueuedFollowUp,
): Promise<void> => {
  const key = queueKey(threadId);
  await kv.rpush(key, JSON.stringify(followUp));
  await kv.expire(key, THREAD_LOCK_TTL_SECONDS);
  await kv.set(
    followUpRefKey(channelId, followUp.messageId),
    threadId,
    "EX",
    THREAD_LOCK_TTL_SECONDS,
  );
};

export const removeDeletedFollowUp = async (
  kv: Redis,
  channelId: string,
  deletedTs: string,
): Promise<void> => {
  const refKey = followUpRefKey(channelId, deletedTs);
  const threadId = await kv.get(refKey);
  if (!threadId) return;
  await removeFollowUpByMessageId(kv, threadId, deletedTs);
  await kv.del(refKey);
};

const removeFollowUpByMessageId = async (
  kv: Redis,
  threadId: string,
  messageId: string,
): Promise<void> => {
  const key = queueKey(threadId);
  const items = await kv.lrange(key, 0, -1);
  for (const rawItem of items) {
    try {
      const parsed = parseFollowUp(rawItem);
      if (parsed && parsed.messageId === messageId) {
        // LREM removes the first occurrence of the exact serialized value
        await kv.lrem(key, 1, rawItem);
        return;
      }
    } catch {
      // Skip unparseable items
    }
  }
};

const parseFollowUp = (raw: unknown): QueuedFollowUp | null => {
  if (typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (
      typeof parsed.messageId === "string" &&
      typeof parsed.text === "string"
    ) {
      return { messageId: parsed.messageId, text: parsed.text };
    }
    return null;
  } catch {
    return null;
  }
};

const reauthNoticeKey = (threadId: string, userId: string): string =>
  `pookie:reauth-notice:${threadId}:${userId}`;

export const tryMarkReauthNoticeSent = async (
  kv: Redis,
  threadId: string,
  userId: string,
): Promise<boolean> => {
  const result = await kv.set(
    reauthNoticeKey(threadId, userId),
    "1",
    "EX",
    REAUTH_NOTICE_TTL_SECONDS,
    "NX",
  );
  return result === "OK";
};

// Uses LTRIM instead of DEL so a message RPUSHed between the LRANGE
// and the trim is preserved rather than silently dropped.
export const drainFollowUps = async (
  kv: Redis,
  threadId: string,
): Promise<string[]> => {
  const key = queueKey(threadId);
  const items = await kv.lrange(key, 0, -1);
  if (items.length > 0) await kv.ltrim(key, items.length, -1);

  return items
    .map((rawItem) => {
      const parsed = parseFollowUp(rawItem);
      return parsed?.text;
    })
    .filter(
      (text): text is string => typeof text === "string" && text.length > 0,
    );
};
