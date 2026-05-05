import { resolveSlackWebClient } from "../slack/web-client";

export const isSlackAdmin = async (
  userId: string,
  teamId: string | undefined,
): Promise<boolean> => {
  if (!teamId) return false;

  try {
    const client = await resolveSlackWebClient(teamId);
    if (!client) return false;

    const response = await client.users.info({ user: userId });
    const user = response.user;
    return Boolean(user?.is_admin) || Boolean(user?.is_owner);
  } catch {
    return false;
  }
};
