export const POOKIE_CONFIG_PREFIX = "pookie:config";

export const CONFIG_KEY_PERSONALITY = "personality";
export const CONFIG_KEY_REACTION_EMOJI = "reactionEmoji";
export const CONFIG_KEY_CARDS = "cards";
export const CONFIG_KEY_TRACES_FOOTER = "tracesFooter";
export const CONFIG_KEY_REASONING_EFFORT = "reasoningEffort";

export const CONFIG_KEYS = [
  CONFIG_KEY_PERSONALITY,
  CONFIG_KEY_REACTION_EMOJI,
  CONFIG_KEY_CARDS,
  CONFIG_KEY_TRACES_FOOTER,
  CONFIG_KEY_REASONING_EFFORT,
] as const;

export const DEFAULT_REACTION_EMOJI = "sparkling_heart";
