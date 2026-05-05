import { describe, expect, it } from "vitest";

import { agentCardSchema } from "../server/agent/response-schema";

// Regression: gpt-5.5 streamed cards omitting `accessory`/`context` on row
// children, and the schema's `.nullable()` (without `.optional()`) rejected
// them — every row card got silently dropped via parse-card-stream's
// malformedCard branch. We now declare every nullable field as also
// `.optional()` so schema strictness can't again become a silent UX drop.
// This suite locks in the specific shapes the model produces under load.

describe("agentCardSchema — model-omitted nullable fields", () => {
  it("accepts a row card where every row omits accessory + context", () => {
    const card = {
      type: "card",
      title: "title",
      subtitle: null,
      children: [
        { type: "row", text: "row a" },
        { type: "row", text: "row b" },
        { type: "row", text: "row c" },
      ],
    };
    const result = agentCardSchema.safeParse(card);
    expect(result.success).toBe(true);
  });

  it("accepts a card with omitted title + subtitle", () => {
    const card = {
      type: "card",
      children: [{ type: "row", text: "row" }],
    };
    expect(agentCardSchema.safeParse(card).success).toBe(true);
  });

  it("accepts a row whose link-button accessory omits style", () => {
    const card = {
      type: "card",
      title: null,
      subtitle: null,
      children: [
        {
          type: "row",
          text: "row",
          accessory: {
            type: "link-button",
            label: "open",
            url: "https://example.com",
          },
        },
      ],
    };
    expect(agentCardSchema.safeParse(card).success).toBe(true);
  });

  it("accepts text element with omitted style", () => {
    const card = {
      type: "card",
      title: null,
      subtitle: null,
      children: [{ type: "text", content: "hello" }],
    };
    expect(agentCardSchema.safeParse(card).success).toBe(true);
  });

  it("accepts table element with omitted align", () => {
    const card = {
      type: "card",
      title: null,
      subtitle: null,
      children: [
        {
          type: "table",
          headers: ["a", "b"],
          rows: [["1", "2"]],
        },
      ],
    };
    expect(agentCardSchema.safeParse(card).success).toBe(true);
  });

  it("accepts code element with omitted language + fileName", () => {
    const card = {
      type: "card",
      title: null,
      subtitle: null,
      children: [{ type: "code", content: "console.log('hi')" }],
    };
    expect(agentCardSchema.safeParse(card).success).toBe(true);
  });

  it("accepts quote element with omitted author + timestamp", () => {
    const card = {
      type: "card",
      title: null,
      subtitle: null,
      children: [{ type: "quote", text: "the quote" }],
    };
    expect(agentCardSchema.safeParse(card).success).toBe(true);
  });

  it("accepts file element with omitted mimeType + sizeBytes", () => {
    const card = {
      type: "card",
      title: null,
      subtitle: null,
      children: [
        {
          type: "file",
          name: "spec.pdf",
          url: "https://example.com/spec.pdf",
        },
      ],
    };
    expect(agentCardSchema.safeParse(card).success).toBe(true);
  });

  it("accepts image-block with omitted title", () => {
    const card = {
      type: "card",
      title: null,
      subtitle: null,
      children: [
        {
          type: "image-block",
          url: "https://example.com/img.png",
          altText: "alt",
        },
      ],
    };
    expect(agentCardSchema.safeParse(card).success).toBe(true);
  });

  it("still accepts the explicit-null shape for backwards compat", () => {
    const card = {
      type: "card",
      title: null,
      subtitle: null,
      children: [{ type: "row", text: "row", accessory: null, context: null }],
    };
    expect(agentCardSchema.safeParse(card).success).toBe(true);
  });
});
