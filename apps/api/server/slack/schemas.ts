import { z } from "zod";

import type { SlackEvent } from "./types";

interface SlackEventEnvelope {
  channel?: string;
  channel_id?: string;
  event?: SlackEvent;
  team?: string;
  team_id?: string;
  user?: string;
}

const slackEventEnvelopeSchema = z
  .object({
    user: z.string().min(1).optional(),
    channel: z.string().min(1).optional(),
    channel_id: z.string().min(1).optional(),
    team: z.string().min(1).optional(),
    team_id: z.string().min(1).optional(),
    event: z.custom<SlackEvent>().optional(),
  })
  .partial() satisfies z.ZodType<SlackEventEnvelope>;

export interface SlackEventContext {
  userId?: string;
  channelId?: string;
  teamId: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object";

const getSlackStringField = (
  value: unknown,
  field: "channel" | "channel_id" | "team" | "user",
): string | undefined => {
  if (!isRecord(value)) return;
  const fieldValue = value[field];
  return typeof fieldValue === "string" ? fieldValue : undefined;
};

export const extractSlackEventContext = (raw: unknown): SlackEventContext => {
  const parsed = slackEventEnvelopeSchema.safeParse(raw);
  const data = parsed.success ? parsed.data : undefined;

  const teamId =
    data?.team_id ?? data?.team ?? getSlackStringField(data?.event, "team");
  if (!teamId) {
    throw new Error("teamId is required but missing from Slack event payload");
  }

  return {
    userId: data?.user ?? getSlackStringField(data?.event, "user"),
    channelId:
      data?.channel ??
      data?.channel_id ??
      getSlackStringField(data?.event, "channel") ??
      getSlackStringField(data?.event, "channel_id"),
    teamId,
  };
};

export const extractSlackChannelId = (raw: unknown): string | undefined =>
  extractSlackEventContext(raw).channelId;
