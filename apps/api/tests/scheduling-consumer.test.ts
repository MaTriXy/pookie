import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as SchedulingModule from "../server/scheduling/index";
import type { ScheduledTaskRecord } from "../server/scheduling/store";

const mocks = vi.hoisted(() => ({
  claimDedupSlot: vi.fn(),
  loadScheduledTask: vi.fn(),
  deleteScheduledTask: vi.fn(),
  recordScheduledTaskFailure: vi.fn(),
  updateScheduledTaskAfterRun: vi.fn(),
  publishScheduledTaskMessage: vi.fn(),
  handleSlackMessage: vi.fn(),
  threadPost: vi.fn(),
  threadRefresh: vi.fn(),
}));

vi.mock("../server/scheduling/store", () => ({
  claimDedupSlot: mocks.claimDedupSlot,
  loadScheduledTask: mocks.loadScheduledTask,
  deleteScheduledTask: mocks.deleteScheduledTask,
  recordScheduledTaskFailure: mocks.recordScheduledTaskFailure,
  updateScheduledTaskAfterRun: mocks.updateScheduledTaskAfterRun,
}));

vi.mock("../server/scheduling/index", async (importOriginal) => {
  const actual = await importOriginal<typeof SchedulingModule>();
  return {
    ...actual,
    publishScheduledTaskMessage: mocks.publishScheduledTaskMessage,
  };
});

vi.mock("chat", () => ({
  Message: class {
    constructor(public data: Record<string, unknown>) {}
  },
  ThreadImpl: {
    fromJSON: vi.fn(() => ({
      refresh: mocks.threadRefresh,
      post: mocks.threadPost,
    })),
  },
  parseMarkdown: vi.fn((text: string) => ({ type: "root", text })),
}));

vi.mock("../server/slack-bot", () => ({
  slackBot: {
    getAdapter: vi.fn(() => ({ botUserId: "UPOOKIE" })),
  },
}));

vi.mock("../server/agent", () => ({
  handleSlackMessage: mocks.handleSlackMessage,
}));

import { processScheduledTaskMessage } from "../server/scheduling/run-task";

const baseRecord: ScheduledTaskRecord = {
  id: "task-1",
  teamId: "T0001",
  channelId: "C0001",
  threadId: "slack:C0001:1700000000.000001",
  isDM: false,
  createdByUserId: "U0001",
  prompt: "remind us to ship the digest",
  nextRunAt: Date.now() + 60_000,
  createdAt: Date.now(),
  cancelled: false,
  failureCount: 0,
};

