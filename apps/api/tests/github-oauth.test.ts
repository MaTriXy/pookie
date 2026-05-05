import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  consumeOAuthState: vi.fn(),
  getServerConfig: vi.fn(),
  loadCodeVerifier: vi.fn(),
  saveCodeVerifier: vi.fn(),
  saveOAuthState: vi.fn(),
  saveServerConfig: vi.fn(),
}));

vi.mock("../server/mcp/store", () => ({
  consumeOAuthState: mocks.consumeOAuthState,
  getServerConfig: mocks.getServerConfig,
  loadCodeVerifier: mocks.loadCodeVerifier,
  saveCodeVerifier: mocks.saveCodeVerifier,
  saveOAuthState: mocks.saveOAuthState,
  saveServerConfig: mocks.saveServerConfig,
}));

vi.mock("@/env", () => ({
  env: {
    GITHUB_CLIENT_ID: "test-client-id",
    GITHUB_CLIENT_SECRET: "test-client-secret",
    BASE_URL: "https://pookie.example.com",
  },
}));

import {
  buildGitHubAuthorizationUrl,
  exchangeGitHubCode,
  finishGitHubOAuth,
  initiateGitHubOAuth,
  isGitHubOAuthConfigured,
} from "../server/mcp/github-oauth";

describe("isGitHubOAuthConfigured", () => {
  it("returns true when both env vars are set", () => {
    expect(isGitHubOAuthConfigured()).toBe(true);
  });
});

describe("buildGitHubAuthorizationUrl", () => {
  it("includes all required OAuth parameters", () => {
    const url = new URL(
      buildGitHubAuthorizationUrl("test-state", "test-challenge"),
    );

    expect(url.origin + url.pathname).toBe(
      "https://github.com/login/oauth/authorize",
    );
    expect(url.searchParams.get("client_id")).toBe("test-client-id");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://pookie.example.com/api/mcp/oauth/callback/github",
    );
    expect(url.searchParams.get("scope")).toBe("repo read:user read:org");
    expect(url.searchParams.get("state")).toBe("test-state");
    expect(url.searchParams.get("code_challenge")).toBe("test-challenge");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  });
});

describe("initiateGitHubOAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.saveOAuthState.mockResolvedValue(undefined);
    mocks.saveCodeVerifier.mockResolvedValue(undefined);
  });

  it("saves state and verifier, returns authorization URL", async () => {
    const result = await initiateGitHubOAuth(
      "U_TEST",
      "github",
      "C_CHAN",
      "T_TEAM",
    );

    expect(mocks.saveOAuthState).toHaveBeenCalledOnce();
    expect(mocks.saveCodeVerifier).toHaveBeenCalledOnce();

    const savedState = mocks.saveOAuthState.mock.calls[0];
    expect(savedState[1]).toEqual({
      userId: "U_TEST",
      serverName: "github",
      channelId: "C_CHAN",
      teamId: "T_TEAM",
    });

    const savedVerifier = mocks.saveCodeVerifier.mock.calls[0];
    expect(savedVerifier[0]).toBe("U_TEST");
    expect(savedVerifier[1]).toBe("github");
    expect(typeof savedVerifier[2]).toBe("string");
    expect(savedVerifier[3]).toBe("T_TEAM");

    const url = new URL(result.authorizationUrl);
    expect(url.searchParams.get("client_id")).toBe("test-client-id");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  });
});

describe("exchangeGitHubCode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns access_token on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ access_token: "gho_test_token_123" }),
      }),
    );

    const token = await exchangeGitHubCode("auth-code", "verifier");
    expect(token).toBe("gho_test_token_123");

    const fetchCall = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(fetchCall[0]).toBe("https://github.com/login/oauth/access_token");

    const body = JSON.parse(fetchCall[1].body);
    expect(body.code).toBe("auth-code");
    expect(body.code_verifier).toBe("verifier");
    expect(body.client_id).toBe("test-client-id");
    expect(body.client_secret).toBe("test-client-secret");

    vi.unstubAllGlobals();
  });

  it("throws on HTTP error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      }),
    );

    await expect(exchangeGitHubCode("code", "verifier")).rejects.toThrow(
      "GitHub token exchange failed: 500 Internal Server Error",
    );

    vi.unstubAllGlobals();
  });

  it("throws on error response from GitHub", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            error: "bad_verification_code",
            error_description: "The code passed is incorrect or expired.",
          }),
      }),
    );

    await expect(exchangeGitHubCode("code", "verifier")).rejects.toThrow(
      "The code passed is incorrect or expired.",
    );

    vi.unstubAllGlobals();
  });
});

describe("finishGitHubOAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws on invalid state token", async () => {
    mocks.consumeOAuthState.mockResolvedValue(null);

    await expect(
      finishGitHubOAuth({ code: "test-code", state: "invalid" }),
    ).rejects.toThrow("Invalid or expired OAuth state token");
  });

  it("throws when state is missing teamId", async () => {
    mocks.consumeOAuthState.mockResolvedValue({
      userId: "U_TEST",
      serverName: "github",
    });

    await expect(
      finishGitHubOAuth({ code: "test-code", state: "valid-state" }),
    ).rejects.toThrow("OAuth state missing teamId");
  });

  it("throws when code verifier is missing", async () => {
    mocks.consumeOAuthState.mockResolvedValue({
      userId: "U_TEST",
      serverName: "github",
      teamId: "T_TEAM",
    });
    mocks.loadCodeVerifier.mockResolvedValue(undefined);

    await expect(
      finishGitHubOAuth({ code: "test-code", state: "valid-state" }),
    ).rejects.toThrow("PKCE code verifier not found or expired");
  });

  it("throws when server config is not found", async () => {
    mocks.consumeOAuthState.mockResolvedValue({
      userId: "U_TEST",
      serverName: "github",
      teamId: "T_TEAM",
    });
    mocks.loadCodeVerifier.mockResolvedValue("test-verifier");
    mocks.getServerConfig.mockResolvedValue(null);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ access_token: "gho_token" }),
      }),
    );

    await expect(
      finishGitHubOAuth({ code: "test-code", state: "valid-state" }),
    ).rejects.toThrow('MCP server "github" not found');

    vi.unstubAllGlobals();
  });

  it("exchanges code, saves token to config, and returns result", async () => {
    const serverConfig = {
      name: "github",
      url: "https://api.githubcopilot.com/mcp",
      scope: { kind: "user" as const, userId: "U_TEST", teamId: "T_TEAM" },
      createdBy: "U_TEST",
      createdAt: Date.now(),
    };

    mocks.consumeOAuthState.mockResolvedValue({
      userId: "U_TEST",
      serverName: "github",
      teamId: "T_TEAM",
    });
    mocks.loadCodeVerifier.mockResolvedValue("test-verifier");
    mocks.getServerConfig.mockResolvedValue(serverConfig);
    mocks.saveServerConfig.mockResolvedValue(undefined);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ access_token: "gho_final_token" }),
      }),
    );

    const result = await finishGitHubOAuth({
      code: "test-code",
      state: "valid-state",
    });

    expect(result).toEqual({
      userId: "U_TEST",
      serverName: "github",
      channelId: undefined,
      teamId: "T_TEAM",
    });

    expect(mocks.saveServerConfig).toHaveBeenCalledOnce();
    const savedConfig = mocks.saveServerConfig.mock.calls[0][0];
    expect(savedConfig.token).toBe("gho_final_token");

    vi.unstubAllGlobals();
  });
});
