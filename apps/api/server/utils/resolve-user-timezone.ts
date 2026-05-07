import { resolveSlackWebClient } from "../slack/web-client";
import { logger } from "./logger";

const DEFAULT_TIMEZONE = "UTC";

export interface ResolvedUserTimezone {
  tz: string;
  // True when we couldn't get a timezone from Slack and fell back to UTC.
  // Callers should surface this to the user — without it, "every weekday at
  // 9am" silently fires at 9am UTC, which is 1am for a Pacific-coast user.
  isFallback: boolean;
}

// Slack stores per-user IANA timezone names on the User object (e.g.,
// "America/Los_Angeles"). Cron schedules need this for "every weekday at
// 9am" — without it we'd interpret 9am as UTC and fire 9 hours early for
// a Pacific-coast user. Falls back to UTC if Slack doesn't return a tz
// (rare; happens when the user hasn't set their timezone in Slack).
export const resolveUserTimezone = async (
  teamId: string,
  userId: string,
): Promise<ResolvedUserTimezone> => {
  try {
    const client = await resolveSlackWebClient(teamId);
    if (!client) return { tz: DEFAULT_TIMEZONE, isFallback: true };
    const response = await client.users.info({ user: userId });
    const tz = response.user?.tz;
    if (typeof tz === "string" && tz.length > 0) {
      return { tz, isFallback: false };
    }
    return { tz: DEFAULT_TIMEZONE, isFallback: true };
  } catch (timezoneError) {
    logger.warn("[scheduling] failed to resolve user timezone", {
      teamId,
      userId,
      error:
        timezoneError instanceof Error
          ? timezoneError.message
          : String(timezoneError),
    });
    return { tz: DEFAULT_TIMEZONE, isFallback: true };
  }
};
