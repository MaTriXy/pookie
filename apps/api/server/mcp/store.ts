import {
  MCP_AUTH_LINK_PREFIX,
  MCP_CONFIG_PREFIX,
  MCP_OAUTH_PREFIX,
  MCP_STATE_PREFIX,
  OAUTH_STATE_TTL_SECONDS,
  PENDING_AUTH_URL_TTL_SECONDS,
  PKCE_VERIFIER_TTL_SECONDS,
  oauthOwnerId,
} from "./constants";

export { oauthOwnerId };
import { decryptSecret, encryptSecret } from "../utils/secure-store";
import { redis } from "./redis";

import type { OAuthClientInformation, OAuthTokens } from "@ai-sdk/mcp";

export interface McpScopeGlobal {
  kind: "global";
  teamId: string;
}

export interface McpScopeChannel {
  kind: "channel";
  channelId: string;
  teamId: string;
}

export interface McpScopeUser {
  kind: "user";
  userId: string;
  teamId: string;
}

export type McpScope = McpScopeGlobal | McpScopeChannel | McpScopeUser;

export interface McpServerConfig {
  name: string;
  url: string;
  scope: McpScope;
  createdBy: string;
  createdAt: number;
  token?: string;
}

export interface OAuthStatePayload {
  userId: string;
  serverName: string;
  channelId?: string;
  teamId: string;
}

export interface OAuthAuthorizationLinkPayload {
  serverName: string;
  authorizationUrl: string;
}

const configKey = (scope: McpScope, serverName: string): string => {
  switch (scope.kind) {
    case "global":
      return `${MCP_CONFIG_PREFIX}:global:${scope.teamId}:${serverName}`;
    case "channel":
      return `${MCP_CONFIG_PREFIX}:channel:${scope.teamId}:${scope.channelId}:${serverName}`;
    case "user":
      return `${MCP_CONFIG_PREFIX}:user:${scope.teamId}:${scope.userId}:${serverName}`;
  }
};

const configScanPattern = (scope: McpScope): string => {
  switch (scope.kind) {
    case "global":
      return `${MCP_CONFIG_PREFIX}:global:${scope.teamId}:*`;
    case "channel":
      return `${MCP_CONFIG_PREFIX}:channel:${scope.teamId}:${scope.channelId}:*`;
    case "user":
      return `${MCP_CONFIG_PREFIX}:user:${scope.teamId}:${scope.userId}:*`;
  }
};

const oauthTokensKey = (
  ownerId: string,
  serverName: string,
  teamId: string,
): string => `${MCP_OAUTH_PREFIX}:${teamId}:${ownerId}:${serverName}:tokens`;

const oauthClientKey = (
  ownerId: string,
  serverName: string,
  teamId: string,
): string => `${MCP_OAUTH_PREFIX}:${teamId}:${ownerId}:${serverName}:client`;

const pkceVerifierKey = (
  userId: string,
  serverName: string,
  teamId: string,
): string => `${MCP_OAUTH_PREFIX}:${teamId}:${userId}:${serverName}:verifier`;

const pendingAuthUrlKey = (
  userId: string,
  serverName: string,
  teamId: string,
): string =>
  `${MCP_OAUTH_PREFIX}:${teamId}:${userId}:${serverName}:pending-auth`;

const oauthStateKey = (stateToken: string): string =>
  `${MCP_STATE_PREFIX}:${stateToken}`;

const oauthAuthorizationLinkKey = (linkToken: string): string =>
  `${MCP_AUTH_LINK_PREFIX}:${linkToken}`;

export const saveServerConfig = async (
  config: McpServerConfig,
): Promise<void> => {
  const encrypted = await encryptSecret(JSON.stringify(config));
  await redis.set(configKey(config.scope, config.name), encrypted);
};

