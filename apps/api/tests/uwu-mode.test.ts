import { describe, expect, it } from "vitest";

import { detectUwuTrigger, UWU_MODE_SECTION } from "../server/agent/uwu-mode";

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
  });

  it("does not match when uwu/owo is glued to surrounding word characters", () => {
    expect(detectUwuTrigger(["tower"])).toBe(false);
    expect(detectUwuTrigger(["pikachuuwu"])).toBe(false);
    expect(detectUwuTrigger(["lowowoman"])).toBe(false);
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