describe("processScheduledTaskMessage", () => {
  beforeEach(() => {
    mocks.claimDedupSlot.mockReset().mockResolvedValue(true);
    mocks.loadScheduledTask.mockReset();
    mocks.deleteScheduledTask.mockReset().mockResolvedValue(undefined);
    mocks.recordScheduledTaskFailure
      .mockReset()
      .mockResolvedValue({ shouldRetire: false });
    mocks.updateScheduledTaskAfterRun.mockReset().mockResolvedValue(undefined);
    mocks.publishScheduledTaskMessage
      .mockReset()
      .mockResolvedValue({ ok: true });
    mocks.handleSlackMessage.mockReset().mockResolvedValue(undefined);
    mocks.threadPost.mockReset().mockResolvedValue({ id: "1700000000.999999" });
    mocks.threadRefresh.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => vi.clearAllMocks());

  describe("redelivery dedup (H1)", () => {
    it("acks and skips when the dedup slot was already claimed", async () => {
      mocks.claimDedupSlot.mockResolvedValue(false);

      const result = await processScheduledTaskMessage({
        message: { taskId: baseRecord.id, remainingDelaySeconds: 0 },
        messageId: "msg-redelivered",
      });

      expect(result).toEqual({
        status: "redelivered",
        taskId: baseRecord.id,
      });
      expect(mocks.loadScheduledTask).not.toHaveBeenCalled();
      expect(mocks.handleSlackMessage).not.toHaveBeenCalled();
      expect(mocks.publishScheduledTaskMessage).not.toHaveBeenCalled();
    });

    it("processes normally when the dedup slot is fresh", async () => {
      mocks.loadScheduledTask.mockResolvedValue(baseRecord);

      const result = await processScheduledTaskMessage({
        message: { taskId: baseRecord.id, remainingDelaySeconds: 0 },
        messageId: "msg-fresh",
      });

      expect(mocks.handleSlackMessage).toHaveBeenCalledTimes(1);
      expect(result.status).toBe("ran");
    });
  });

  describe("missing & cancelled records", () => {
    it("returns missing when the record is gone", async () => {
      mocks.loadScheduledTask.mockResolvedValue(null);

      const result = await processScheduledTaskMessage({
        message: { taskId: "ghost", remainingDelaySeconds: 0 },
        messageId: "msg-missing",
      });

      expect(result).toEqual({ status: "missing", taskId: "ghost" });
      expect(mocks.handleSlackMessage).not.toHaveBeenCalled();
    });

    it("acks and deletes when the record was cancelled", async () => {
      mocks.loadScheduledTask.mockResolvedValue({
        ...baseRecord,
        cancelled: true,
      });

      const result = await processScheduledTaskMessage({
        message: { taskId: baseRecord.id, remainingDelaySeconds: 0 },
        messageId: "msg-cancelled",
      });

      expect(result).toEqual({ status: "cancelled", taskId: baseRecord.id });
      expect(mocks.deleteScheduledTask).toHaveBeenCalledTimes(1);
      expect(mocks.handleSlackMessage).not.toHaveBeenCalled();
    });
  });

  describe("daisy-chain (H2)", () => {
    it("republishes the next chunk and does not run the task", async () => {
      mocks.loadScheduledTask.mockResolvedValue(baseRecord);

      const result = await processScheduledTaskMessage({
        message: { taskId: baseRecord.id, remainingDelaySeconds: 86_400 },
        messageId: "msg-chunk",
      });

      expect(result).toEqual({
        status: "republished",
        taskId: baseRecord.id,
      });
      expect(mocks.publishScheduledTaskMessage).toHaveBeenCalledWith(
        baseRecord.id,
        86_400,
        baseRecord.nextRunAt,
      );
      expect(mocks.handleSlackMessage).not.toHaveBeenCalled();
    });

    it("records a failure when the daisy-chain republish fails", async () => {
      mocks.loadScheduledTask.mockResolvedValue(baseRecord);
      mocks.publishScheduledTaskMessage.mockResolvedValue({
        ok: false,
        error: "queue down",
      });
      mocks.recordScheduledTaskFailure.mockResolvedValue({
        shouldRetire: false,
      });

      const result = await processScheduledTaskMessage({
        message: { taskId: baseRecord.id, remainingDelaySeconds: 86_400 },
        messageId: "msg-chunk-fail",
      });

      expect(result.status).toBe("expired");
      expect(mocks.recordScheduledTaskFailure).toHaveBeenCalledWith(
        baseRecord,
        "queue down",
      );
    });

    it("retires after repeated daisy-chain failures", async () => {
      mocks.loadScheduledTask.mockResolvedValue(baseRecord);
      mocks.publishScheduledTaskMessage.mockResolvedValue({
        ok: false,
        error: "queue down",
      });
      mocks.recordScheduledTaskFailure.mockResolvedValue({
        shouldRetire: true,
      });

      const result = await processScheduledTaskMessage({
        message: { taskId: baseRecord.id, remainingDelaySeconds: 86_400 },
        messageId: "msg-chunk-retire",
      });

      expect(result.status).toBe("retired");
    });
  });

  describe("one-shot lifecycle", () => {
    it("runs the task and deletes the record when not recurring", async () => {
      mocks.loadScheduledTask.mockResolvedValue(baseRecord);

      const result = await processScheduledTaskMessage({
        message: { taskId: baseRecord.id, remainingDelaySeconds: 0 },
        messageId: "msg-oneshot",
      });

      expect(result.status).toBe("ran");
      expect(mocks.handleSlackMessage).toHaveBeenCalledTimes(1);
      expect(mocks.deleteScheduledTask).toHaveBeenCalledTimes(1);
      expect(mocks.publishScheduledTaskMessage).not.toHaveBeenCalled();
    });
  });

  describe("recurring lifecycle (H3)", () => {
    const recurringRecord: ScheduledTaskRecord = {
      ...baseRecord,
      intervalSeconds: 3600,
    };

    const buildUpdatedRecord = (
      previous: ScheduledTaskRecord,
    ): ScheduledTaskRecord => ({
      ...previous,
      nextRunAt: Date.now() + 3600 * 1000,
      lastRunAt: Date.now(),
      failureCount: 0,
      lastError: undefined,
    });

    it("runs the task, updates nextRunAt, and re-publishes the next occurrence with a fresh idempotency key", async () => {
      mocks.loadScheduledTask.mockResolvedValue(recurringRecord);
      const updatedRecord = buildUpdatedRecord(recurringRecord);
      mocks.updateScheduledTaskAfterRun.mockResolvedValue(updatedRecord);
      const before = Date.now();

      const result = await processScheduledTaskMessage({
        message: { taskId: recurringRecord.id, remainingDelaySeconds: 0 },
        messageId: "msg-recurring",
      });

      expect(result.status).toBe("ran");
      expect(mocks.handleSlackMessage).toHaveBeenCalledTimes(1);

      expect(mocks.updateScheduledTaskAfterRun).toHaveBeenCalledTimes(1);
      const [, nextRunAt] = mocks.updateScheduledTaskAfterRun.mock.calls[0]!;
      expect(nextRunAt).toBeGreaterThanOrEqual(before + 3600 * 1000);

      // Regression for cursor[bot] HIGH: the publish must use the NEW
      // nextRunAt as the occurrence id so the idempotency key differs from
      // the previous fire's key. If they were equal, Vercel Queues would
      // silently drop the recurring republish inside its dedup window.
      expect(mocks.publishScheduledTaskMessage).toHaveBeenCalledWith(
        recurringRecord.id,
        3600,
        updatedRecord.nextRunAt,
      );
      expect(updatedRecord.nextRunAt).not.toBe(recurringRecord.nextRunAt);
      expect(mocks.deleteScheduledTask).not.toHaveBeenCalled();
    });

    it("passes the UPDATED record (not the stale pre-update one) to trackFailure when the recurring publish fails (cursor[bot] MEDIUM)", async () => {
      // After a successful run, updateScheduledTaskAfterRun resets
      // failureCount to 0. If the next-occurrence publish then fails, we
      // must record that failure against the reset record — passing the
      // pre-update `record` would revive the prior failure count and make
      // a single publish blip retire a healthy task.
      const recordWithPriorFailures: ScheduledTaskRecord = {
        ...recurringRecord,
        failureCount: 4,
      };
      const updatedRecord = buildUpdatedRecord(recordWithPriorFailures);

      mocks.loadScheduledTask.mockResolvedValue(recordWithPriorFailures);
      mocks.updateScheduledTaskAfterRun.mockResolvedValue(updatedRecord);
      mocks.publishScheduledTaskMessage.mockResolvedValue({
        ok: false,
        error: "queue down",
      });
      mocks.recordScheduledTaskFailure.mockResolvedValue({
        shouldRetire: false,
      });

      const result = await processScheduledTaskMessage({
        message: {
          taskId: recordWithPriorFailures.id,
          remainingDelaySeconds: 0,
        },
        messageId: "msg-recurring-fail-after-run",
      });

      expect(result.status).toBe("expired");
      expect(mocks.recordScheduledTaskFailure).toHaveBeenCalledTimes(1);
      const [recordPassedToFailure, errorPassed] =
        mocks.recordScheduledTaskFailure.mock.calls[0]!;
      expect(recordPassedToFailure).toMatchObject({
        id: recordWithPriorFailures.id,
        failureCount: 0,
        nextRunAt: updatedRecord.nextRunAt,
      });
      expect(errorPassed).toBe("queue down");
    });

    it("returns retired after the failure limit is reached", async () => {
      mocks.loadScheduledTask.mockResolvedValue(recurringRecord);
      mocks.updateScheduledTaskAfterRun.mockResolvedValue(
        buildUpdatedRecord(recurringRecord),
      );
      mocks.publishScheduledTaskMessage.mockResolvedValue({
        ok: false,
        error: "queue down",
      });
      mocks.recordScheduledTaskFailure.mockResolvedValue({
        shouldRetire: true,
      });

      const result = await processScheduledTaskMessage({
        message: { taskId: recurringRecord.id, remainingDelaySeconds: 0 },
        messageId: "msg-recurring-retire",
      });

      expect(result.status).toBe("retired");
    });
  });

  describe("agent failure handling", () => {
    it("records a failure when handleSlackMessage throws", async () => {
      mocks.loadScheduledTask.mockResolvedValue(baseRecord);
      mocks.handleSlackMessage.mockRejectedValue(new Error("agent boom"));
      mocks.recordScheduledTaskFailure.mockResolvedValue({
        shouldRetire: false,
      });

      const result = await processScheduledTaskMessage({
        message: { taskId: baseRecord.id, remainingDelaySeconds: 0 },
        messageId: "msg-agent-fail",
      });

      expect(result.status).toBe("expired");
      expect(mocks.recordScheduledTaskFailure).toHaveBeenCalledWith(
        baseRecord,
        "agent boom",
      );
      expect(mocks.publishScheduledTaskMessage).not.toHaveBeenCalled();
    });

    it("falls back to a synthetic ts when posting the self-prompt fails", async () => {
      mocks.loadScheduledTask.mockResolvedValue(baseRecord);
      mocks.threadPost.mockRejectedValue(new Error("channel access lost"));

      const result = await processScheduledTaskMessage({
        message: { taskId: baseRecord.id, remainingDelaySeconds: 0 },
        messageId: "msg-post-fail",
      });

      // The agent still runs even if the visible self-prompt failed —
      // surface what we can rather than dropping the task entirely.
      expect(mocks.handleSlackMessage).toHaveBeenCalledTimes(1);
      expect(result.status).toBe("ran");
    });
  });

  describe("post body sanitization (P1-1)", () => {
    it("strips broadcast directives from the visible post and includes scheduler attribution", async () => {
      mocks.loadScheduledTask.mockResolvedValue({
        ...baseRecord,
        prompt: "<!channel> ship the digest",
      });

      await processScheduledTaskMessage({
        message: { taskId: baseRecord.id, remainingDelaySeconds: 0 },
        messageId: "msg-broadcast",
      });

      expect(mocks.threadPost).toHaveBeenCalledTimes(1);
      const postArg = mocks.threadPost.mock.calls[0]![0] as {
        markdown: string;
      };
      expect(postArg.markdown).not.toMatch(/<!channel>/);
      expect(postArg.markdown).toMatch(/@channel/);
      expect(postArg.markdown).toContain(`<@${baseRecord.createdByUserId}>`);
    });

    it("preserves the un-stripped prompt in the synthetic message passed to the agent", async () => {
      mocks.loadScheduledTask.mockResolvedValue({
        ...baseRecord,
        prompt: "<!channel> ship the digest",
      });

      await processScheduledTaskMessage({
        message: { taskId: baseRecord.id, remainingDelaySeconds: 0 },
        messageId: "msg-broadcast-agent",
      });

      expect(mocks.handleSlackMessage).toHaveBeenCalledTimes(1);
      const messageArg = mocks.handleSlackMessage.mock.calls[0]![1] as {
        data: { text: string };
      };
      // Agent sees the original directive so it can reason about it,
      // but only the visible post is sanitized.
      expect(messageArg.data.text).toContain("<!channel>");
    });
  });
});
