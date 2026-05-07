import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  saveScheduledTask: vi.fn(),
  deleteScheduledTask: vi.fn(),
  listScheduledTasksForTeam: vi.fn(),
  loadScheduledTask: vi.fn(),
  markScheduledTaskCancelled: vi.fn(),
  send: vi.fn(),
}));

vi.mock("../server/scheduling/store", () => ({
  saveScheduledTask: mocks.saveScheduledTask,
  deleteScheduledTask: mocks.deleteScheduledTask,
  listScheduledTasksForTeam: mocks.listScheduledTasksForTeam,
  loadScheduledTask: mocks.loadScheduledTask,
  markScheduledTaskCancelled: mocks.markScheduledTaskCancelled,
}));

vi.mock("@vercel/queue", () => ({
  send: mocks.send,
}));

import {
  publishScheduledTaskMessage,
  scheduleTask,
} from "../server/scheduling";
import {
  SCHEDULE_MAX_PER_TEAM,
  SCHEDULE_MAX_PER_USER,
  SCHEDULE_PROMPT_MAX_CHARS,
  SCHEDULED_TASK_TOPIC,
} from "../server/scheduling/constants";

const validInput = {
  teamId: "T0001",
  channelId: "C0001",
  threadId: "slack:C0001:1700000000.000001",
  isDM: false,
  createdByUserId: "U0001",
  prompt: "remind us to ship the digest",
  // 9am every weekday in Pacific time — well above the 10-min recurring floor.
  cronExpression: "0 9 * * 1-5",
  recurring: true,
  userTimezone: "America/Los_Angeles",
};

