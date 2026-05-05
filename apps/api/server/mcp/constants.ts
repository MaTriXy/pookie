import type { McpScope } from "./store";

export const MCP_CONFIG_PREFIX = "pookie:mcp:config";
export const MCP_OAUTH_PREFIX = "pookie:mcp:oauth";
export const MCP_STATE_PREFIX = "pookie:mcp:state";
export const MCP_AUTH_LINK_PREFIX = "pookie:mcp:auth-link";

export const OAUTH_STATE_TTL_SECONDS = 900;
export const PKCE_VERIFIER_TTL_SECONDS = 900;
export const PENDING_AUTH_URL_TTL_SECONDS = 600;

export const SERVER_NAME_REGEX = /^[a-z0-9][a-z0-9_-]{0,62}$/;

export const MCP_TOOL_NAME_SEPARATOR = "_";

export const GITHUB_OAUTH_AUTHORIZE_URL =
  "https://github.com/login/oauth/authorize";
export const GITHUB_OAUTH_TOKEN_URL =
  "https://github.com/login/oauth/access_token";
export const GITHUB_OAUTH_SCOPES = "repo read:user read:org";
export const GITHUB_OAUTH_CALLBACK_PATH = "/api/mcp/oauth/callback/github";

export const oauthOwnerId = (
  scope: McpScope,
  requestingUserId: string,
): string => {
  switch (scope.kind) {
    case "channel":
      return `team:${scope.teamId}:channel:${scope.channelId}`;
    case "global":
      return `team:${scope.teamId}:global`;
    case "user":
      return `team:${scope.teamId}:user:${requestingUserId}`;
  }
};
