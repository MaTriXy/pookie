import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  sanitizeAssistantTextInMessages,
  sanitizeForCardMrkdwn,
  sanitizeForMarkdown,
} from "../server/utils/sanitize-slack-mrkdwn";

import type { ModelMessage } from "ai";

// Two paths, two canonical forms:
// - sanitizeForMarkdown: bound for thread.post({ markdown }) — the Slack
//   adapter parses markdown and converts to Slack mrkdwn. Canonical:
//   `[label](URL)`.
// - sanitizeForCardMrkdwn: bound for `{ type: "mrkdwn", text }` block
//   text — Slack reads as Slack mrkdwn directly. Canonical: `<URL|label>`.

describe("sanitizeForMarkdown (prose / thread.post markdown path)", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("rewrites rendered <word|URL|label> to [label](URL)", () => {
    expect(
      sanitizeForMarkdown(
        "the tweet was <this|https://x.com/foo|tweet>, neat.",
      ),
    ).toBe("the tweet was [tweet](https://x.com/foo), neat.");
  });

  it("rewrites #channel-prefixed 3-pipe to [label](URL)", () => {
    expect(
      sanitizeForMarkdown(
        "<#product|https://million-js.slack.com/archives/CHAN/pTS|#product thread>",
      ),
    ).toBe("[#product thread](https://million-js.slack.com/archives/CHAN/pTS)");
  });

  it("rewrites markdown junk dest [label](<word|URL>) → [label](URL)", () => {
    expect(
      sanitizeForMarkdown(
        "[slack thread](<slack|https://million-js.slack.com/archives/CHAN/pTS>)",
      ),
    ).toBe("[slack thread](https://million-js.slack.com/archives/CHAN/pTS)");
  });

  it("rewrites markdown junk dest WITHOUT angle brackets", () => {
    expect(
      sanitizeForMarkdown("[slack thread](slack|https://example.com/x)"),
    ).toBe("[slack thread](https://example.com/x)");
  });

  it("normalizes <URL|tweet> autolinks to avoid 4-pipe re-mangle", () => {
    expect(sanitizeForMarkdown("see <https://example.com/x|tweet>")).toBe(
      "see [tweet](https://example.com/x)",
    );
  });

  it("leaves channel/user mentions untouched", () => {
    const input = "ping <@U0123|ray> in <#C0456|product>";
    expect(sanitizeForMarkdown(input)).toBe(input);
  });

  it("leaves clean markdown links untouched", () => {
    const input = "see [the docs](https://example.com/docs)";
    expect(sanitizeForMarkdown(input)).toBe(input);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("leaves plain prose untouched", () => {
    const input = "no links here, just normal text";
    expect(sanitizeForMarkdown(input)).toBe(input);
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

describe("sanitizeForCardMrkdwn (card section block path)", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("converts standard markdown link [label](URL) to Slack mrkdwn", () => {
    // Regression: the previous one-canonical sanitizer rewrote everything
    // to [label](URL) markdown, but cards render the literal text in
    // `{ type: "mrkdwn" }` blocks — Slack mrkdwn doesn't parse markdown
    // link syntax, so users saw `[label](URL)` shown verbatim.
    expect(
      sanitizeForCardMrkdwn(
        "[apr 30 · pmf framework](https://million-js.slack.com/archives/CHAN/pTS)",
      ),
    ).toBe(
      "<https://million-js.slack.com/archives/CHAN/pTS|apr 30 · pmf framework>",
    );
  });

  it("rewrites rendered 3-pipe directly to <URL|label> in cards", () => {
    expect(sanitizeForCardMrkdwn("<this|https://x.com/foo|tweet>")).toBe(
      "<https://x.com/foo|tweet>",
    );
  });

  it("rewrites markdown junk dest [label](<word|URL>) → <URL|label>", () => {
    expect(
      sanitizeForCardMrkdwn(
        "[slack thread](<slack|https://million-js.slack.com/archives/CHAN/pTS>)",
      ),
    ).toBe("<https://million-js.slack.com/archives/CHAN/pTS|slack thread>");
  });

  it("leaves valid <URL|label> Slack mrkdwn untouched", () => {
    const input = "see <https://example.com/x|the docs>";
    expect(sanitizeForCardMrkdwn(input)).toBe(input);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("leaves channel/user mentions untouched", () => {
    const input = "ping <@U123|ray> in <#C456|product>";
    expect(sanitizeForCardMrkdwn(input)).toBe(input);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("leaves plain prose untouched", () => {
    const input = "no links, just text";
    expect(sanitizeForCardMrkdwn(input)).toBe(input);
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

describe("sanitizeAssistantTextInMessages", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rewrites broken assistant string content (markdown form for state)", () => {
    const messages: ModelMessage[] = [
      { role: "assistant", content: "hi <#product|https://x.com/foo|tweet>" },
    ];
    expect(sanitizeAssistantTextInMessages(messages)).toEqual([
      { role: "assistant", content: "hi [tweet](https://x.com/foo)" },
    ]);
  });

  it("rewrites text parts in array content, preserves tool calls", () => {
    const messages: ModelMessage[] = [
      {
        role: "assistant",
        content: [
          { type: "text", text: "see <a|https://x.com/foo|tweet>" },
          {
            type: "tool-call",
            toolCallId: "abc",
            toolName: "search",
            input: { query: "foo" },
          },
        ],
      },
    ];
    const out = sanitizeAssistantTextInMessages(messages);
    const first = out[0];
    if (
      first?.role !== "assistant" ||
      typeof first.content === "string" ||
      !Array.isArray(first.content)
    ) {
      throw new Error("expected array assistant content");
    }
    expect(first.content[0]).toEqual({
      type: "text",
      text: "see [tweet](https://x.com/foo)",
    });
    expect(first.content[1]).toEqual({
      type: "tool-call",
      toolCallId: "abc",
      toolName: "search",
      input: { query: "foo" },
    });
  });

  it("leaves user messages untouched", () => {
    const messages: ModelMessage[] = [
      { role: "user", content: "<#product|https://x.com/foo|tweet>" },
    ];
    expect(sanitizeAssistantTextInMessages(messages)).toEqual(messages);
  });

  it("returns the same message reference when nothing changed", () => {
    const messages: ModelMessage[] = [
      { role: "assistant", content: "all clean here, no links" },
    ];
    const out = sanitizeAssistantTextInMessages(messages);
    expect(out[0]).toBe(messages[0]);
  });
});
