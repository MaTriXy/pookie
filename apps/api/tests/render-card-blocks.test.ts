import { describe, expect, it } from "vitest";

import { renderCardAsBlocks } from "../server/agent/render-card-blocks";

import type { ActionsBlock, Button, HeaderBlock } from "@slack/types";

import type { AgentCard } from "../server/agent/response-schema";

const baseCard = (overrides: Partial<AgentCard> = {}): AgentCard => ({
  type: "card",
  title: null,
  subtitle: null,
  children: [
    {
      type: "row",
      text: "the body",
      accessory: null,
      context: null,
    },
  ],
  ...overrides,
});

describe("renderCardAsBlocks — backwards compat (no frame, no footerAction)", () => {
  it("returns frame: null and empty footerBlocks when fields are absent", () => {
    const rendered = renderCardAsBlocks(baseCard());
    expect(rendered.frame).toBe(null);
    expect(rendered.footerBlocks).toEqual([]);
    expect(rendered.bodyBlocks.length).toBeGreaterThan(0);
  });

  it("normalizes undefined frame to null", () => {
    const card = baseCard();
    delete (card as { frame?: unknown }).frame;
    const rendered = renderCardAsBlocks(card);
    expect(rendered.frame).toBe(null);
  });

  it("emits title as a header block in bodyBlocks", () => {
    const rendered = renderCardAsBlocks(baseCard({ title: "PR merged" }));
    const header = rendered.bodyBlocks[0] as HeaderBlock;
    expect(header.type).toBe("header");
    expect(header.text.text).toBe("PR merged");
  });
});

describe("renderCardAsBlocks — frame: attachment", () => {
  it("reports frame: 'attachment' on the rendered card", () => {
    const rendered = renderCardAsBlocks(baseCard({ frame: "attachment" }));
    expect(rendered.frame).toBe("attachment");
  });

  it("still puts body content in bodyBlocks (the poster moves it into the attachment, not the renderer)", () => {
    const rendered = renderCardAsBlocks(baseCard({ frame: "attachment" }));
    expect(rendered.bodyBlocks.length).toBeGreaterThan(0);
    expect(rendered.footerBlocks).toEqual([]);
  });
});

describe("renderCardAsBlocks — footerAction", () => {
  it("emits an actions block with a single primary link-button", () => {
    const rendered = renderCardAsBlocks(
      baseCard({
        frame: "attachment",
        footerAction: {
          label: "Open in Linear",
          url: "https://linear.app/team/issue/SCO-7051",
        },
      }),
    );
    expect(rendered.footerBlocks).toHaveLength(1);
    const actions = rendered.footerBlocks[0] as ActionsBlock;
    expect(actions.type).toBe("actions");
    expect(actions.elements).toHaveLength(1);
    const button = actions.elements[0] as Button;
    expect(button.type).toBe("button");
    expect(button.text.text).toBe("Open in Linear");
    expect(button.url).toBe("https://linear.app/team/issue/SCO-7051");
    expect(button.style).toBe("primary");
  });

  it("forces style: 'primary' on the footer button regardless of input", () => {
    const rendered = renderCardAsBlocks(
      baseCard({
        footerAction: { label: "Open", url: "https://example.com/x" },
      }),
    );
    const button = (rendered.footerBlocks[0] as ActionsBlock)
      .elements[0] as Button;
    expect(button.style).toBe("primary");
  });

  it("renders the body intact alongside the footer action", () => {
    const rendered = renderCardAsBlocks(
      baseCard({
        title: "Run finished",
        frame: "attachment",
        footerAction: { label: "See run", url: "https://capy.dev/r/1" },
      }),
    );
    expect(rendered.frame).toBe("attachment");
    expect(rendered.bodyBlocks.length).toBeGreaterThan(0);
    expect(rendered.footerBlocks).toHaveLength(1);
  });
});