export const getServerConfig = async (
  scope: McpScope,
  serverName: string,
): Promise<McpServerConfig | null> => {
  const raw = await redis.get(configKey(scope, serverName));
  const decrypted = await decryptSecret(raw);
  if (!decrypted) return null;
  return JSON.parse(decrypted) as McpServerConfig;
};

const scanAll = async (pattern: string): Promise<string[]> => {
  const results: string[] = [];
  let cursor = 0;

  do {
    const scanResult = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
    cursor = Number(scanResult[0]);
    results.push(...scanResult[1]);
  } while (cursor !== 0);

  return results;
};

const listServerConfigs = async (
  scope: McpScope,
): Promise<McpServerConfig[]> => {
  const keys = await scanAll(configScanPattern(scope));
  if (keys.length === 0) return [];

  const pipeline = redis.pipeline();
  for (const key of keys) {
    pipeline.get(key);
  }
  const results = await pipeline.exec();
  // ioredis returns [Error | null, T][]; drop errored entries and unwrap.
  const values = (results ?? [])
    .map(([err, val]) => (err ? null : val))
    .filter(Boolean);

  const decryptedConfigs = await Promise.all(
    values.map(async (raw) => {
      const decrypted = await decryptSecret(raw);
      if (!decrypted) return null;
      return JSON.parse(decrypted) as McpServerConfig;
    }),
  );

  return decryptedConfigs.filter(
    (config): config is McpServerConfig => config !== null,
  );
};

export const listVisibleServers = async (
  userId: string,
  channelId: string | undefined,
  teamId: string,
): Promise<McpServerConfig[]> => {
  const scopes: McpScope[] = [
    { kind: "global", teamId },
    { kind: "user", userId, teamId },
  ];
  if (channelId) {
    scopes.push({ kind: "channel", channelId, teamId });
  }

  const configLists = await Promise.all(scopes.map(listServerConfigs));
  const merged = new Map<string, McpServerConfig>();

  for (const configs of configLists) {
    for (const config of configs) {
      merged.set(config.name, config);
    }
  }

  return [...merged.values()];
};

export const removeServerConfig = async (
  scope: McpScope,
  serverName: string,
): Promise<boolean> => {
  const deleted = await redis.del(configKey(scope, serverName));
  return deleted > 0;
};

export const saveOAuthTokens = async (
  ownerId: string,
  serverName: string,
  tokens: OAuthTokens,
  teamId: string,
): Promise<void> => {
  const encrypted = await encryptSecret(JSON.stringify(tokens));
  await redis.set(oauthTokensKey(ownerId, serverName, teamId), encrypted);
};

export const loadOAuthTokens = async (
  ownerId: string,
  serverName: string,
  teamId: string,
): Promise<OAuthTokens | undefined> => {
  const raw = await redis.get(oauthTokensKey(ownerId, serverName, teamId));
  const decrypted = await decryptSecret(raw);
  if (!decrypted) return undefined;
  return JSON.parse(decrypted) as OAuthTokens;
};

export const saveOAuthClient = async (
  ownerId: string,
  serverName: string,
  clientInfo: OAuthClientInformation,
  teamId: string,
): Promise<void> => {
  const encrypted = await encryptSecret(JSON.stringify(clientInfo));
  await redis.set(oauthClientKey(ownerId, serverName, teamId), encrypted);
};

export const loadOAuthClient = async (
  ownerId: string,
  serverName: string,
  teamId: string,
): Promise<OAuthClientInformation | undefined> => {
  const raw = await redis.get(oauthClientKey(ownerId, serverName, teamId));
  const decrypted = await decryptSecret(raw);
  if (!decrypted) return undefined;
  return JSON.parse(decrypted) as OAuthClientInformation;
};

export const saveCodeVerifier = async (
  userId: string,
  serverName: string,
  verifier: string,
  teamId: string,
): Promise<void> => {
  const encrypted = await encryptSecret(verifier);
  await redis.set(
    pkceVerifierKey(userId, serverName, teamId),
    encrypted,
    "EX",
    PKCE_VERIFIER_TTL_SECONDS,
  );
};

