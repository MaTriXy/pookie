import { describe, expect, it } from "vitest";

import { renderPersonalitySection } from "../server/config/personality-prompts";

import type { PersonalityOption } from "../server/config/schema";

const PERSONALITIES: PersonalityOption[] = ["cute", "balanced", "professional"];

// Phrases pookie should never default to. If any of these slips into a
// personality string, the model is far more likely to echo it. Catching this
// in tests prevents canon drift from hitting production. See personality.md
// for the full banlist; this test enforces the load-bearing subset.
const BANNED_PHRASES_LOWERCASE = [
  "as an ai",
  "ai assistant",
  "ai language model",
  "i'd be happy to help",
  "great question",
  "is there anything else i can help",
  "i hope this helps",
  "in conclusion",
  "feel free to",
  "as your assistant",
];

describe("renderPersonalitySection", () => {
  it("returns a non-empty string for every personality option", () => {
    for (const personality of PERSONALITIES) {
      const rendered = renderPersonalitySection(personality);
      expect(rendered).toBeTruthy();
      expect(rendered.length).toBeGreaterThan(50);
    }
  });

  for (const personality of PERSONALITIES) {
    it(`'${personality}' contains no banned phrases`, () => {
      const rendered = renderPersonalitySection(personality).toLowerCase();
      for (const banned of BANNED_PHRASES_LOWERCASE) {
        expect(
          rendered.includes(banned),
          `'${personality}' contains banned phrase '${banned}'`,
        ).toBe(false);
      }
    });

    it(`'${personality}' enforces a casing rule`, () => {
      const rendered = renderPersonalitySection(personality);
      expect(rendered).toMatch(/lowercase|casing/i);
    });

    it(`'${personality}' includes bold usage guidance and bans italics`, () => {
      const rendered = renderPersonalitySection(personality);
      expect(rendered).toMatch(/bold/i);
      expect(rendered).toMatch(/skip italics/i);
    });
  }
});
