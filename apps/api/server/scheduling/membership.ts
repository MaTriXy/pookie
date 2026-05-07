import { resolveSlackWebClient } from "../slack/web-client";
import { logger } from "../utils/logger";

export interface MembershipOk {
  ok: true;
  channelName?: string;
}

export interface MembershipErr {
  ok: false;
  message: string;
}

export type MembershipResult = MembershipOk | MembershipErr;

const MEMBERS_PER_PAGE = 1000;

const channelDescriptor = (channelId: string, channelName?: string): string =>
  channelName ? `<#${channelId}|${channelName}>` : `<#${channelId}>`;

// Verifies that BOTH the bot and the scheduling user are members of the
// target channel. Hard posture (per design): we won't schedule a fire
// into a channel the user isn't in themselves, even if the bot has
// access. Closes the privilege-laundering vector where someone in
// channel A could route the bot's voice into channel B that they
// can't post into directly.
//
// Bot membership is checked via `conversations.info` — the bot's own
// info call returns `is_member: true` only when the bot is in the
// channel.
//
// User membership is checked via `conversations.members` paginated
// until we either find the user, exhaust the channel, or hit a hard
// page-count safety bound (rare in practice; channels with > N×1000
// members are uncommon and the early-exit on match keeps p50 fast).
const MAX_MEMBER_PAGES = 50;

export const validateTargetChannelMembership = async (
  teamId: string,
  channelId: string,
  userId: string,
): Promise<MembershipResult> => {
  const client = await resolveSlackWebClient(teamId);
  if (!client) {
    return {
      ok: false,
      message:
        "couldn't resolve a Slack client for this workspace — make sure Pookie is installed and the bot token is available",
    };
  }

  let channelName: string | undefined;
  try {
    const infoResponse = await client.conversations.info({
      channel: channelId,
    });
    channelName = infoResponse.channel?.name;
    if (!infoResponse.channel?.is_member) {
      return {
        ok: false,
        message: `Pookie isn't a member of ${channelDescriptor(channelId, channelName)} yet — invite it with \`/invite @pookie\` in that channel and try again`,
      };
    }
  } catch (infoError) {
    logger.warn("[scheduling] conversations.info failed for target channel", {
      teamId,
      channelId,
      error: infoError instanceof Error ? infoError.message : String(infoError),
    });
    return {
      ok: false,
      message: `couldn't check Pookie's access to <#${channelId}> (channel may not exist or Pookie has no permission to see it)`,
    };
  }

  // User-membership: paginate. Early-exit on match.
  let cursor: string | undefined;
  for (let pageIndex = 0; pageIndex < MAX_MEMBER_PAGES; pageIndex++) {
    try {
      const membersResponse = await client.conversations.members({
        channel: channelId,
        limit: MEMBERS_PER_PAGE,
        cursor,
      });
      const members = membersResponse.members ?? [];
      if (members.includes(userId)) {
        return { ok: true, channelName };
      }
      cursor = membersResponse.response_metadata?.next_cursor;
      if (!cursor) break;
    } catch (membersError) {
      logger.warn(
        "[scheduling] conversations.members failed for target channel",
        {
          teamId,
          channelId,
          userId,
          error:
            membersError instanceof Error
              ? membersError.message
              : String(membersError),
        },
      );
      return {
        ok: false,
        message: `couldn't verify your membership in ${channelDescriptor(channelId, channelName)} (Slack API error)`,
      };
    }
  }

  return {
    ok: false,
    message: `you don't appear to be a member of ${channelDescriptor(channelId, channelName)} — only members can schedule posts into it`,
  };
};
