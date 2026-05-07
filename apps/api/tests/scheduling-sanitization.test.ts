import { describe, expect, it } from "vitest";

import { redactError } from "../server/utils/redact-error";
import { stripSlackBroadcasts } from "../server/utils/strip-slack-broadcasts";

describe("stripSlackBroadcasts (P1-1)", () => {
  it("neutralizes <!channel> to plain @channel text", () => {
    expect(stripSlackBroadcasts("hey <!channel> ship now")).toBe(
      "hey @channel ship now",
    );
  });

  it("neutralizes <!here> and <!everyone>", () => {
    expect(stripSlackBroadcasts("<!here> standup soon")).toBe(
      "@here standup soon",
    );
    expect(stripSlackBroadcasts("<!everyone> emergency")).toBe(
      "@everyone emergency",
    );
  });

  it("strips <!channel|label> with a custom label", () => {
    expect(stripSlackBroadcasts("<!channel|the room> attention")).toBe(
      "@channel attention",
    );
  });

  it("neutralizes subteam mentions to their visible label", () => {
    expect(stripSlackBroadcasts("<!subteam^S123|@oncall> please ack")).toBe(
      "@oncall please ack",
    );
  });

  it("neutralizes subteam mentions without a label", () => {
    expect(stripSlackBroadcasts("<!subteam^S123> please ack")).toBe(
      "@group please ack",
    );
  });

  it("preserves user mentions and ordinary text", () => {
    expect(
      stripSlackBroadcasts("<@U12345> remind me about <https://example.com>"),
    ).toBe("<@U12345> remind me about <https://example.com>");
  });

  it("strips multiple broadcast tokens in one string", () => {
    expect(stripSlackBroadcasts("<!channel> and <!here> together")).toBe(
      "@channel and @here together",
    );
  });
});

describe("redactError (P2-1)", () => {
  it("redacts secret-shaped substrings", () => {
    expect(redactError("auth failed: token=abc123def456ghi789jklmnopqrs")).toBe(
      "auth failed: token=[redacted]",
    );
  });

  it("preserves short tokens that are unlikely to be secrets", () => {
    expect(redactError("error: code=NOT_FOUND")).toBe("error: code=NOT_FOUND");
  });

  it("truncates to the cap after redaction", () => {
    const long = "x".repeat(500);
    expect(redactError(long).length).toBeLessThanOrEqual(200);
  });

  it("redacts JWT-shaped strings", () => {
    expect(
      redactError(
        "401: bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyIn0.signature_part_here",
      ),
    ).not.toMatch(/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9/);
  });
});
