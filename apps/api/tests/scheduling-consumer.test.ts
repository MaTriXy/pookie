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
  chatPostMessage: vi.fn(),
  resolveSlackWebClient: vi.fn(),
  renderPostable: vi.fn((message: { markdown?: string }) =>
    typeof message?.markdown === "string" ? message.markdown : "",
  ),
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

vi.mock("@chat-adapter/slack", () => ({
  // Stub the converter so the run-task module can instantiate it without
  // pulling in the real `chat` BaseFormatConverter (which we mock above).
  SlackFormatConverter: class {
    renderPostable = mocks.renderPostable;
  },
}));

const slackAdapterMock = vi.hoisted(() => ({
  botUserId: "UPOOKIE",
  getInstallation: vi
    .fn()
    .mockResolvedValue({ botToken: "xoxb-test-bot-token" }),
  withBotToken: <T>(_token: string, fn: () => T): T => fn(),
  postEphemeral: vi.fn().mockResolvedValue({ id: "eph-1" }),
  postMessage: vi.fn().mockResolvedValue({ id: "1700000000.999999" }),
  decodeThreadId: vi.fn((threadId: string) => {
    const parts = threadId.split(":");
    return {
      channel: parts[1] ?? "",
      threadTs: parts.length === 3 ? (parts[2] ?? "") : "",
    };
  }),
}));

vi.mock("../server/slack-bot", () => ({
  slackBot: {
    initialize: vi.fn().mockResolvedValue(undefined),
    getAdapter: vi.fn(() => slackAdapterMock),
  },
}));

