import { describe, expect, it, vi } from "vitest";

import {
  drainFollowUps,
  enqueueFollowUp,
  releaseThreadLock,
  removeDeletedFollowUp,
  tryAcquireThreadLock,
} from "../server/agent/thread-lock";

import type { Redis } from "ioredis";

const createFakeRedis = (): Redis & {
  _store: Map<string, unknown>;
  _lists: Map<string, string[]>;
  _expiries: Map<string, number>;
} => {
  const store = new Map<string, unknown>();
  const lists = new Map<string, string[]>();
  const expiries = new Map<string, number>();

  return {
    _store: store,
    _lists: lists,
    _expiries: expiries,

    set: vi.fn(async (key: string, value: unknown, ...args: unknown[]) => {
      // ioredis variadic form: set(key, val, "EX", seconds, "NX")
      const flags = args.map((a) =>
        typeof a === "string" ? a.toUpperCase() : a,
      );
      const nx = flags.includes("NX");
      const exIdx = flags.indexOf("EX");
      const ex =
        exIdx >= 0 && typeof flags[exIdx + 1] === "number"
          ? (flags[exIdx + 1] as number)
          : undefined;
      if (nx && store.has(key)) return null;
      store.set(key, value);
      if (ex !== undefined) expiries.set(key, ex);
      return "OK";
    }),

    get: vi.fn(async (key: string) => {
      return store.get(key) ?? null;
    }),

    del: vi.fn(async (...keys: string[]) => {
      let deleted = 0;
      for (const key of keys) {
        if (store.delete(key)) deleted++;
        lists.delete(key);
        expiries.delete(key);
      }
      return deleted;
    }),

    rpush: vi.fn(async (key: string, ...values: string[]) => {
      const list = lists.get(key) ?? [];
      list.push(...values);
      lists.set(key, list);
      return list.length;
    }),

    expire: vi.fn(async (key: string, seconds: number) => {
      expiries.set(key, seconds);
      return 1;
    }),

    lrange: vi.fn(async (key: string, _start: number, _stop: number) => {
      return [...(lists.get(key) ?? [])];
    }),

    ltrim: vi.fn(async (key: string, start: number, stop: number) => {
      const list = lists.get(key) ?? [];
      lists.set(key, list.slice(start, stop === -1 ? undefined : stop + 1));
      return "OK";
    }),

    lrem: vi.fn(async (key: string, count: number, value: string) => {
      const list = lists.get(key) ?? [];
      let removed = 0;
      const remaining: string[] = [];
      for (const item of list) {
        if (removed < Math.abs(count) && item === value) {
          removed++;
        } else {
          remaining.push(item);
        }
      }
      lists.set(key, remaining);
      return removed;
    }),
  } as unknown as Redis & {
    _store: Map<string, unknown>;
    _lists: Map<string, string[]>;
    _expiries: Map<string, number>;
  };
};

describe("tryAcquireThreadLock", () => {
  it("acquires the lock on first call", async () => {
    const kv = createFakeRedis();
    const acquired = await tryAcquireThreadLock(kv, "thread-1");
    expect(acquired).toBe(true);
  });

  it("rejects a second acquisition for the same thread", async () => {
    const kv = createFakeRedis();
    await tryAcquireThreadLock(kv, "thread-1");
    const second = await tryAcquireThreadLock(kv, "thread-1");
    expect(second).toBe(false);
  });

  it("allows acquisition for different threads", async () => {
    const kv = createFakeRedis();
    const first = await tryAcquireThreadLock(kv, "thread-1");
    const second = await tryAcquireThreadLock(kv, "thread-2");
    expect(first).toBe(true);
    expect(second).toBe(true);
  });
});

describe("releaseThreadLock", () => {
  it("releases the lock so a new acquisition succeeds", async () => {
    const kv = createFakeRedis();
    await tryAcquireThreadLock(kv, "thread-1");
    await releaseThreadLock(kv, "thread-1");
    const reacquired = await tryAcquireThreadLock(kv, "thread-1");
    expect(reacquired).toBe(true);
  });
});