export const loadCodeVerifier = async (
  userId: string,
  serverName: string,
  teamId: string,
): Promise<string | undefined> => {
  const raw = await redis.get(pkceVerifierKey(userId, serverName, teamId));
  const decrypted = await decryptSecret(raw);
  return decrypted ?? undefined;
};

export const saveOAuthState = async (
  stateToken: string,
  payload: OAuthStatePayload,
): Promise<void> => {
  const encrypted = await encryptSecret(JSON.stringify(payload));
  await redis.set(
    oauthStateKey(stateToken),
    encrypted,
    "EX",
    OAUTH_STATE_TTL_SECONDS,
  );
};

export const consumeOAuthState = async (
  stateToken: string,
): Promise<OAuthStatePayload | null> => {
  const key = oauthStateKey(stateToken);
  const data = await redis.get(key);
  if (!data) return null;
  await redis.del(key);
  const decrypted = await decryptSecret(data);
  if (!decrypted) return null;
  return JSON.parse(decrypted) as OAuthStatePayload;
};

export const savePendingAuthUrl = async (
  userId: string,
  serverName: string,
  authorizationUrl: string,
  teamId: string,
): Promise<void> => {
  // Shorter than OAUTH_STATE_TTL so this key expires before the
  // embedded state token does — prevents surfacing stale auth URLs.
  const encrypted = await encryptSecret(authorizationUrl);
  await redis.set(
    pendingAuthUrlKey(userId, serverName, teamId),
    encrypted,
    "EX",
    PENDING_AUTH_URL_TTL_SECONDS,
  );
};

export const loadPendingAuthUrl = async (
  userId: string,
  serverName: string,
  teamId: string,
): Promise<string | undefined> => {
  const raw = await redis.get(pendingAuthUrlKey(userId, serverName, teamId));
  const decrypted = await decryptSecret(raw);
  return decrypted ?? undefined;
};

export const clearPendingAuthUrl = async (
  userId: string,
  serverName: string,
  teamId: string,
): Promise<void> => {
  await redis.del(pendingAuthUrlKey(userId, serverName, teamId));
};

export const clearOAuthArtifacts = async (
  userId: string,
  serverName: string,
  teamId: string,
  tokenOwnerId?: string,
): Promise<void> => {
  const keysToDelete = [
    oauthTokensKey(userId, serverName, teamId),
    oauthClientKey(userId, serverName, teamId),
    pkceVerifierKey(userId, serverName, teamId),
    pendingAuthUrlKey(userId, serverName, teamId),
  ];

  if (tokenOwnerId && tokenOwnerId !== userId) {
    keysToDelete.push(
      oauthTokensKey(tokenOwnerId, serverName, teamId),
      oauthClientKey(tokenOwnerId, serverName, teamId),
    );
  }

  await redis.del(...keysToDelete);
};

export const saveOAuthAuthorizationLink = async (
  linkToken: string,
  payload: OAuthAuthorizationLinkPayload,
): Promise<void> => {
  const encrypted = await encryptSecret(JSON.stringify(payload));
  await redis.set(
    oauthAuthorizationLinkKey(linkToken),
    encrypted,
    "EX",
    OAUTH_STATE_TTL_SECONDS,
  );
};

export const loadOAuthAuthorizationLink = async (
  linkToken: string,
): Promise<OAuthAuthorizationLinkPayload | null> => {
  // GETDEL — link tokens are single-use to shrink the replay window if the
  // ?token=... in the URL leaks (browser history, referrer, proxy logs).
  const raw = await redis.getdel(oauthAuthorizationLinkKey(linkToken));
  const decrypted = await decryptSecret(raw);
  if (!decrypted) return null;
  return JSON.parse(decrypted) as OAuthAuthorizationLinkPayload;
};