describe("scheduleTask validation", () => {
  let originalVercel: string | undefined;

  beforeEach(() => {
    originalVercel = process.env.VERCEL;
    process.env.VERCEL = "1";
    mocks.saveScheduledTask.mockReset().mockResolvedValue(undefined);
    mocks.deleteScheduledTask.mockReset().mockResolvedValue(undefined);
    mocks.listScheduledTasksForTeam.mockReset().mockResolvedValue([]);
    mocks.send.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    if (originalVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = originalVercel;
    vi.clearAllMocks();
  });

  it("rejects an empty prompt", async () => {
    const result = await scheduleTask({ ...validInput, prompt: "   " });
    expect(result).toMatchObject({ ok: false, reason: "validation" });
    expect(mocks.saveScheduledTask).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("rejects a prompt over the size cap", async () => {
    const result = await scheduleTask({
      ...validInput,
      prompt: "x".repeat(SCHEDULE_PROMPT_MAX_CHARS + 1),
    });
    expect(result).toMatchObject({ ok: false, reason: "validation" });
  });

  it("rejects a malformed cron expression", async () => {
    const result = await scheduleTask({
      ...validInput,
      cronExpression: "not a cron",
    });
    expect(result).toMatchObject({ ok: false, reason: "validation" });
  });

  it("rejects a recurring cron with sub-10-minute gaps", async () => {
    // every minute = 60-second gap, well below the 10-minute recurring floor
    const result = await scheduleTask({
      ...validInput,
      cronExpression: "* * * * *",
      recurring: true,
    });
    expect(result).toMatchObject({ ok: false, reason: "validation" });
    expect((result as { ok: false; message: string }).message).toMatch(
      /recurring cron schedules/i,
    );
  });

  it("accepts the same sub-10-minute cron when recurring is false (one-shot)", async () => {
    const result = await scheduleTask({
      ...validInput,
      cronExpression: "* * * * *",
      recurring: false,
    });
    expect(result.ok).toBe(true);
  });

  it("rejects when the per-team limit is already reached", async () => {
    mocks.listScheduledTasksForTeam.mockResolvedValue(
      Array.from({ length: SCHEDULE_MAX_PER_TEAM }, (_unused, recordIndex) => ({
        id: `task-${recordIndex}`,
        teamId: validInput.teamId,
        channelId: validInput.channelId,
        threadId: validInput.threadId,
        isDM: false,
        createdByUserId: `OTHER_USER_${recordIndex}`,
        prompt: "x",
        cronExpression: "0 9 * * 1-5",
        recurring: true,
        userTimezone: "UTC",
        nextRunAt: Date.now() + 60_000,
        createdAt: Date.now(),
        cancelled: false,
        failureCount: 0,
      })),
    );

    const result = await scheduleTask(validInput);
    expect(result).toMatchObject({ ok: false, reason: "limit_reached" });
    expect(mocks.saveScheduledTask).not.toHaveBeenCalled();
  });

  it("rejects when the per-user limit is already reached", async () => {
    mocks.listScheduledTasksForTeam.mockResolvedValue(
      Array.from({ length: SCHEDULE_MAX_PER_USER }, (_unused, recordIndex) => ({
        id: `task-${recordIndex}`,
        teamId: validInput.teamId,
        channelId: validInput.channelId,
        threadId: validInput.threadId,
        isDM: false,
        createdByUserId: validInput.createdByUserId,
        prompt: "x",
        cronExpression: "0 9 * * 1-5",
        recurring: true,
        userTimezone: "UTC",
        nextRunAt: Date.now() + 60_000,
        createdAt: Date.now(),
        cancelled: false,
        failureCount: 0,
      })),
    );

    const result = await scheduleTask(validInput);
    expect(result).toMatchObject({ ok: false, reason: "user_limit_reached" });
    expect(mocks.saveScheduledTask).not.toHaveBeenCalled();
  });

  it("does not count cancelled tasks against the limit", async () => {
    mocks.listScheduledTasksForTeam.mockResolvedValue(
      Array.from({ length: SCHEDULE_MAX_PER_TEAM }, (_unused, recordIndex) => ({
        id: `task-${recordIndex}`,
        teamId: validInput.teamId,
        channelId: validInput.channelId,
        threadId: validInput.threadId,
        isDM: false,
        createdByUserId: validInput.createdByUserId,
        prompt: "x",
        cronExpression: "0 9 * * 1-5",
        recurring: true,
        userTimezone: "UTC",
        nextRunAt: Date.now() + 60_000,
        createdAt: Date.now(),
        cancelled: true,
        failureCount: 0,
      })),
    );

    const result = await scheduleTask(validInput);
    expect(result.ok).toBe(true);
  });

  it("cleans up the redis record if the queue publish fails", async () => {
    mocks.send.mockRejectedValue(new Error("queue boom"));

    const result = await scheduleTask(validInput);

    expect(result).toMatchObject({ ok: false, reason: "send_failed" });
    expect(mocks.saveScheduledTask).toHaveBeenCalledTimes(1);
    expect(mocks.deleteScheduledTask).toHaveBeenCalledTimes(1);
  });

  it("survives a cleanup failure when the queue publish also fails", async () => {
    mocks.send.mockRejectedValue(new Error("queue boom"));
    mocks.deleteScheduledTask.mockRejectedValue(new Error("redis blip"));

    const result = await scheduleTask(validInput);
    expect(result).toMatchObject({ ok: false, reason: "send_failed" });
  });

  it("computes the first fire correctly in the user's timezone (e.g. weekday 9am LA)", async () => {
    // Anchor "now" to a known instant: Sunday 2026-05-03 12:00 UTC = 5am Pacific.
    // Cron `0 9 * * 1-5` interpreted in America/Los_Angeles should fire next at
    // Mon May 4, 9am PT = Mon May 4 16:00 UTC.
    const FIXED_NOW = Date.UTC(2026, 4, 3, 12, 0, 0);
    vi.useFakeTimers();
    vi.setSystemTime(new Date(FIXED_NOW));

    const result = await scheduleTask(validInput);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const expectedNextFire = Date.UTC(2026, 4, 4, 16, 0, 0);
      expect(result.record.nextRunAt).toBe(expectedNextFire);
    }

    vi.useRealTimers();
  });
});

describe("publishScheduledTaskMessage idempotency key", () => {
  let originalVercel: string | undefined;

  beforeEach(() => {
    originalVercel = process.env.VERCEL;
    process.env.VERCEL = "1";
    mocks.send.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    if (originalVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = originalVercel;
    vi.clearAllMocks();
  });

  it("includes the occurrence-time in the key so successive recurring fires don't collide", async () => {
    await publishScheduledTaskMessage("task-1", 3600, 1_700_000_000_000);
    await publishScheduledTaskMessage("task-1", 3600, 1_700_000_003_600_000);

    expect(mocks.send).toHaveBeenCalledTimes(2);
    const firstCall = mocks.send.mock.calls[0]!;
    const secondCall = mocks.send.mock.calls[1]!;
    const firstKey = (firstCall[2] as { idempotencyKey: string })
      .idempotencyKey;
    const secondKey = (secondCall[2] as { idempotencyKey: string })
      .idempotencyKey;

    expect(firstKey).not.toBe(secondKey);
    expect(firstCall[0]).toBe(SCHEDULED_TASK_TOPIC);
  });

  it("produces the SAME key when called twice for the same occurrence (consumer-retry collapse)", async () => {
    await publishScheduledTaskMessage("task-2", 3600, 1_700_000_000_000);
    await publishScheduledTaskMessage("task-2", 3600, 1_700_000_000_000);

    const firstKey = (
      mocks.send.mock.calls[0]![2] as { idempotencyKey: string }
    ).idempotencyKey;
    const secondKey = (
      mocks.send.mock.calls[1]![2] as { idempotencyKey: string }
    ).idempotencyKey;

    // Same occurrence + same chunk shape → same key, so the queue dedup
    // window collapses a flaky-publish retry to the original message.
    expect(firstKey).toBe(secondKey);
  });
});
