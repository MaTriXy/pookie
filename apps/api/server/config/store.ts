import { redis } from "../mcp/redis";
import { POOKIE_CONFIG_PREFIX } from "./constants";
import { pookieConfigPartialSchema } from "./schema";

import type { PookieConfigPartial, PookieConfigScope } from "./schema";

const configKey = (scope: PookieConfigScope): string => {
  switch (scope.kind) {
    case "global":
      return `${POOKIE_CONFIG_PREFIX}:${scope.teamId}:global`;
    case "channel":
      return `${POOKIE_CONFIG_PREFIX}:${scope.teamId}:channel:${scope.channelId}`;
    case "user":
      return `${POOKIE_CONFIG_PREFIX}:${scope.teamId}:user:${scope.userId}`;
  }
};

const parseStoredConfig = (raw: unknown, key: string): PookieConfigPartial => {
  if (!raw) return {};
  try {
    const deserialized =
      typeof raw === "string" ? (JSON.parse(raw) as unknown) : raw;
    const parsed = pookieConfigPartialSchema.safeParse(deserialized);
    if (parsed.success) return parsed.data;
    // Stored value didn't match the current schema — possibly a schema
    // migration, a hand-edited redis value, or a corrupted write. Log
    // enough to diagnose without leaking a huge blob, and fall back to
    // defaults rather than failing the whole turn.
    const preview =
      typeof raw === "string"
        ? raw.slice(0, 120)
        : JSON.stringify(raw).slice(0, 120);
    console.warn("[pookie-config] stored config failed schema validation", {
      key,
      preview,
      issues: parsed.error.issues.slice(0, 3),
    });
    return {};
  } catch (parseError) {
    console.warn("[pookie-config] failed to parse stored config", {
      key,
      error: parseError,
    });
    return {};
  }
};

export const loadConfigForScope = async (
  scope: PookieConfigScope,
): Promise<PookieConfigPartial> => {
  const key = configKey(scope);
  try {
    const raw = await redis.get(key);
    return parseStoredConfig(raw, key);
  } catch (redisError) {
    // Degrade gracefully on transient Redis failures (network blip,
    // rate limit) so a single config-load error doesn't reject the
    // Promise.all in buildSystemMessages and crash the entire agent
    // response path.
    console.warn("[pookie-config] failed to load config for scope", {
      key,
      error: redisError,
    });
    return {};
  }
};

export const saveConfigForScope = async (
  scope: PookieConfigScope,
  partial: PookieConfigPartial,
): Promise<void> => {
  const key = configKey(scope);
  if (Object.keys(partial).length === 0) {
    await redis.del(key);
    return;
  }
  await redis.set(key, JSON.stringify(partial));
};

export const clearConfigForScope = async (
  scope: PookieConfigScope,
): Promise<boolean> => {
  const deleted = await redis.del(configKey(scope));
  return deleted > 0;
};
