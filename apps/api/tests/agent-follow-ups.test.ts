import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  buildSystemMessages: vi.fn(),
  buildToolset: vi.fn(),
  cacheSlackSearchContext: vi.fn(),
  ensureAttachmentText: vi.fn(),
  extractSlackEventContext: vi.fn(),
  getCurrentTraceId: vi.fn(),
  redis: {} as Record<string, unknown>,
  openMcpTools: vi.fn(),
  postCardAsBlocks: vi.fn(),
  postTraceFooter: vi.fn(),
  printTraceInfo: vi.fn(),
  renderCardAsBlocks: vi.fn(),
  streamText: vi.fn(),
  toAiMessages: vi.fn(),
  tryAcquireThreadLock: vi.fn(),
  releaseThreadLock: vi.fn(),
  enqueueFollowUp: vi.fn(),
  drainFollowUps: vi.fn(),
}));

vi.mock("ai", async () => {
  const { z } = await import("zod");
  return {
    modelMessageSchema: z.any(),
    stepCountIs: vi.fn((count: number) => ({ count })),
    streamText: mocks.streamText,
  };
});

vi.mock("chat", () => ({
  toAiMessages: mocks.toAiMessages,
}));

vi.mock("../server/mcp/client", () => ({
  openMcpTools: mocks.openMcpTools,
}));

vi.mock("../server/mcp/handlers", () => ({
  buildReauthCard: vi.fn(),
  createAuthorizationStartUrl: vi.fn(),
}));

vi.mock("../server/mcp/redis", () => ({
  get redis() {
    return mocks.redis;
  },
}));

vi.mock("../server/slack-bot", () => ({
  slackBot: {
    getAdapter: vi.fn(() => ({})),
    getState: vi.fn(() => ({})),
  },
}));

vi.mock("../server/slack/schemas", () => ({
  extractSlackEventContext: mocks.extractSlackEventContext,
}));

vi.mock("../server/tools", () => ({
  buildToolset: mocks.buildToolset,
  cacheSlackSearchContext: mocks.cacheSlackSearchContext,
}));

vi.mock("../server/utils/ensure-attachment-text", () => ({
  ensureAttachmentText: mocks.ensureAttachmentText,
}));

vi.mock("../server/utils/get-current-trace-id", () => ({
  getCurrentTraceId: mocks.getCurrentTraceId,
  printTraceInfo: mocks.printTraceInfo,
}));

vi.mock("../server/utils/logger", () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  },
  runWithLogging: (_enabled: boolean, fn: () => unknown) => fn(),
}));

vi.mock("../server/utils/post-trace-footer", () => ({
  postTraceFooter: mocks.postTraceFooter,
}));

vi.mock("../server/agent/post-card-as-blocks", () => ({
  postCardAsBlocks: mocks.postCardAsBlocks,
}));

vi.mock("../server/agent/render-card-blocks", () => ({
  renderCardAsBlocks: mocks.renderCardAsBlocks,
}));

vi.mock("../server/agent/system-prompt", () => ({
  buildSystemMessages: mocks.buildSystemMessages,
}));

vi.mock("../server/agent/thread-lock", () => ({
  tryAcquireThreadLock: mocks.tryAcquireThreadLock,
  releaseThreadLock: mocks.releaseThreadLock,
  enqueueFollowUp: mocks.enqueueFollowUp,
  drainFollowUps: mocks.drainFollowUps,
}));

import { handleSlackMessage } from "../server/agent/index";

import type { Redis } from "ioredis";

interface TestTextDeltaPart {
  id: string;
  text: string;
  type: "text-delta";
}

interface TestToolResultPart {
  output: unknown;
  preliminary?: boolean;
  toolCallId: string;
  toolName: string;
  type: "tool-result";
}

const createTextStream = (chunks: string[]): AsyncIterable<string> => ({
  [Symbol.asyncIterator]: () =>
    (async function* () {
      for (const chunk of chunks) yield chunk;
    })(),
});

const createFullStream = (
  chunks: string[],
  parts: Array<TestTextDeltaPart | TestToolResultPart> = [],
): AsyncIterable<TestTextDeltaPart | TestToolResultPart> => ({
  [Symbol.asyncIterator]: () =>
    (async function* () {
      for (const chunk of chunks) {
        yield { id: "text", text: chunk, type: "text-delta" };
      }
      for (const part of parts) yield part;
    })(),
});

