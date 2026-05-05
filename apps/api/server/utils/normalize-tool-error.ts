import * as SlackAPI from "@slack/web-api";

import { toolErr } from "../agent/tool-result";

import type { PookieToolError } from "../agent/tool-result";

const SLACK_ACCESS_CODES = new Set([
  "not_in_channel",
  "channel_not_found",
  "is_archived",
  "missing_scope",
]);

interface AccessContext {
  channelDisplayName?: string;
}

export const getChannelDisplayName = (
  channel: string | undefined,
  matchedName: string | undefined,
): string => (matchedName ? `#${matchedName}` : (channel ?? "that channel"));

const getChannelInviteInstructions = (channelDescriptor: string): string =>
  `i don't have access to ${channelDescriptor} yet. have someone who is already in the channel open it, type \`/invite @pookie\`, and send it. for a private channel, it must be invited by an existing member. if slash invite doesn't work, open the channel details, go to integrations/apps, and add pookie there.`;

const MISSING_SCOPE_INSTRUCTIONS =
  "pookie is missing Slack OAuth scopes for this action. reinstall the Slack app after updating scopes, then try again.";

const isSlackError = (
  caughtError: unknown,
): caughtError is
  | SlackAPI.WebAPIPlatformError
  | SlackAPI.WebAPIRequestError
  | SlackAPI.WebAPIHTTPError
  | SlackAPI.WebAPIRateLimitedError =>
  caughtError instanceof Error &&
  "code" in caughtError &&
  typeof (caughtError as { code?: unknown }).code === "string" &&
  Object.values(SlackAPI.ErrorCode).includes(
    (caughtError as { code: string }).code as SlackAPI.ErrorCode,
  );

export const getPlatformErrorCode = (
  caughtError: unknown,
): string | undefined => {
  if (!isSlackError(caughtError)) return undefined;
  if (caughtError.code !== SlackAPI.ErrorCode.PlatformError) return undefined;
  return (caughtError as SlackAPI.WebAPIPlatformError).data.error;
};

export const getErrorMessage = (caughtError: unknown): string | undefined =>
  caughtError instanceof Error ? caughtError.message : undefined;

export const getSlackErrorCode = (caughtError: unknown): string | undefined =>
  getPlatformErrorCode(caughtError) ?? getErrorMessage(caughtError);

export const buildSlackAccessNotFoundError = (
  channel: string,
): PookieToolError =>
  toolErr(
    "slack_access",
    `couldn't find a visible channel matching "${channel}"`,
    {
      code: "channel_not_found",
      instructions: getChannelInviteInstructions(
        getChannelDisplayName(channel, undefined),
      ),
    },
  );

export const normalizeToolError = (
  caughtError: unknown,
  fallbackMessage: string,
  accessContext: AccessContext = {},
): PookieToolError => {
  const platformCode = getPlatformErrorCode(caughtError);

  if (platformCode && SLACK_ACCESS_CODES.has(platformCode)) {
    const reason =
      platformCode === "is_archived"
        ? "the channel is archived"
        : platformCode === "missing_scope"
          ? "pookie is missing a required Slack permission scope"
          : "pookie cannot read this channel with its current Slack access";
    const instructions =
      platformCode === "missing_scope"
        ? MISSING_SCOPE_INSTRUCTIONS
        : getChannelInviteInstructions(
            accessContext.channelDisplayName ?? "that channel",
          );
    return toolErr("slack_access", reason, {
      code: platformCode,
      instructions,
    });
  }

  if (platformCode)
    return toolErr("slack_api", platformCode, { code: platformCode });

  if (isSlackError(caughtError)) {
    if (caughtError.code === SlackAPI.ErrorCode.RateLimitedError) {
      const rateLimited = caughtError as SlackAPI.WebAPIRateLimitedError;
      return toolErr(
        "slack_api",
        `slack rate limited, retry in ${rateLimited.retryAfter}s`,
        { code: caughtError.code },
      );
    }
    if (caughtError.code === SlackAPI.ErrorCode.HTTPError) {
      const httpError = caughtError as SlackAPI.WebAPIHTTPError;
      return toolErr("slack_api", `slack http ${httpError.statusCode}`, {
        code: caughtError.code,
      });
    }
    return toolErr("slack_api", caughtError.message || fallbackMessage, {
      code: caughtError.code,
    });
  }

  return toolErr(
    "unknown",
    caughtError instanceof Error ? caughtError.message : fallbackMessage,
  );
};
