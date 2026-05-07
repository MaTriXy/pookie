// Slack treats `<!channel>`, `<!here>`, `<!everyone>` as broadcast directives
// when they appear in a posted message — they trigger workspace-wide /
// channel-wide notifications regardless of who's reading. They're also
// permission-checked against the *poster's* identity, not the originating
// user's. So when the bot posts a message containing one of these tokens
// on behalf of a user (e.g., a scheduled task firing), the broadcast goes
// out under the bot's permissions, which may exceed the user's.
//
// To prevent permission laundering, strip these tokens to plain `@channel`
// / `@here` / `@everyone` text before posting. The bot still says the same
// words, but Slack no longer fires the notification.
//
// Subteam (user-group) mentions like `<!subteam^S123|@oncall>` are similarly
// privileged — the bot can ping any user-group it's allowed to see, which
// might exceed the originating user's reach. Same treatment.
const SLACK_BROADCAST_REGEX =
  /<!(channel|here|everyone)(?:\|[^>]*)?>|<!subteam\^[A-Z0-9]+(?:\|([^>]*))?>/g;

export const stripSlackBroadcasts = (text: string): string =>
  text.replace(
    SLACK_BROADCAST_REGEX,
    (_match, broadcastKeyword: string | undefined, subteamLabel: string) => {
      if (broadcastKeyword) return `@${broadcastKeyword}`;
      if (subteamLabel) return subteamLabel;
      return "@group";
    },
  );
