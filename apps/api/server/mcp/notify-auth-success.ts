import { slackBot } from "../slack-bot";

import type { SlackAdapter } from "@chat-adapter/slack";

export const notifyMcpAuthSuccess = ({
  userId,
  channelId,
  serverName,
  teamId,
}: {
  userId: string;
  channelId?: string;
  serverName: string;
  teamId: string;
}): void => {
  if (!channelId) return;

  const slack: SlackAdapter = slackBot.getAdapter("slack");
  const threadId = `slack:${channelId}`;

  const sendNotification = async (): Promise<void> => {
    await slackBot.initialize();
    const installation = await slack.getInstallation(teamId);
    if (!installation) {
      console.warn("[mcp-oauth-callback] no installation for team", teamId);
      return;
    }

    await slack.withBotToken(installation.botToken, async () => {
      await slack.postEphemeral(
        threadId,
        userId,
        `Connected to *${serverName}*! Please ask your question again.`,
      );
    });
  };

  sendNotification().catch((error: unknown) =>
    console.error(
      "[mcp-oauth-callback] ephemeral success notice failed:",
      error,
    ),
  );
};