const createStreamTextResult = (
  chunks: string[],
  parts: Array<TestTextDeltaPart | TestToolResultPart> = [],
) => ({
  fullStream: createFullStream(chunks, parts),
  textStream: createTextStream(chunks),
  response: Promise.resolve({ messages: [] }),
});

const createThread = () =>
  ({
    id: "slack:C123:1700000000.000001",
    post: vi.fn(async () => undefined),
    recentMessages: [],
    refresh: vi.fn(async () => undefined),
    setState: vi.fn(async () => undefined),
    startTyping: vi.fn(async () => undefined),
    state: Promise.resolve({ messages: [] }),
  }) as unknown as Parameters<typeof handleSlackMessage>[0];

const createMessage = (
  text = "hello pookie",
): NonNullable<Parameters<typeof handleSlackMessage>[1]> =>
  ({
    id: "1700000000.000001",
    raw: {},
    text,
  }) as NonNullable<Parameters<typeof handleSlackMessage>[1]>;

const fakeRedis = {} as unknown as Redis;

describe("handleSlackMessage follow-up queue", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.buildSystemMessages.mockResolvedValue({
      messages: [],
      resolvedConfig: {
        config: {
          reasoningEffort: "medium",
          tracesFooter: false,
        },
      },
    });
    mocks.buildToolset.mockReturnValue({});
    mocks.cacheSlackSearchContext.mockResolvedValue(undefined);
    mocks.extractSlackEventContext.mockReturnValue({
      channelId: "C123",
      teamId: "T06F418RJ3H",
      userId: "U123",
    });
    mocks.getCurrentTraceId.mockReturnValue("trace-123");
    mocks.redis = fakeRedis as unknown as Record<string, unknown>;
    mocks.openMcpTools.mockResolvedValue(undefined);
    mocks.streamText.mockReturnValue(createStreamTextResult(["ok"]));
    mocks.toAiMessages.mockResolvedValue([]);
    mocks.tryAcquireThreadLock.mockResolvedValue(true);
    mocks.releaseThreadLock.mockResolvedValue(undefined);
    mocks.enqueueFollowUp.mockResolvedValue(undefined);
    mocks.drainFollowUps.mockResolvedValue([]);
  });

  it("enqueues and returns early when the thread lock is busy", async () => {
    mocks.tryAcquireThreadLock.mockResolvedValue(false);
    const thread = createThread();
    const message = createMessage("follow-up text");

    await handleSlackMessage(thread, message);

    expect(mocks.enqueueFollowUp).toHaveBeenCalledWith(
      fakeRedis,
      thread.id,
      "C123",
      { messageId: "1700000000.000001", text: "follow-up text" },
    );
    expect(mocks.streamText).not.toHaveBeenCalled();
    expect(thread.post).not.toHaveBeenCalled();
  });

  it("enqueues a placeholder for attachment-only messages when lock is busy", async () => {
    mocks.tryAcquireThreadLock.mockResolvedValue(false);
    const thread = createThread();
    const message = {
      id: "1700000000.000002",
      raw: {},
      text: "  ",
      attachments: [{ type: "image" }],
    } as unknown as NonNullable<Parameters<typeof handleSlackMessage>[1]>;

    await handleSlackMessage(thread, message);

    expect(mocks.enqueueFollowUp).toHaveBeenCalledWith(
      fakeRedis,
      thread.id,
      "C123",
      {
        messageId: "1700000000.000002",
        text: "(user sent an attachment with no text)",
      },
    );
  });

  it("does not enqueue when message has no text and no attachments", async () => {
    mocks.tryAcquireThreadLock.mockResolvedValue(false);
    const thread = createThread();
    const message = {
      id: "1700000000.000003",
      raw: {},
      text: "",
    } as unknown as NonNullable<Parameters<typeof handleSlackMessage>[1]>;

    await handleSlackMessage(thread, message);

    expect(mocks.enqueueFollowUp).not.toHaveBeenCalled();
  });

  it("runs a second round when follow-ups are drained", async () => {
    mocks.drainFollowUps.mockResolvedValueOnce([
      { messageId: "ts-Y", text: "also do Y" },
    ]);

    const thread = createThread();
    await handleSlackMessage(thread, createMessage());

    expect(mocks.streamText).toHaveBeenCalledTimes(2);
    expect(thread.refresh).toHaveBeenCalled();
    expect(thread.startTyping).toHaveBeenCalledTimes(2);
  });

  it("stops after MAX_FOLLOW_UP_ROUNDS even if more follow-ups arrive", async () => {
    mocks.drainFollowUps.mockResolvedValue([
      { messageId: "ts-more", text: "more" },
    ]);

    const thread = createThread();
    await handleSlackMessage(thread, createMessage());

    // 1 initial round + 4 follow-up rounds = 5 total
    expect(mocks.streamText).toHaveBeenCalledTimes(5);
  });

  it("uploads only the final generated image stream result", async () => {
    const imageData = Buffer.from("generated-image");
    mocks.streamText.mockReturnValue(
      createStreamTextResult(
        [],
        [
          {
            output: { result: Buffer.from("partial-image").toString("base64") },
            preliminary: true,
            toolCallId: "ig_final",
            toolName: "image_generation",
            type: "tool-result",
          },
          {
            output: { result: imageData.toString("base64") },
            toolCallId: "ig_final",
            toolName: "image_generation",
            type: "tool-result",
          },
        ],
      ),
    );

    const thread = createThread();
    await handleSlackMessage(thread, createMessage("pookify this image"));

    expect(thread.post).toHaveBeenCalledTimes(1);
    expect(thread.post).toHaveBeenCalledWith({
      files: [
        {
          data: imageData,
          filename: "image-ig_final.png",
          mimeType: "image/png",
        },
      ],
      markdown: "",
    });
  });

  it("releases the thread lock in the finally block", async () => {
    const thread = createThread();
    await handleSlackMessage(thread, createMessage());

    expect(mocks.releaseThreadLock).toHaveBeenCalledWith(fakeRedis, thread.id);
  });

  it("does not stack <system-reminder> blocks across follow-up rounds", async () => {
    // Drain a follow-up so a second runAgentRound iteration kicks in. The
    // last user message gets a reminder injected and PERSISTED on each
    // round (intentional, for prompt-cache stability across turns), but
    // the strip-then-inject in injectSystemReminderIntoLastUserMessage
    // guarantees the second round replaces (not stacks) round 1's reminder.
    // Without idempotency, round 2 would emit two `<system-reminder>` blocks
    // on the same message and bloat context every round.
    mocks.drainFollowUps.mockResolvedValueOnce([
      { messageId: "ts-follow", text: "follow up text" },
    ]);
    mocks.toAiMessages.mockResolvedValue([
      { role: "user", content: "hello pookie" },
    ]);

    const thread = createThread();
    await handleSlackMessage(thread, createMessage());

    expect(mocks.streamText).toHaveBeenCalledTimes(2);

    const countReminderBlocks = (text: unknown): number => {
      if (typeof text !== "string") return 0;
      return (text.match(/<system-reminder>/g) ?? []).length;
    };

    for (
      let callIndex = 0;
      callIndex < mocks.streamText.mock.calls.length;
      callIndex++
    ) {
      const callArgs = mocks.streamText.mock.calls[callIndex]?.[0] as
        | { messages?: Array<{ role: string; content: unknown }> }
        | undefined;
      const lastUserMessage = [...(callArgs?.messages ?? [])]
        .reverse()
        .find((message) => message.role === "user");
      expect(lastUserMessage).toBeDefined();
      const blockCount = countReminderBlocks(lastUserMessage?.content);
      expect(blockCount).toBe(1);
    }
  });

  it("releases the thread lock even when streaming throws", async () => {
    mocks.streamText.mockReturnValue({
      fullStream: {
        [Symbol.asyncIterator]: () => ({
          next: () => Promise.reject(new Error("stream broke")),
        }),
      },
      response: Promise.resolve({ messages: [] }),
    });

    const thread = createThread();
    await handleSlackMessage(thread, createMessage());

    expect(mocks.releaseThreadLock).toHaveBeenCalledWith(fakeRedis, thread.id);
  });
});
