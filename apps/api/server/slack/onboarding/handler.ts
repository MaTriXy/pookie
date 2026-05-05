import { startOnboarding } from "./orchestrator";

import type { SlashCommandEvent } from "chat";

const extractRawField = (
  raw: unknown,
  field: "team_id" | "channel_id",
): string | undefined => {
  if (typeof raw === "object" && raw !== null && field in raw) {
    return (raw as Record<string, string | undefined>)[field];
  }
  return undefined;
};

export const handleOnboardingCommand = async (
  event: SlashCommandEvent,
): Promise<void> => {
  const teamId = extractRawField(event.raw, "team_id");
  if (!teamId) {
    await event.channel.postEphemeral(
      event.user,
      "couldn't figure out which workspace you're in. try again?",
      { fallbackToDM: true },
    );
    return;
  }

  const channelId = extractRawField(event.raw, "channel_id");
  if (!channelId) {
    await event.channel.postEphemeral(
      event.user,
      "couldn't figure out which channel you're in. try running /onboarding from a channel or dm.",
      { fallbackToDM: true },
    );
    return;
  }

  await startOnboarding(teamId, event.user.userId, channelId);
};