vi.mock("../server/slack/web-client", () => ({
  resolveSlackWebClient: mocks.resolveSlackWebClient,
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
  cronExpression: "7 14 * * 1",
  recurring: false,
  userTimezone: "UTC",
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
    mocks.chatPostMessage
      .mockReset()
      .mockResolvedValue({ ts: "1700000000.999999", ok: true });
    mocks.resolveSlackWebClient.mockReset().mockResolvedValue({
      chat: { postMessage: mocks.chatPostMessage },
    });
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

  describe("recurring lifecycle", () => {
    // hourly cron — every hour at minute 7. nextRunAt is anchored at a
    // specific UTC instant so test math is deterministic.
    const RECURRING_NEXT_RUN_AT = Date.UTC(2026, 4, 4, 16, 7, 0);
    const recurringRecord: ScheduledTaskRecord = {
      ...baseRecord,
      cronExpression: "7 * * * *",
      recurring: true,
      userTimezone: "UTC",
      nextRunAt: RECURRING_NEXT_RUN_AT,
    };

    it("runs the task, computes next nextRunAt from the cron expression, and re-publishes with a fresh idempotency key", async () => {
      mocks.loadScheduledTask.mockResolvedValue(recurringRecord);
      // simulate the store's update returning the same record with nextRunAt
      // bumped to whatever run-task computed (we'll verify run-task's call).
      mocks.updateScheduledTaskAfterRun.mockImplementation(
        async (record: ScheduledTaskRecord, nextRunAt: number) => ({
          ...record,
          nextRunAt,
          lastRunAt: Date.now(),
          failureCount: 0,
          lastError: undefined,
        }),
      );

      const result = await processScheduledTaskMessage({
        message: { taskId: recurringRecord.id, remainingDelaySeconds: 0 },
        messageId: "msg-recurring",
      });

      expect(result.status).toBe("ran");
      expect(mocks.handleSlackMessage).toHaveBeenCalledTimes(1);
      expect(mocks.updateScheduledTaskAfterRun).toHaveBeenCalledTimes(1);

      // Cron `7 * * * *` from 16:07 UTC → next is 17:07 UTC. run-task should
      // anchor next from record.nextRunAt (drift-free), not from Date.now().
      const [, nextRunAt] = mocks.updateScheduledTaskAfterRun.mock.calls[0]!;
      expect(nextRunAt).toBe(Date.UTC(2026, 4, 4, 17, 7, 0));

      // Idempotency key uses the new nextRunAt → differs from prior fire.
      expect(mocks.publishScheduledTaskMessage).toHaveBeenCalledWith(
        recurringRecord.id,
        expect.any(Number),
        nextRunAt,
      );
      expect(nextRunAt).not.toBe(recurringRecord.nextRunAt);
      expect(mocks.deleteScheduledTask).not.toHaveBeenCalled();
    });

    it("passes the UPDATED record (not the stale pre-update one) to trackFailure when the recurring publish fails", async () => {
      // After a successful run, updateScheduledTaskAfterRun resets
      // failureCount to 0. If the next-occurrence publish then fails, we
      // must record that failure against the reset record — passing the
      // pre-update `record` would revive the prior failure count and make
      // a single publish blip retire a healthy task.
      const recordWithPriorFailures: ScheduledTaskRecord = {
        ...recurringRecord,
        failureCount: 4,
      };

      mocks.loadScheduledTask.mockResolvedValue(recordWithPriorFailures);
      mocks.updateScheduledTaskAfterRun.mockImplementation(
        async (record: ScheduledTaskRecord, nextRunAt: number) => ({
          ...record,
          nextRunAt,
          lastRunAt: Date.now(),
          failureCount: 0,
          lastError: undefined,
        }),
      );
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
      });
      expect(recordPassedToFailure.nextRunAt).not.toBe(
        recordWithPriorFailures.nextRunAt,
      );
      expect(errorPassed).toBe("queue down");
    });

    it("returns retired and notifies the scheduler after the failure limit is reached (H1)", async () => {
      mocks.loadScheduledTask.mockResolvedValue(recurringRecord);
      mocks.updateScheduledTaskAfterRun.mockImplementation(
        async (record: ScheduledTaskRecord, nextRunAt: number) => ({
          ...record,
          nextRunAt,
          lastRunAt: Date.now(),
          failureCount: 0,
          lastError: undefined,
        }),
      );
      mocks.publishScheduledTaskMessage.mockResolvedValue({
        ok: false,
        error: "queue down",
      });
      mocks.recordScheduledTaskFailure.mockResolvedValue({
        shouldRetire: true,
      });
      slackAdapterMock.postEphemeral.mockClear();

      const result = await processScheduledTaskMessage({
        message: { taskId: recurringRecord.id, remainingDelaySeconds: 0 },
        messageId: "msg-recurring-retire",
      });

      expect(result.status).toBe("retired");
      expect(slackAdapterMock.postEphemeral).toHaveBeenCalledTimes(1);
      const [threadId, userId, message] =
        slackAdapterMock.postEphemeral.mock.calls[0]!;
      expect(threadId).toBe(recurringRecord.threadId);
      expect(userId).toBe(recurringRecord.createdByUserId);
      expect(message).toMatch(/retired/i);
      expect(message).toMatch(/5 consecutive failures/i);
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
      mocks.chatPostMessage.mockRejectedValue(new Error("channel access lost"));

      const result = await processScheduledTaskMessage({
        message: { taskId: baseRecord.id, remainingDelaySeconds: 0 },
        messageId: "msg-post-fail",
      });

      // The agent still runs even if the visible self-prompt failed —
      // surface what we can rather than dropping the task entirely.
      expect(mocks.handleSlackMessage).toHaveBeenCalledTimes(1);
      expect(result.status).toBe("ran");
    });

    it("falls back to a synthetic ts when no slack web client is available", async () => {
      mocks.loadScheduledTask.mockResolvedValue(baseRecord);
      mocks.resolveSlackWebClient.mockResolvedValue(undefined);

      const result = await processScheduledTaskMessage({
        message: { taskId: baseRecord.id, remainingDelaySeconds: 0 },
        messageId: "msg-no-client",
      });

      // Same posture as a post failure — the agent still runs, the
      // synthetic ts keeps memory scoping consistent.
      expect(mocks.chatPostMessage).not.toHaveBeenCalled();
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

      expect(mocks.renderPostable).toHaveBeenCalledTimes(1);
      const renderedArg = mocks.renderPostable.mock.calls[0]![0] as {
        markdown: string;
      };
      expect(renderedArg.markdown).not.toMatch(/<!channel>/);
      expect(renderedArg.markdown).toMatch(/@channel/);
      expect(renderedArg.markdown).toContain(
        `<@${baseRecord.createdByUserId}>`,
      );
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

  describe("late-cancel race (cancellation between consumer-load and fire)", () => {
    it("aborts the fire when the record is cancelled BETWEEN the initial load and the visible post", async () => {
      // Simulate the race: the first loadScheduledTask (at consumer entry)
      // returns the record un-cancelled, but the second one (right before
      // the post inside withBotToken) sees cancelled=true because the
      // user's cron_delete committed in the interim.
      mocks.loadScheduledTask
        .mockResolvedValueOnce(baseRecord)
        .mockResolvedValueOnce({ ...baseRecord, cancelled: true });

      const result = await processScheduledTaskMessage({
        message: { taskId: baseRecord.id, remainingDelaySeconds: 0 },
        messageId: "msg-late-cancel",
      });

      // Status is `cancelled`, not `ran` — the post-run cleanup path
      // would otherwise double-delete and (for recurring tasks) publish
      // the next chained fire, defeating the cancel.
      expect(result.status).toBe("cancelled");
      // Visible post NEVER happened (the gremlin was caught at the door).
      expect(mocks.chatPostMessage).not.toHaveBeenCalled();
      expect(mocks.handleSlackMessage).not.toHaveBeenCalled();
      // deleteScheduledTask called exactly once: by the late-cancel
      // re-check inside runScheduledTaskInner.
      expect(mocks.deleteScheduledTask).toHaveBeenCalledTimes(1);
      expect(mocks.publishScheduledTaskMessage).not.toHaveBeenCalled();
    });

    it("aborts the fire when the record was deleted between load and post", async () => {
      mocks.loadScheduledTask
        .mockResolvedValueOnce(baseRecord)
        .mockResolvedValueOnce(null);

      const result = await processScheduledTaskMessage({
        message: { taskId: baseRecord.id, remainingDelaySeconds: 0 },
        messageId: "msg-late-deleted",
      });

      expect(result.status).toBe("cancelled");
      expect(mocks.chatPostMessage).not.toHaveBeenCalled();
      expect(mocks.handleSlackMessage).not.toHaveBeenCalled();
    });
  });

  describe("target-channel routing", () => {
    const targetRecord: ScheduledTaskRecord = {
      ...baseRecord,
      targetChannelId: "C_ENG",
    };

    it("posts a top-level message into the target channel and runs the agent on the new thread", async () => {
      mocks.loadScheduledTask.mockResolvedValue(targetRecord);
      slackAdapterMock.postMessage
        .mockClear()
        .mockResolvedValue({ id: "1777824000.000100" });

      await processScheduledTaskMessage({
        message: { taskId: targetRecord.id, remainingDelaySeconds: 0 },
        messageId: "msg-target-fire",
      });

      expect(slackAdapterMock.postMessage).toHaveBeenCalledTimes(1);
      const [threadId, body] = slackAdapterMock.postMessage.mock.calls[0]!;
      // Channel-only threadId tells the slack adapter to post top-level
      // (not as a reply). The fresh ts becomes the thread root for the
      // agent's reply.
      expect(threadId).toBe("slack:C_ENG");
      expect((body as { markdown: string }).markdown).toContain(
        targetRecord.prompt,
      );

      // The agent runs in a thread keyed to the new top-level message,
      // not the originating thread.
      expect(mocks.handleSlackMessage).toHaveBeenCalledTimes(1);
      const [, syntheticMessage] = mocks.handleSlackMessage.mock.calls[0]!;
      expect(
        (syntheticMessage as { data: { threadId: string } }).data.threadId,
      ).toBe("slack:C_ENG:1777824000.000100");

      // The originating-thread broadcast path must NOT have been used.
      expect(mocks.chatPostMessage).not.toHaveBeenCalled();
    });

    it("records a failure if posting into the target channel fails", async () => {
      mocks.loadScheduledTask.mockResolvedValue(targetRecord);
      slackAdapterMock.postMessage
        .mockClear()
        .mockRejectedValue(new Error("not_in_channel"));
      mocks.recordScheduledTaskFailure.mockResolvedValue({
        shouldRetire: false,
      });

      const result = await processScheduledTaskMessage({
        message: { taskId: targetRecord.id, remainingDelaySeconds: 0 },
        messageId: "msg-target-fail",
      });

      expect(result.status).toBe("expired");
      expect(mocks.handleSlackMessage).not.toHaveBeenCalled();
      expect(mocks.recordScheduledTaskFailure).toHaveBeenCalledTimes(1);
    });
  });

  describe("channel broadcast (reply_broadcast)", () => {
    it("posts the self-prompt to the parent channel via reply_broadcast for thread fires", async () => {
      mocks.loadScheduledTask.mockResolvedValue(baseRecord);

      await processScheduledTaskMessage({
        message: { taskId: baseRecord.id, remainingDelaySeconds: 0 },
        messageId: "msg-broadcast-thread",
      });

      expect(mocks.chatPostMessage).toHaveBeenCalledTimes(1);
      const [postArgs] = mocks.chatPostMessage.mock.calls[0]!;
      expect(postArgs).toMatchObject({
        channel: baseRecord.channelId,
        thread_ts: "1700000000.000001",
        reply_broadcast: true,
        unfurl_links: false,
        unfurl_media: false,
      });
      expect(typeof (postArgs as { text: unknown }).text).toBe("string");
      expect((postArgs as { text: string }).text).toContain(baseRecord.prompt);
    });

    it("uses the response ts as the synthetic message id when broadcast succeeds", async () => {
      mocks.loadScheduledTask.mockResolvedValue(baseRecord);
      mocks.chatPostMessage.mockResolvedValue({
        ts: "1700000111.222333",
        ok: true,
      });

      await processScheduledTaskMessage({
        message: { taskId: baseRecord.id, remainingDelaySeconds: 0 },
        messageId: "msg-broadcast-ts",
      });

      const [, syntheticMessage] = mocks.handleSlackMessage.mock.calls[0]!;
      expect((syntheticMessage as { data: { id: string } }).data.id).toBe(
        "1700000111.222333",
      );
    });

    it("does NOT set reply_broadcast for DM fires (no parent channel feed)", async () => {
      mocks.loadScheduledTask.mockResolvedValue({
        ...baseRecord,
        isDM: true,
        channelId: "D0001",
        threadId: "slack:D0001:1700000000.000001",
      });

      await processScheduledTaskMessage({
        message: { taskId: baseRecord.id, remainingDelaySeconds: 0 },
        messageId: "msg-broadcast-dm",
      });

      expect(mocks.chatPostMessage).toHaveBeenCalledTimes(1);
      const [postArgs] = mocks.chatPostMessage.mock.calls[0]!;
      // For a thread reply in a DM the reply_broadcast field is still
      // sent, but always false — Slack would silently no-op it anyway,
      // we explicitly send false so intent is auditable on the wire.
      expect((postArgs as { reply_broadcast?: boolean }).reply_broadcast).toBe(
        false,
      );
      expect((postArgs as { thread_ts?: string }).thread_ts).toBe(
        "1700000000.000001",
      );
    });

    it("OMITS reply_broadcast and thread_ts when the originating thread is itself a top-level post (no thread_ts)", async () => {
      mocks.loadScheduledTask.mockResolvedValue({
        ...baseRecord,
        threadId: "slack:C0001",
      });

      await processScheduledTaskMessage({
        message: { taskId: baseRecord.id, remainingDelaySeconds: 0 },
        messageId: "msg-broadcast-toplevel",
      });

      expect(mocks.chatPostMessage).toHaveBeenCalledTimes(1);
      const [postArgs] = mocks.chatPostMessage.mock.calls[0]!;
      // Slack's discriminated union for ChatPostMessageArguments rejects
      // `reply_broadcast` without a string `thread_ts`. Without a thread
      // we fall through to the plain top-level shape and omit both.
      expect(postArgs).not.toHaveProperty("reply_broadcast");
      expect(postArgs).not.toHaveProperty("thread_ts");
    });
  });
});
