import { WebClient } from "@slack/web-api";

import { env } from "@/env";

import { slackBot } from "../slack-bot";

import type { SlackAdapter } from "@chat-adapter/slack";

import type { PookieSlackInstallation } from "./types";

export const resolveSlackWebClient = async (
  teamId: string,
): Promise<WebClient | undefined> => {
  const slack: SlackAdapter = slackBot.getAdapter("slack");
  const installation = (await slack.getInstallation(
    teamId,
  )) as PookieSlackInstallation | null;

  if (installation?.botToken) {
    return new WebClient(installation.botToken);
  }

  if (env.SLACK_BOT_TOKEN) {
    return new WebClient(env.SLACK_BOT_TOKEN);
  }

  return undefined;
};
