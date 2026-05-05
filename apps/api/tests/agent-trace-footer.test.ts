import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  buildSystemMessages: vi.fn(),
  buildToolset: vi.fn(),
  cacheSlackSearchContext: vi.fn(),
  drainFollowUps: vi.fn(),
  ensureAttachmentText: vi.fn(),
  extractSlackEventContext: vi.fn(),
  fetchChannelInfo: vi.fn(),
  getCurrentTraceId: vi.fn(),
  openMcpTools: vi.fn(),
  postCardAsBlocks: vi.fn(),
  postTraceFooter: vi.fn(),
  printTraceInfo: vi.fn(),
  releaseThreadLock: vi.fn(),
  renderCardAsBlocks: vi.fn(),
  streamText: vi.fn(),
  toAiMessages: vi.fn(),
  tryAcquireThreadLock: vi.fn(),
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
  redis: {},
}));

vi.mock("../server/slack-bot", () => ({
  slackBot: {
    getAdapter: vi.fn(() => ({
      fetchChannelInfo: mocks.fetchChannelInfo,
    })),
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
  enqueueFollowUp: vi.fn(),
  drainFollowUps: mocks.drainFollowUps,
}));

import { handleSlackMessage } from "../server/agent/index";

const createTextStream = (chunks: string[]): AsyncIterable<string> => ({
  [Symbol.asyncIterator]: () =>
    (async function* () {
      for (const chunk of chunks) yield chunk;
    })(),
});

const createFullStream = (
  chunks: string[],
): AsyncIterable<{ id: string; text: string; type: "text-delta" }> => ({
  [Symbol.asyncIterator]: () =>
    (async function* () {
      for (const chunk of chunks) {
        yield { id: "text", text: chunk, type: "text-delta" };
      }
    })(),
});

const createStreamTextResult = (chunks: string[]) => ({
  fullStream: createFullStream(chunks),
  textStream: createTextStream(chunks),
  response: Promise.resolve({ messages: [] }),
});

const createThread = (): Parameters<typeof handleSlackMessage>[0] =>
  ({
    id: "slack:C123:1700000000.000001",
    post: vi.fn(async () => undefined),
    recentMessages: [],
    setState: vi.fn(async () => undefined),
    startTyping: vi.fn(async () => undefined),
    state: Promise.resolve({ messages: [] }),
  }) as unknown as Parameters<typeof handleSlackMessage>[0];

const createMessage = (): NonNullable<
  Parameters<typeof handleSlackMessage>[1]
> =>
  ({
    id: "1700000000.000001",
    raw: {},
    text: "hello pookie",
  }) as NonNullable<Parameters<typeof handleSlackMessage>[1]>;

describe("handleSlackMessage trace footer", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.buildSystemMessages.mockResolvedValue({
      messages: [],
      resolvedConfig: {
        config: {
          reasoningEffort: "medium",
          tracesFooter: true,
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
    mocks.fetchChannelInfo.mockResolvedValue({ name: "pookie-debug" });
    mocks.getCurrentTraceId.mockReturnValue("trace-123");
    mocks.openMcpTools.mockResolvedValue(undefined);
    mocks.postTraceFooter.mockResolvedValue(undefined);
    mocks.tryAcquireThreadLock.mockResolvedValue(true);
    mocks.releaseThreadLock.mockResolvedValue(undefined);
    mocks.drainFollowUps.mockResolvedValue([]);
    mocks.streamText.mockReturnValue(createStreamTextResult([]));
    mocks.toAiMessages.mockResolvedValue([]);
  });

  it("does not post a trace footer when the run sends no message", async () => {
    const thread = createThread();

    await handleSlackMessage(thread, createMessage());

    expect(thread.post).not.toHaveBeenCalled();
    expect(mocks.postTraceFooter).not.toHaveBeenCalled();
  });

  it("posts a trace footer when the channel is pookie-debug", async () => {
    const thread = createThread();
    mocks.streamText.mockReturnValue(createStreamTextResult(["hello there"]));

    await handleSlackMessage(thread, createMessage());

    expect(thread.post).toHaveBeenCalledWith({ markdown: "hello there" });
    expect(mocks.fetchChannelInfo).toHaveBeenCalledWith("slack:C123");
    expect(mocks.postTraceFooter).toHaveBeenCalledWith(
      thread,
      "trace-123",
      expect.any(Number),
    );
  });

  it("does not post a trace footer when the channel is not pookie-debug", async () => {
    const thread = createThread();
    mocks.streamText.mockReturnValue(createStreamTextResult(["hello there"]));
    mocks.fetchChannelInfo.mockResolvedValue({ name: "general" });

    await handleSlackMessage(thread, createMessage());

    expect(thread.post).toHaveBeenCalledWith({ markdown: "hello there" });
    expect(mocks.postTraceFooter).not.toHaveBeenCalled();
  });
});
