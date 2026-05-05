import { WebClient } from "@slack/web-api";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { env } from "@/env";
import { OAUTH_STATE_COOKIE } from "@/lib/constants";
import {
  isSlackConfigured,
  resolveBaseUrl,
  slackNotConfiguredResponse,
} from "@/lib/deployment";
import { slackBot } from "@/server/bot";
import { isOauthStateMatch } from "@/server/slack/oauth-state";

import type { PookieSlackInstallation } from "@/server/slack/types";

const errorRedirect = (baseUrl: string, reason: string) => {
  const target = new URL("/", baseUrl);
  target.searchParams.set("slack_error", reason);
  const response = NextResponse.redirect(target);
  response.cookies.delete(OAUTH_STATE_COOKIE);
  return response;
};

export const GET = async (request: Request) => {
  if (!isSlackConfigured()) return slackNotConfiguredResponse();

  const baseUrl = resolveBaseUrl(request);
  const url = new URL(request.url);

  const errorReason = url.searchParams.get("error");
  if (errorReason) return errorRedirect(baseUrl, errorReason);

  const stateCookie = (await cookies()).get(OAUTH_STATE_COOKIE)?.value;
  const stateParam = url.searchParams.get("state");
  if (!isOauthStateMatch(stateCookie, stateParam)) {
    console.error("[slack oauth] state mismatch", {
      hasCookie: Boolean(stateCookie),
      hasParam: Boolean(stateParam),
    });
    return errorRedirect(baseUrl, "invalid_state");
  }

  try {
    await slackBot.initialize();
    const slack = slackBot.getAdapter("slack");
    const code = url.searchParams.get("code");
    if (!code) throw new Error("missing slack oauth code");

    const result = await new WebClient().oauth.v2.access({
      client_id: env.SLACK_CLIENT_ID!,
      client_secret: env.SLACK_CLIENT_SECRET!,
      code,
      redirect_uri: `${baseUrl}/api/slack/oauth`,
    });

    if (!(result.ok && result.access_token && result.team?.id)) {
      throw new Error(
        result.error || "slack oauth did not return an installation",
      );
    }

    const installation: PookieSlackInstallation = {
      botToken: result.access_token,
      botUserId: result.bot_user_id,
      teamName: result.team.name,
      userToken: result.authed_user?.access_token,
    };
    await slack.setInstallation(result.team.id, installation);

    const target = new URL("/guide", baseUrl);
    target.searchParams.set("team", result.team.id);
    if (result.app_id) target.searchParams.set("app", result.app_id);
    if (result.team.name)
      target.searchParams.set("team_name", result.team.name);
    const response = NextResponse.redirect(target);
    response.cookies.delete(OAUTH_STATE_COOKIE);
    return response;
  } catch (err) {
    console.error("[slack oauth] callback failed:", err);
    return errorRedirect(
      baseUrl,
      err instanceof Error && err.message ? err.message : "install_failed",
    );
  }
};
