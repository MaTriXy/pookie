import { describe, expect, it } from "vitest";

import { nextFireMs, validateCronExpression } from "../server/scheduling/cron";

describe("validateCronExpression", () => {
  const NOW = Date.UTC(2026, 4, 7, 12, 0, 0);

  it("accepts a 5-field cron in a real IANA zone", () => {
    const result = validateCronExpression(
      "0 9 * * 1-5",
      "America/Los_Angeles",
      NOW,
    );
    expect(result.ok).toBe(true);
  });

  it("accepts a 6-field cron with seconds", () => {
    const result = validateCronExpression(
      "*/10 * * * * *",
      "America/Los_Angeles",
      NOW,
    );
    expect(result.ok).toBe(true);
  });

  it("rejects a malformed cron expression", () => {
    const result = validateCronExpression("not a cron", "UTC", NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/invalid cron/i);
    }
  });

  it("rejects an unknown IANA timezone (M3)", () => {
    const result = validateCronExpression(
      "0 9 * * 1-5",
      "America/Los_Angles", // typo
      NOW,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/invalid timezone/i);
    }
  });

  it("rejects an empty timezone string", () => {
    const result = validateCronExpression("0 9 * * 1-5", "", NOW);
    expect(result.ok).toBe(false);
  });

  it("rejects a calendar pattern with no future occurrence (Feb 30) (H4)", () => {
    // cron-parser allows day-of-month 30 syntactically but throws when it
    // tries to find a Feb 30 in its lookahead window. Should surface as a
    // validation error, not a runtime crash on first fire.
    const result = validateCronExpression("0 0 30 2 *", "UTC", NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/invalid cron/i);
    }
  });

  it("computes weekday-9am-LA correctly across DST (spring-forward)", () => {
    // 2026 US DST spring-forward is Sunday March 8 at 2am local — 2:00am
    // becomes 3:00am, "2:30am" doesn't exist that day. Cron `0 9 * * 1-5`
    // (9am weekdays) is unaffected because 9am is not in the gap.
    // From Sunday 2026-03-08 12:00 UTC = 5am Pacific (still PST), the next
    // 9am Mon Pacific is Mon 2026-03-09 — which is the day AFTER spring-
    // forward, so 9am PDT = 16:00 UTC.
    const sundayMorningUtc = Date.UTC(2026, 2, 8, 12, 0, 0);
    const result = validateCronExpression(
      "0 9 * * 1-5",
      "America/Los_Angeles",
      sundayMorningUtc,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      const expectedMonday9amPdt = Date.UTC(2026, 2, 9, 16, 0, 0);
      expect(result.firstFireMs).toBe(expectedMonday9amPdt);
    }
  });
});

describe("nextFireMs anchoring (drift-free recurring)", () => {
  it("computes the next fire from `afterMs`, not from current wall-clock time", () => {
    // Anchor at a specific instant; nextFireMs should produce the next
    // matching cron fire AFTER that instant, regardless of how much
    // wall-clock time elapses while the consumer runs.
    const anchoredAt = Date.UTC(2026, 4, 4, 16, 7, 0); // Mon May 4, 16:07 UTC
    const next = nextFireMs("7 * * * *", "UTC", anchoredAt);
    // `7 * * * *` = minute 7 of every hour. Next after 16:07 = 17:07.
    expect(next).toBe(Date.UTC(2026, 4, 4, 17, 7, 0));
  });

  it("respects the user's timezone for hour-of-day patterns", () => {
    // Cron `0 9 * * *` (every day 9am) from Sunday 2026-05-03 12:00 UTC
    // (= 5am Sunday Pacific in PDT). Next 9am PT is later that same day,
    // Sunday 9am PDT = Sunday 16:00 UTC. Confirms the cron is interpreted
    // in PT, not UTC (a UTC interpretation would have fired ~3 hours ago
    // from the anchor instant).
    const sundayNoonUtc = Date.UTC(2026, 4, 3, 12, 0, 0);
    const next = nextFireMs("0 9 * * *", "America/Los_Angeles", sundayNoonUtc);
    expect(next).toBe(Date.UTC(2026, 4, 3, 16, 0, 0));
  });
});
