import { env } from "@/env";

const SLACK_NOT_CONFIGURED_MESSAGE =
  "Slack is not configured on this deployment yet. Set SLACK_CLIENT_ID, SLACK_CLIENT_SECRET, and SLACK_SIGNING_SECRET as environment variables, then redeploy. See /install for the full walkthrough.";

// Validate by shape, not by matching placeholder strings: any value that
// doesn't look like a real Slack credential is treated as not-configured,
// so /install always routes through the SelfHostSetupWizard instead of
// handing junk to Slack ("Invalid client_id"). Deploy templates ship
// different filler ("placeholder", "replace-after-install", "placeholder
// (update this in a later step of the setup guide)", etc.) — none of
// them match these formats, so all of them correctly fail validation
// without us needing to know what each template uses.
const SLACK_CLIENT_ID_FORMAT = /^\d+\.\d+$/;
const SLACK_HEX_SECRET_FORMAT = /^[a-f0-9]{32}$/;

const matchesFormat = (value: string | undefined, format: RegExp): boolean =>
  Boolean(value) && format.test(value!);

export const isSlackConfigured = (): boolean =>
  matchesFormat(env.SLACK_CLIENT_ID, SLACK_CLIENT_ID_FORMAT) &&
  matchesFormat(env.SLACK_CLIENT_SECRET, SLACK_HEX_SECRET_FORMAT) &&
  matchesFormat(env.SLACK_SIGNING_SECRET, SLACK_HEX_SECRET_FORMAT);

export const slackNotConfiguredResponse = (): Response =>
  Response.json(
    { error: "slack_not_configured", message: SLACK_NOT_CONFIGURED_MESSAGE },
    { status: 503 },
  );

export type HostingPlatform =
  | "vercel"
  | "railway"
  | "render"
  | "fly"
  | "docker";

// Sniff which host Pookie is running on so the /install wizard can show
// host-specific "set env vars and redeploy" instructions. Default to
// "docker" for self-hosted compose/VPS/AWS/DO/Cloud Run setups that don't
// expose a host-identifying env var.
export const detectHost = (): HostingPlatform => {
  if (process.env.VERCEL || process.env.VERCEL_URL) return "vercel";
  if (process.env.RAILWAY_PUBLIC_DOMAIN) return "railway";
  if (process.env.RENDER) return "render";
  if (process.env.FLY_APP_NAME) return "fly";
  return "docker";
};

// Prefer the explicitly resolved BASE_URL (env, Vercel, Railway). The request
// origin fallback is limited to non-production environments because proxies may
// pass untrusted Host headers through to request.url.
export const resolveBaseUrl = (request?: Request): string => {
  if (env.BASE_URL) return env.BASE_URL;
  if (env.NODE_ENV === "production") {
    throw new Error(
      "BASE_URL must be configured in production before public URLs can be generated.",
    );
  }
  if (request) return new URL(request.url).origin;
  throw new Error(
    "BASE_URL is not configured and no request was available to derive it from.",
  );
};
