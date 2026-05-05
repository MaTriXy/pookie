import { redis } from "../../mcp/redis";

const ONBOARDING_KEY_PREFIX = "pookie:onboarding:user";

export const ONBOARDING_WINDOW_MS = 24 * 60 * 60 * 1000;

// Floor of 1s so we never accidentally pass `ex: 0` (which Upstash treats
// as a no-op TTL on some clients) when a write lands at the very edge of
// the window.
const MIN_TTL_SECONDS = 1;

export interface OnboardingState {
  startedAt: number;
  teamId: string;
  channelId: string;
  connectedPresets: string[];
}

const onboardingKey = (userId: string): string =>
  `${ONBOARDING_KEY_PREFIX}:${userId}`;

export const loadOnboardingState = async (
  userId: string,
): Promise<OnboardingState | undefined> => {
  try {
    const data = await redis.get(onboardingKey(userId));
    if (!data) return undefined;
    return JSON.parse(data) as OnboardingState;
  } catch (error) {
    console.warn("[onboarding] failed to load state", error);
    return undefined;
  }
};

export const saveOnboardingState = async (
  userId: string,
  state: OnboardingState,
): Promise<void> => {
  // Anchor the TTL to `startedAt` (not to "now") so per-connection
  // updates inside the window don't keep extending the key's lifetime.
  // Without this, every OAuth callback inside the window resets the TTL
  // to a fresh 24h, which keeps `autoStartOnboardingIfFirstInvite`
  // suppressed indefinitely after the *original* window has elapsed.
  const expiresAtMs = state.startedAt + ONBOARDING_WINDOW_MS;
  const remainingSeconds = Math.max(
    MIN_TTL_SECONDS,
    Math.floor((expiresAtMs - Date.now()) / 1000),
  );
  try {
    await redis.set(
      onboardingKey(userId),
      JSON.stringify(state),
      "EX",
      remainingSeconds,
    );
  } catch (error) {
    console.warn("[onboarding] failed to save state", error);
  }
};

export const isWithinOnboardingWindow = (
  state: OnboardingState,
  now: number,
): boolean => now - state.startedAt < ONBOARDING_WINDOW_MS;
