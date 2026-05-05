import { z } from "zod";

export const personalityOptionSchema = z.enum([
  "cute",
  "balanced",
  "professional",
]);

export type PersonalityOption = z.infer<typeof personalityOptionSchema>;

export const reasoningEffortOptionSchema = z.enum([
  "minimal",
  "medium",
  "high",
]);

export type ReasoningEffortOption = z.infer<typeof reasoningEffortOptionSchema>;

const reactionEmojiSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(
    /^[a-z0-9_+-]+$/,
    "reaction emoji must be a slack emoji shortcode (letters, numbers, underscores, +, -)",
  );

export const pookieConfigSchema = z.object({
  personality: personalityOptionSchema,
  reactionEmoji: reactionEmojiSchema,
  cards: z.boolean(),
  tracesFooter: z.boolean(),
  reasoningEffort: reasoningEffortOptionSchema,
});

export type PookieConfig = z.infer<typeof pookieConfigSchema>;

export const pookieConfigPartialSchema = pookieConfigSchema.partial();

export type PookieConfigPartial = z.infer<typeof pookieConfigPartialSchema>;

export type PookieConfigKey = keyof PookieConfig;

export interface PookieConfigScopeGlobal {
  kind: "global";
  teamId: string;
}

export interface PookieConfigScopeChannel {
  kind: "channel";
  channelId: string;
  teamId: string;
}

export interface PookieConfigScopeUser {
  kind: "user";
  userId: string;
  teamId: string;
}

export type PookieConfigScope =
  | PookieConfigScopeGlobal
  | PookieConfigScopeChannel
  | PookieConfigScopeUser;

export type PookieConfigScopeKind = PookieConfigScope["kind"];
