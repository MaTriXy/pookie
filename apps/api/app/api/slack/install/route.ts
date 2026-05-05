import { NextResponse } from "next/server";

import { env } from "@/env";
import { OAUTH_STATE_COOKIE } from "@/lib/constants";
import {
  isSlackConfigured,
  resolveBaseUrl,
  slackNotConfiguredResponse,
} from "@/lib/deployment";
import {
  BOT_SCOPES,
  USER_OPTIONAL_SCOPES,
  USER_SCOPES,
} from "@/server/slack/manifest";
import { createOauthStateNonce } from "@/server/slack/oauth-state";

const dedupeScopes = (
  ...scopeLists: ReadonlyArray<readonly string[]>
): string[] => Array.from(new Set(scopeLists.flat()));

export const GET = (request: Request) => {
  if (!isSlackConfigured()) return slackNotConfiguredResponse();

  const state = createOauthStateNonce();
  const baseUrl = resolveBaseUrl(request);

  // Both required and optional user scopes must be passed in `user_scope` for
  // Slack to request them at all; the optional ones are surfaced as
  // user-skippable on the consent screen because they're declared in the
  // manifest's `user_optional` block (see server/slack/manifest.ts).
  const userScopes = dedupeScopes(USER_SCOPES, USER_OPTIONAL_SCOPES);

  const slackUrl = new URL("https://slack.com/oauth/v2/authorize");
  slackUrl.search = new URLSearchParams({
    client_id: env.SLACK_CLIENT_ID!,
    scope: BOT_SCOPES.join(","),
    user_scope: userScopes.join(","),
    redirect_uri: `${baseUrl}/api/slack/oauth`,
    state,
  }).toString();

  const response = NextResponse.redirect(slackUrl);
  response.cookies.set({
    name: OAUTH_STATE_COOKIE,
    value: state,
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return response;
};
