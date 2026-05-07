// Slack emoji shortcodes are lowercase letters/digits with optional `_`, `+`,
// `-` -- e.g. `ok`, `white_check_mark`, `+1`. This is the shape Slack's
// `reactions.add` API accepts and the same shape used in stored config for
// the welcome-reaction emoji.
export const SLACK_EMOJI_SHORTCODE_REGEX = /^[a-z0-9_+-]+$/;

export const isValidSlackEmojiShortcode = (value: string): boolean =>
  SLACK_EMOJI_SHORTCODE_REGEX.test(value);
