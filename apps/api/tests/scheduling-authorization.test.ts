import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ScheduledTaskRecord } from "../server/scheduling/store";

const mocks = vi.hoisted(() => ({
  loadScheduledTask: vi.fn(),
  markScheduledTaskCancelled: vi.fn(),
  listScheduledTasksForTeam: vi.fn(),
  saveScheduledTask: vi.fn(),
  deleteScheduledTask: vi.fn(),
  send: vi.fn(),
}));

vi.mock("../server/scheduling/store", () => ({
  loadScheduledTask: mocks.loadScheduledTask,
  markScheduledTaskCancelled: mocks.markScheduledTaskCancelled,
  listScheduledTasksForTeam: mocks.listScheduledTasksForTeam,
  saveScheduledTask: mocks.saveScheduledTask,
  deleteScheduledTask: mocks.deleteScheduledTask,
}));

vi.mock("@vercel/queue", () => ({ send: mocks.send }));

import {
  cancelScheduledTask,
  listScheduledTasksForUser,
} from "../server/scheduling";

const baseRecord: ScheduledTaskRecord = {
  id: "task-1",
  teamId: "T_A",
  channelId: "C0001",
  threadId: "slack:C0001:1700000000.000001",
  isDM: false,
  createdByUserId: "U_OWNER",
  prompt: "remind us to ship the digest",
  cronExpression: "0 9 * * 1-5",
  recurring: true,
  userTimezone: "UTC",
  nextRunAt: Date.now() + 60_000,
  createdAt: Date.now(),
  cancelled: false,
  failureCount: 0,
};

describe("cancelScheduledTask authorization", () => {
  beforeEach(() => {
    mocks.loadScheduledTask.mockReset();
    mocks.markScheduledTaskCancelled.mockReset();
  });

  afterEach(() => vi.clearAllMocks());

  it("rejects cross-team cancellation (P3-4)", async () => {
    mocks.loadScheduledTask.mockResolvedValue(baseRecord);
    const result = await cancelScheduledTask("task-1", "T_B", "U_OWNER");
    expect(result).toEqual({ ok: false, reason: "wrong_team" });
    expect(mocks.markScheduledTaskCancelled).not.toHaveBeenCalled();
  });

  it("rejects cross-user cancellation within the same team (P2-3)", async () => {
    mocks.loadScheduledTask.mockResolvedValue(baseRecord);
    const result = await cancelScheduledTask("task-1", "T_A", "U_NOT_OWNER");
    expect(result).toEqual({ ok: false, reason: "wrong_user" });
    expect(mocks.markScheduledTaskCancelled).not.toHaveBeenCalled();
  });

  it("allows the owner to cancel their own task", async () => {
    mocks.loadScheduledTask.mockResolvedValue(baseRecord);
    mocks.markScheduledTaskCancelled.mockResolvedValue({
      ...baseRecord,
      cancelled: true,
    });
    const result = await cancelScheduledTask("task-1", "T_A", "U_OWNER");
    expect(result.ok).toBe(true);
    expect(mocks.markScheduledTaskCancelled).toHaveBeenCalledWith("task-1");
  });

  it("returns not_found when the record is gone (no auth check leak)", async () => {
    mocks.loadScheduledTask.mockResolvedValue(null);
    const result = await cancelScheduledTask("ghost", "T_A", "U_OWNER");
    expect(result).toEqual({ ok: false, reason: "not_found" });
  });
});

describe("listScheduledTasksForUser scoping (P2-4)", () => {
  beforeEach(() => {
    mocks.listScheduledTasksForTeam.mockReset();
  });

  afterEach(() => vi.clearAllMocks());

  it("returns only the calling user's tasks", async () => {
    mocks.listScheduledTasksForTeam.mockResolvedValue([
      { ...baseRecord, id: "owner-task", createdByUserId: "U_OWNER" },
      { ...baseRecord, id: "other-task", createdByUserId: "U_OTHER" },
      { ...baseRecord, id: "owner-task-2", createdByUserId: "U_OWNER" },
    ]);

    const result = await listScheduledTasksForUser("T_A", "U_OWNER");
    expect(result.map((entry) => entry.id)).toEqual([
      "owner-task",
      "owner-task-2",
    ]);
  });

  it("returns an empty list when the user has no tasks", async () => {
    mocks.listScheduledTasksForTeam.mockResolvedValue([
      { ...baseRecord, createdByUserId: "U_OTHER" },
    ]);

    const result = await listScheduledTasksForUser("T_A", "U_OWNER");
    expect(result).toEqual([]);
  });
});
