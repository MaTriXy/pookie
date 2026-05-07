import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ScheduledTaskRecord } from "../server/scheduling/store";

const multiCalls = vi.hoisted(() => ({
  set: vi.fn().mockReturnThis(),
  sadd: vi.fn().mockReturnThis(),
  expire: vi.fn().mockReturnThis(),
  del: vi.fn().mockReturnThis(),
  srem: vi.fn().mockReturnThis(),
  exec: vi.fn().mockResolvedValue([]),
}));

const fakeRedis = vi.hoisted(() => ({
  multi: vi.fn(() => multiCalls),
  set: vi.fn().mockResolvedValue("OK"),
  get: vi.fn().mockResolvedValue(null),
  smembers: vi.fn().mockResolvedValue([]),
  mget: vi.fn().mockResolvedValue([]),
  srem: vi.fn().mockResolvedValue(0),
}));

vi.mock("../server/mcp/redis", () => ({
  get redis() {
    return fakeRedis;
  },
}));

vi.mock("../server/utils/secure-store", () => ({
  encryptJson: (value: unknown) => JSON.stringify(value),
  decryptJson: <T>(stored: unknown): T => {
    if (typeof stored !== "string") return stored as T;
    try {
      return JSON.parse(stored) as T;
    } catch {
      return stored as T;
    }
  },
}));

import {
  SCHEDULE_RECORD_TTL_SECONDS,
  scheduleTaskKey,
  scheduleTeamSetKey,
} from "../server/scheduling/constants";
import {
  saveScheduledTask,
  updateScheduledTaskAfterRun,
  recordScheduledTaskFailure,
  markScheduledTaskCancelled,
} from "../server/scheduling/store";

const baseRecord: ScheduledTaskRecord = {
  id: "task-1",
  teamId: "T_TTL",
  channelId: "C_TTL",
  threadId: "slack:C_TTL:1700000000.000001",
  isDM: false,
  createdByUserId: "U_TTL",
  prompt: "remind us",
  intervalSeconds: 3600,
  nextRunAt: Date.now() + 3600_000,
  createdAt: Date.now(),
  cancelled: false,
  failureCount: 0,
};

describe("scheduled-task store: team-set TTL refresh on every write (cursor[bot] MEDIUM)", () => {
  beforeEach(() => {
    multiCalls.set.mockClear().mockReturnThis();
    multiCalls.sadd.mockClear().mockReturnThis();
    multiCalls.expire.mockClear().mockReturnThis();
    multiCalls.del.mockClear().mockReturnThis();
    multiCalls.srem.mockClear().mockReturnThis();
    multiCalls.exec.mockClear().mockResolvedValue([]);
    fakeRedis.multi.mockClear();
    fakeRedis.get.mockReset().mockResolvedValue(null);
  });

  afterEach(() => vi.clearAllMocks());

  const expectMultiRefreshedBothKeys = (record: ScheduledTaskRecord) => {
    expect(multiCalls.set).toHaveBeenCalledWith(
      scheduleTaskKey(record.id),
      expect.any(String),
      "EX",
      SCHEDULE_RECORD_TTL_SECONDS,
    );
    expect(multiCalls.sadd).toHaveBeenCalledWith(
      scheduleTeamSetKey(record.teamId),
      record.id,
    );
    expect(multiCalls.expire).toHaveBeenCalledWith(
      scheduleTeamSetKey(record.teamId),
      SCHEDULE_RECORD_TTL_SECONDS,
    );
  };

  it("saveScheduledTask sets the record TTL AND the team-set TTL", async () => {
    await saveScheduledTask(baseRecord);
    expectMultiRefreshedBothKeys(baseRecord);
  });

  it("updateScheduledTaskAfterRun refreshes BOTH the record AND the team-set TTL", async () => {
    await updateScheduledTaskAfterRun(
      baseRecord,
      baseRecord.nextRunAt + 60_000,
    );
    expectMultiRefreshedBothKeys(baseRecord);
  });

  it("recordScheduledTaskFailure refreshes BOTH the record AND the team-set TTL", async () => {
    await recordScheduledTaskFailure(baseRecord, "queue blip");
    expectMultiRefreshedBothKeys(baseRecord);
  });

  it("markScheduledTaskCancelled refreshes BOTH the record AND the team-set TTL", async () => {
    fakeRedis.get.mockResolvedValueOnce(JSON.stringify(baseRecord));
    await markScheduledTaskCancelled(baseRecord.id);
    expectMultiRefreshedBothKeys(baseRecord);
  });
});
