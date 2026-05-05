import { DEFAULT_REACTION_EMOJI } from "./constants";

import type { PookieConfig } from "./schema";

export const POOKIE_CONFIG_DEFAULTS: PookieConfig = {
  personality: "balanced",
  reactionEmoji: DEFAULT_REACTION_EMOJI,
  cards: true,
  tracesFooter: true,
  reasoningEffort: "medium",
};
