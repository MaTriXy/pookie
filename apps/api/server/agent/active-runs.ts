import { logger } from "../utils/logger";

const activeRuns = new Map<string, AbortController>();

const runKey = (channelId: string, messageTs: string): string =>
  `${channelId}:${messageTs}`;

export const registerActiveRun = (
  channelId: string,
  messageTs: string,
): AbortController => {
  const key = runKey(channelId, messageTs);
  const existing = activeRuns.get(key);
  if (existing) {
    existing.abort();
  }

  const controller = new AbortController();
  activeRuns.set(key, controller);
  return controller;
};

export const abortActiveRun = (
  channelId: string,
  messageTs: string,
): boolean => {
  const key = runKey(channelId, messageTs);
  const controller = activeRuns.get(key);
  if (!controller) return false;

  logger.info("[active-runs] aborting run for deleted message", {
    channelId,
    messageTs,
  });
  controller.abort();
  activeRuns.delete(key);
  return true;
};

export const cleanupActiveRun = (
  channelId: string,
  messageTs: string,
): void => {
  activeRuns.delete(runKey(channelId, messageTs));
};
