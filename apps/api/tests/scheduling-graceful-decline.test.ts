import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { scheduleTask } from "../server/scheduling";

const VERCEL_ENV_KEYS = [
  "VERCEL",
  "VERCEL_URL",
  "VERCEL_ENV",
  "NEXT_RUNTIME_VERCEL",
] as const;

describe("scheduleTask graceful decline", () => {
  const originalVercelEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of VERCEL_ENV_KEYS) {
      originalVercelEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of VERCEL_ENV_KEYS) {
      if (originalVercelEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalVercelEnv[key];
    }
  });

  it("returns queues_unavailable on self-hosted without touching redis or the queue", async () => {
    const result = await scheduleTask({
      teamId: "T0001",
      channelId: "C0001",
      threadId: "slack:C0001:1700000000.000001",
      isDM: false,
      createdByUserId: "U0001",
      prompt: "remind us to ship the digest",
      delaySeconds: 600,
    });

    expect(result).toEqual({
      ok: false,
      reason: "queues_unavailable",
      message: expect.stringContaining("Vercel Queues"),
    });
  });

  it("does not crash when called with a long recurring interval and queues are unavailable", async () => {
    const result = await scheduleTask({
      teamId: "T0002",
      channelId: "C0002",
      threadId: "slack:C0002:1700000000.000002",
      isDM: true,
      createdByUserId: "U0002",
      prompt: "weekly digest",
      delaySeconds: 60,
      intervalSeconds: 7 * 24 * 60 * 60,
    });

    expect(result.ok).toBe(false);
  });
});
