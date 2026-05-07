import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  conversationsInfo: vi.fn(),
  conversationsMembers: vi.fn(),
}));

vi.mock("../server/slack/web-client", () => ({
  resolveSlackWebClient: vi.fn().mockResolvedValue({
    conversations: {
      info: mocks.conversationsInfo,
      members: mocks.conversationsMembers,
    },
  }),
}));

import { validateTargetChannelMembership } from "../server/scheduling/membership";

describe("validateTargetChannelMembership (hard posture)", () => {
  beforeEach(() => {
    mocks.conversationsInfo.mockReset();
    mocks.conversationsMembers.mockReset();
  });

  afterEach(() => vi.clearAllMocks());

  it("rejects when the bot is not a member of the target channel", async () => {
    mocks.conversationsInfo.mockResolvedValue({
      channel: { name: "engineering", is_member: false },
    });

    const result = await validateTargetChannelMembership(
      "T_A",
      "C_ENG",
      "U_OWNER",
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/Pookie isn't a member/i);
      expect(result.message).toContain("engineering");
    }
    expect(mocks.conversationsMembers).not.toHaveBeenCalled();
  });

  it("rejects when conversations.info itself fails (unknown channel / no access)", async () => {
    mocks.conversationsInfo.mockRejectedValue(new Error("channel_not_found"));

    const result = await validateTargetChannelMembership(
      "T_A",
      "C_GHOST",
      "U_OWNER",
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/couldn't check Pookie's access/i);
    }
  });

  it("rejects when the scheduler is NOT in the channel even though the bot is", async () => {
    mocks.conversationsInfo.mockResolvedValue({
      channel: { name: "engineering", is_member: true },
    });
    mocks.conversationsMembers.mockResolvedValue({
      members: ["U_BOT", "U_OTHER"],
      response_metadata: {},
    });

    const result = await validateTargetChannelMembership(
      "T_A",
      "C_ENG",
      "U_OWNER",
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/don't appear to be a member/i);
    }
  });

  it("accepts when both bot and scheduler are members", async () => {
    mocks.conversationsInfo.mockResolvedValue({
      channel: { name: "engineering", is_member: true },
    });
    mocks.conversationsMembers.mockResolvedValue({
      members: ["U_BOT", "U_OWNER", "U_OTHER"],
      response_metadata: {},
    });

    const result = await validateTargetChannelMembership(
      "T_A",
      "C_ENG",
      "U_OWNER",
    );

    expect(result.ok).toBe(true);
  });

  it("paginates through members and finds the user on a later page", async () => {
    mocks.conversationsInfo.mockResolvedValue({
      channel: { name: "general", is_member: true },
    });
    mocks.conversationsMembers
      .mockResolvedValueOnce({
        members: Array.from({ length: 1000 }, (_unused, i) => `U_PAGE1_${i}`),
        response_metadata: { next_cursor: "page2" },
      })
      .mockResolvedValueOnce({
        members: ["U_OWNER", "U_LATE"],
        response_metadata: {},
      });

    const result = await validateTargetChannelMembership(
      "T_A",
      "C_GENERAL",
      "U_OWNER",
    );

    expect(result.ok).toBe(true);
    expect(mocks.conversationsMembers).toHaveBeenCalledTimes(2);
  });
});

// Run-task target-channel fire path is exercised in scheduling-consumer.test.ts
// (the consumer test already has the slack adapter mock graph wired up; we
// add fire/error cases there rather than reproducing it here).
