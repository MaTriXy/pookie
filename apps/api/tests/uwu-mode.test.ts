import { describe, expect, it } from "vitest";

import {
  detectUwuTrigger,
  findUwuTriggerMessage,
  pickRandomCatEmoji,
  UWU_MODE_SECTION,
} from "../server/agent/uwu-mode";

describe("detectUwuTrigger", () => {
  it("matches a bare 'uwu'", () => {
    expect(detectUwuTrigger(["uwu"])).toBe(true);
  });

  it("matches a bare 'owo'", () => {
    expect(detectUwuTrigger(["owo"])).toBe(true);
  });

  it("matches 'uwu' anywhere in a sentence", () => {
    expect(detectUwuTrigger(["hi pookie uwu can you help"])).toBe(true);
  });

  it("matches 'OwO' regardless of casing", () => {
    expect(detectUwuTrigger(["OwO what's this"])).toBe(true);
    expect(detectUwuTrigger(["UWU mode"])).toBe(true);
  });

  it("matches the trigger when wrapped in slack emoji colons", () => {
    expect(detectUwuTrigger([":uwu: hi"])).toBe(true);
    expect(detectUwuTrigger([":owo:"])).toBe(true);
    expect(detectUwuTrigger([":meow:"])).toBe(true);
  });

  it("matches a bare 'meow' and common cat-verb inflections", () => {
    expect(detectUwuTrigger(["meow"])).toBe(true);
    expect(detectUwuTrigger(["meow at me pookie"])).toBe(true);
    expect(detectUwuTrigger(["she's meowing again"])).toBe(true);
    expect(detectUwuTrigger(["the cat meows a lot"])).toBe(true);
    expect(detectUwuTrigger(["MEOW!!"])).toBe(true);
  });

  it("matches stretched uwu/owo forms via the leading boundary", () => {
    expect(detectUwuTrigger(["uwuwu"])).toBe(true);
    expect(detectUwuTrigger(["owowo"])).toBe(true);
  });

  it("does not match when a trigger is glued to preceding word characters", () => {
    expect(detectUwuTrigger(["tower"])).toBe(false);
    expect(detectUwuTrigger(["pikachuuwu"])).toBe(false);
    expect(detectUwuTrigger(["lowowoman"])).toBe(false);
    expect(detectUwuTrigger(["homemeow"])).toBe(false);
    expect(detectUwuTrigger(["tomorrow"])).toBe(false);
  });

  it("returns false for a normal message with no trigger", () => {
    expect(
      detectUwuTrigger(["can you summarize the engineering channel"]),
    ).toBe(false);
  });

  it("returns false for empty input", () => {
    expect(detectUwuTrigger([])).toBe(false);
    expect(detectUwuTrigger([undefined, undefined])).toBe(false);
    expect(detectUwuTrigger([""])).toBe(false);
  });

  it("returns true if any text in the array contains the trigger", () => {
    expect(
      detectUwuTrigger([
        "first message",
        "second message owo",
        "third message",
      ]),
    ).toBe(true);
  });

  it("ignores undefined entries while still matching real triggers", () => {
    expect(detectUwuTrigger([undefined, "uwu hi", undefined])).toBe(true);
  });
});

describe("findUwuTriggerMessage", () => {
  it("returns the first message whose text contains a trigger", () => {
    const messages = [
      { id: "1", text: "first" },
      { id: "2", text: "uwu hi" },
      { id: "3", text: "third" },
    ];
    expect(findUwuTriggerMessage(messages)?.id).toBe("2");
  });

  it("prefers an earlier triggering message over a later one", () => {
    const messages = [
      { id: "a", text: "meow first" },
      { id: "b", text: "uwu also" },
    ];
    expect(findUwuTriggerMessage(messages)?.id).toBe("a");
  });

  it("returns undefined when no message triggers", () => {
    const messages = [
      { id: "1", text: "hello" },
      { id: "2", text: "tomorrow" },
    ];
    expect(findUwuTriggerMessage(messages)).toBeUndefined();
  });

  it("skips undefined slots in the candidate list", () => {
    const messages = [undefined, { id: "x", text: "owo there" }, undefined];
    expect(findUwuTriggerMessage(messages)?.id).toBe("x");
  });

  it("ignores entries with missing text", () => {
    const messages = [{ id: "1" }, { id: "2", text: "nya meow" }];
    expect(findUwuTriggerMessage(messages)?.id).toBe("2");
  });
});

describe("pickRandomCatEmoji", () => {
  it("returns a known cat shortcode every call", () => {
    const allowed = new Set([
      "heart_eyes_cat",
      "smiley_cat",
      "smile_cat",
      "joy_cat",
      "smirk_cat",
      "kissing_cat",
      "cat",
      "cat2",
      "paw_prints",
    ]);
    for (let attempt = 0; attempt < 100; attempt++) {
      expect(allowed.has(pickRandomCatEmoji())).toBe(true);
    }
  });
});

describe("UWU_MODE_SECTION", () => {
  it("wraps the override in a <uwu_mode> block", () => {
    expect(UWU_MODE_SECTION.startsWith("<uwu_mode>")).toBe(true);
    expect(UWU_MODE_SECTION.endsWith("</uwu_mode>")).toBe(true);
  });

  it("explicitly preserves correctness rules so cute mode stays helpful", () => {
    expect(UWU_MODE_SECTION).toMatch(/correctly/i);
    expect(UWU_MODE_SECTION).toMatch(/links, IDs, code/i);
    expect(UWU_MODE_SECTION).toMatch(/correctness-critical/i);
  });
});
