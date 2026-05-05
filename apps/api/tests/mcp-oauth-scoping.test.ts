import { describe, expect, it } from "vitest";

import { oauthOwnerId } from "../server/mcp/constants";

import type { McpScope } from "../server/mcp/store";

describe("oauthOwnerId", () => {
  it("returns a team+user-prefixed key for user-scoped MCPs", () => {
    const scope: McpScope = {
      kind: "user",
      userId: "U_OWNER",
      teamId: "T_TEAM",
    };
    expect(oauthOwnerId(scope, "U_REQUESTER")).toBe(
      "team:T_TEAM:user:U_REQUESTER",
    );
  });

  it("returns a team+channel-prefixed key for channel-scoped MCPs", () => {
    const scope: McpScope = {
      kind: "channel",
      channelId: "C_CHAN",
      teamId: "T_TEAM",
    };
    expect(oauthOwnerId(scope, "U_NISARG")).toBe("team:T_TEAM:channel:C_CHAN");
  });

  it("returns a team-prefixed global key for global-scoped MCPs", () => {
    const scope: McpScope = { kind: "global", teamId: "T_TEAM" };
    expect(oauthOwnerId(scope, "U_ANYONE")).toBe("team:T_TEAM:global");
  });

  it("channel-scoped key is identical regardless of requesting user", () => {
    const scope: McpScope = {
      kind: "channel",
      channelId: "C123",
      teamId: "T_TEAM",
    };
    const keyNisarg = oauthOwnerId(scope, "U_NISARG");
    const keyAiden = oauthOwnerId(scope, "U_AIDEN");
    expect(keyNisarg).toBe(keyAiden);
  });

  it("global key is identical regardless of requesting user within the same team", () => {
    const scope: McpScope = { kind: "global", teamId: "T_TEAM" };
    const keyA = oauthOwnerId(scope, "U_ALICE");
    const keyB = oauthOwnerId(scope, "U_BOB");
    expect(keyA).toBe(keyB);
  });

  it("global keys differ across teams", () => {
    const scopeA: McpScope = { kind: "global", teamId: "T_ALPHA" };
    const scopeB: McpScope = { kind: "global", teamId: "T_BETA" };
    expect(oauthOwnerId(scopeA, "U_X")).not.toBe(oauthOwnerId(scopeB, "U_X"));
  });

  it("user-scoped key differs per requesting user", () => {
    const scope: McpScope = {
      kind: "user",
      userId: "U_OWNER",
      teamId: "T_TEAM",
    };
    const keyA = oauthOwnerId(scope, "U_ALICE");
    const keyB = oauthOwnerId(scope, "U_BOB");
    expect(keyA).not.toBe(keyB);
  });

  it("user-scoped keys differ across teams for the same user", () => {
    const scopeA: McpScope = {
      kind: "user",
      userId: "U_ALICE",
      teamId: "T_ALPHA",
    };
    const scopeB: McpScope = {
      kind: "user",
      userId: "U_ALICE",
      teamId: "T_BETA",
    };
    expect(oauthOwnerId(scopeA, "U_ALICE")).not.toBe(
      oauthOwnerId(scopeB, "U_ALICE"),
    );
  });

  it("different channels produce different keys", () => {
    const scopeA: McpScope = {
      kind: "channel",
      channelId: "C_ONE",
      teamId: "T_TEAM",
    };
    const scopeB: McpScope = {
      kind: "channel",
      channelId: "C_TWO",
      teamId: "T_TEAM",
    };
    expect(oauthOwnerId(scopeA, "U_X")).not.toBe(oauthOwnerId(scopeB, "U_X"));
  });

  it("same channel in different teams produces different keys", () => {
    const scopeA: McpScope = {
      kind: "channel",
      channelId: "C_SHARED",
      teamId: "T_ALPHA",
    };
    const scopeB: McpScope = {
      kind: "channel",
      channelId: "C_SHARED",
      teamId: "T_BETA",
    };
    expect(oauthOwnerId(scopeA, "U_X")).not.toBe(oauthOwnerId(scopeB, "U_X"));
  });
});
