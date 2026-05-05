import { describe, expect, it } from "vitest";

import { POOKIE_CONFIG_DEFAULTS } from "../server/config/defaults";
import { mergeLayers } from "../server/config/resolve";

describe("mergeLayers", () => {
  it("returns defaults when every layer is empty", () => {
    const resolved = mergeLayers({ user: {}, channel: {}, global: {} });
    expect(resolved.config).toEqual(POOKIE_CONFIG_DEFAULTS);
    expect(resolved.sources).toEqual({
      personality: "default",
      reactionEmoji: "default",
      cards: "default",
      tracesFooter: "default",
      reasoningEffort: "default",
    });
  });

  it("prefers user over channel over global over default", () => {
    const resolved = mergeLayers({
      user: { personality: "cute" },
      channel: { personality: "professional", reactionEmoji: "tada" },
      global: {
        personality: "balanced",
        reactionEmoji: "wave",
        cards: false,
      },
    });

    expect(resolved.config.personality).toBe("cute");
    expect(resolved.sources.personality).toBe("user");

    expect(resolved.config.reactionEmoji).toBe("tada");
    expect(resolved.sources.reactionEmoji).toBe("channel");

    expect(resolved.config.cards).toBe(false);
    expect(resolved.sources.cards).toBe("global");

    expect(resolved.config.tracesFooter).toBe(
      POOKIE_CONFIG_DEFAULTS.tracesFooter,
    );
    expect(resolved.sources.tracesFooter).toBe("default");
  });

  it("merges per-field (channel override does not wipe unrelated user override)", () => {
    const resolved = mergeLayers({
      user: { reasoningEffort: "high" },
      channel: { personality: "cute" },
      global: {},
    });

    expect(resolved.config.personality).toBe("cute");
    expect(resolved.config.reasoningEffort).toBe("high");
    expect(resolved.sources.personality).toBe("channel");
    expect(resolved.sources.reasoningEffort).toBe("user");
  });

  it("treats explicit false in a higher-priority layer as a real override", () => {
    const resolved = mergeLayers({
      user: { cards: false },
      channel: {},
      global: { cards: true },
    });

    expect(resolved.config.cards).toBe(false);
    expect(resolved.sources.cards).toBe("user");
  });
});
