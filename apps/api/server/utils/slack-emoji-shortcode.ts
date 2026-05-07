import { which as whichEmoji } from "node-emoji";

// Slack emoji shortcodes are lowercase letters/digits with optional `_`, `+`,
// `-` -- e.g. `ok`, `white_check_mark`, `+1`. This is the shape Slack's
// `reactions.add` API accepts and the same shape used in stored config for
// the welcome-reaction emoji.
export const SLACK_EMOJI_SHORTCODE_REGEX = /^[a-z0-9_+-]+$/;

export const isValidSlackEmojiShortcode = (value: string): boolean =>
  SLACK_EMOJI_SHORTCODE_REGEX.test(value);

// Resolve any of the shapes an LLM might emit for an emoji into the
// canonical Slack shortcode (no colons):
//   - unicode emoji char     "🚩"  → "triangular_flag_on_post"
//   - shortcode w/ colons    ":cat:" → "cat"
//   - shortcode w/o colons   "cat"  → "cat"
//   - workspace-custom name  "partyparrot" → "partyparrot" (passed through)
//
// The unicode → shortcode mapping comes from `node-emoji`, which is built
// on the same gemoji catalog Slack itself uses, so common emoji round-trip
// without surprises. ASCII shortcodes that aren't in node-emoji's table
// (e.g. workspace-custom emojis) still flow through unchanged so Slack can
// accept them when they exist in the workspace.
export const resolveSlackEmojiShortcode = (rawEmoji: string): string => {
  const colonStripped = rawEmoji.trim().replace(/^:|:$/g, "");
  const fromUnicode = whichEmoji(colonStripped);
  return fromUnicode ?? colonStripped;
};
