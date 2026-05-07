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
  delaySeconds: 600,
};

describe("scheduleTask validation (M6)", () => {
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

  it("rejects a delay below the minimum", async () => {
    const result = await scheduleTask({ ...validInput, delaySeconds: 30 });
    expect(result).toMatchObject({ ok: false, reason: "validation" });
  });

  it("rejects a recurring interval below the recurring minimum", async () => {
    // 60s would have been valid for one-shot (delaySeconds floor), but
    // recurring tasks have a higher 10-minute floor to bound runaway cost.
    const result = await scheduleTask({
      ...validInput,
      intervalSeconds: 60,
    });
    expect(result).toMatchObject({ ok: false, reason: "validation" });
  });

  it("rejects when the per-team limit is already reached", async () => {
    mocks.listScheduledTasksForTeam.mockResolvedValue(
      Array.from({ length: SCHEDULE_MAX_PER_TEAM }, (_unused, recordIndex) => ({
        id: `task-${recordIndex}`,
        teamId: validInput.teamId,
        channelId: validInput.channelId,
        threadId: validInput.threadId,
        isDM: false,
        // Spread across distinct users so the per-user cap doesn't
        // short-circuit before the per-team cap kicks in.
        createdByUserId: `OTHER_USER_${recordIndex}`,
        prompt: "x",
        nextRunAt: Date.now(),
        createdAt: Date.now(),
        cancelled: false,
        failureCount: 0,
      })),
    );

    const result = await scheduleTask(validInput);
    expect(result).toMatchObject({ ok: false, reason: "limit_reached" });
    expect(mocks.saveScheduledTask).not.toHaveBeenCalled();
  });

  it("rejects when the per-user limit is already reached (P2-2)", async () => {
    mocks.listScheduledTasksForTeam.mockResolvedValue(
      Array.from({ length: SCHEDULE_MAX_PER_USER }, (_unused, recordIndex) => ({
        id: `task-${recordIndex}`,
        teamId: validInput.teamId,
        channelId: validInput.channelId,
        threadId: validInput.threadId,
        isDM: false,
        createdByUserId: validInput.createdByUserId,
        prompt: "x",
        nextRunAt: Date.now(),
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
        nextRunAt: Date.now(),
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

  it("survives a cleanup failure when the queue publish also fails (M5)", async () => {
    mocks.send.mockRejectedValue(new Error("queue boom"));
    mocks.deleteScheduledTask.mockRejectedValue(new Error("redis blip"));

    const result = await scheduleTask(validInput);
    expect(result).toMatchObject({ ok: false, reason: "send_failed" });
  });
});

describe("publishScheduledTaskMessage idempotency key (cursor[bot] HIGH)", () => {
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