describe("enqueueFollowUp", () => {
  it("pushes a follow-up onto the thread queue", async () => {
    const kv = createFakeRedis();
    await enqueueFollowUp(kv, "thread-1", "C123", {
      messageId: "msg-1",
      text: "hello",
    });
    await enqueueFollowUp(kv, "thread-1", "C123", {
      messageId: "msg-2",
      text: "world",
    });

    const queued = kv._lists.get("pookie:followups:thread-1") ?? [];
    expect(queued).toHaveLength(2);
    expect(JSON.parse(queued[0]!)).toEqual({
      messageId: "msg-1",
      text: "hello",
    });
  });

  it("sets an expiry on the queue key", async () => {
    const kv = createFakeRedis();
    await enqueueFollowUp(kv, "thread-1", "C123", {
      messageId: "msg-1",
      text: "hello",
    });
    expect(kv._expiries.has("pookie:followups:thread-1")).toBe(true);
  });

  it("stores a reverse-mapping ref for delete lookups", async () => {
    const kv = createFakeRedis();
    await enqueueFollowUp(kv, "thread-1", "C123", {
      messageId: "msg-1",
      text: "hello",
    });
    expect(kv._store.get("pookie:followup-ref:C123:msg-1")).toBe("thread-1");
  });
});

describe("drainFollowUps", () => {
  it("returns all queued message texts and clears them", async () => {
    const kv = createFakeRedis();
    await enqueueFollowUp(kv, "thread-1", "C123", {
      messageId: "a",
      text: "text-a",
    });
    await enqueueFollowUp(kv, "thread-1", "C123", {
      messageId: "b",
      text: "text-b",
    });
    await enqueueFollowUp(kv, "thread-1", "C123", {
      messageId: "c",
      text: "text-c",
    });

    const drained = await drainFollowUps(kv, "thread-1");
    expect(drained).toEqual(["text-a", "text-b", "text-c"]);

    const second = await drainFollowUps(kv, "thread-1");
    expect(second).toEqual([]);
  });

  it("returns an empty array when no messages are queued", async () => {
    const kv = createFakeRedis();
    const drained = await drainFollowUps(kv, "thread-1");
    expect(drained).toEqual([]);
  });

  it("preserves messages pushed between lrange and ltrim", async () => {
    const kv = createFakeRedis();
    await enqueueFollowUp(kv, "thread-1", "C123", {
      messageId: "first",
      text: "first-text",
    });

    const originalLtrim = kv.ltrim;
    (kv as unknown as { ltrim: typeof originalLtrim }).ltrim = vi.fn(
      async (key: string, start: number, stop: number) => {
        const list = kv._lists.get(key) ?? [];
        list.push(JSON.stringify({ messageId: "late", text: "late-push" }));
        kv._lists.set(key, list);
        return originalLtrim.call(kv, key, start, stop);
      },
    );

    const drained = await drainFollowUps(kv, "thread-1");
    expect(drained).toEqual(["first-text"]);

    const remaining = kv._lists.get("pookie:followups:thread-1") ?? [];
    expect(remaining.length).toBeGreaterThan(0);
  });
});

describe("removeDeletedFollowUp", () => {
  it("removes a queued follow-up by channelId + messageTs", async () => {
    const kv = createFakeRedis();
    await enqueueFollowUp(kv, "thread-1", "C123", {
      messageId: "msg-to-delete",
      text: "should be gone",
    });
    await enqueueFollowUp(kv, "thread-1", "C123", {
      messageId: "msg-keep",
      text: "should stay",
    });

    await removeDeletedFollowUp(kv, "C123", "msg-to-delete");

    const drained = await drainFollowUps(kv, "thread-1");
    expect(drained).toEqual(["should stay"]);
  });

  it("is a no-op when the message was not enqueued", async () => {
    const kv = createFakeRedis();
    await enqueueFollowUp(kv, "thread-1", "C123", {
      messageId: "msg-1",
      text: "stays",
    });

    await removeDeletedFollowUp(kv, "C123", "msg-unknown");

    const drained = await drainFollowUps(kv, "thread-1");
    expect(drained).toEqual(["stays"]);
  });

  it("cleans up the reverse-mapping ref key", async () => {
    const kv = createFakeRedis();
    await enqueueFollowUp(kv, "thread-1", "C123", {
      messageId: "msg-1",
      text: "text",
    });

    expect(kv._store.has("pookie:followup-ref:C123:msg-1")).toBe(true);
    await removeDeletedFollowUp(kv, "C123", "msg-1");
    expect(kv._store.has("pookie:followup-ref:C123:msg-1")).toBe(false);
  });
});
