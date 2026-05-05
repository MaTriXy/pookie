import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    OPENAI_API_KEY: z.string().min(1),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    REDIS_URL: z.string().min(1),
    SLACK_BOT_TOKEN: z.string().min(1).optional(),
    SLACK_BOT_NAME: z.string().min(1).optional(),
    // Single-workspace user token used as a fallback search identity when the
    // per-request action_token isn't available (see slack-search.ts token strategy).
    // Only set this on self-hosted single-workspace deployments — using it on
    // multi-workspace installs leaks the installer's private channels / DMs.
    SLACK_USER_TOKEN: z.string().min(1).optional(),
    // Optional so a fresh deployment can boot before the operator has
    // finished the Slack onboarding (Step 2-4 in /install). The Slack-facing
    // routes return a 503 with a clear message until these are populated.
    SLACK_SIGNING_SECRET: z.string().min(1).optional(),
    SLACK_CLIENT_ID: z.string().min(1).optional(),
    SLACK_CLIENT_SECRET: z.string().min(1).optional(),
    // Symmetric key (Cryptr) used to encrypt OAuth tokens, MCP credentials,
    // and other sensitive material before persisting to Redis. Required
    // before MCP onboarding-connect actions can complete — without it,
    // server/utils/secure-store.ts throws "SLACK_ENCRYPTION_KEY is not set".
    // Generate with `openssl rand -hex 32`.
    SLACK_ENCRYPTION_KEY: z.string().min(1).optional(),
    VERCEL_URL: z.string().optional(),
    RAILWAY_PUBLIC_DOMAIN: z.string().optional(),
    GITHUB_CLIENT_ID: z.string().min(1).optional(),
    GITHUB_CLIENT_SECRET: z.string().min(1).optional(),
    // Optional outside production; routes may derive it from the request origin
    // during local setup. Vercel/Railway populate VERCEL_URL/RAILWAY_PUBLIC_DOMAIN
    // automatically once a domain is assigned. Production setups must resolve it
    // here before public URLs can be generated.
    BASE_URL: z.string().optional(),
    OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
    OTEL_EXPORTER_OTLP_HEADERS: z.string().optional(),
    OTEL_SERVICE_NAME: z.string().optional(),
    // Set to "true" on self-hosted deployments. Toggles the /install page
    // between the cloud marketing flow and a post-deploy setup wizard.
    IS_SELF_DEPLOYED: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
  },
  client: {},
  runtimeEnv: {
    BASE_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : process.env.RAILWAY_PUBLIC_DOMAIN
          ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
          : process.env.BASE_URL,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    NODE_ENV: process.env.NODE_ENV,
    REDIS_URL: process.env.REDIS_URL || process.env.KV_URL,
    SLACK_BOT_TOKEN: process.env.SLACK_BOT_TOKEN,
    SLACK_BOT_NAME: process.env.SLACK_BOT_NAME,
    SLACK_USER_TOKEN: process.env.SLACK_USER_TOKEN,
    SLACK_SIGNING_SECRET: process.env.SLACK_SIGNING_SECRET,
    SLACK_CLIENT_ID: process.env.SLACK_CLIENT_ID,
    SLACK_CLIENT_SECRET: process.env.SLACK_CLIENT_SECRET,
    SLACK_ENCRYPTION_KEY: process.env.SLACK_ENCRYPTION_KEY,
    VERCEL_URL: process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : undefined,
    RAILWAY_PUBLIC_DOMAIN: process.env.RAILWAY_PUBLIC_DOMAIN,
    GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET,
    OTEL_EXPORTER_OTLP_ENDPOINT: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
    OTEL_EXPORTER_OTLP_HEADERS: process.env.OTEL_EXPORTER_OTLP_HEADERS,
    OTEL_SERVICE_NAME: process.env.OTEL_SERVICE_NAME,
    IS_SELF_DEPLOYED: process.env.IS_SELF_DEPLOYED,
  },
  emptyStringAsUndefined: true,
  skipValidation: Boolean(process.env.SKIP_ENV_VALIDATION),
});
