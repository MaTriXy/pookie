import { AsyncLocalStorage } from "node:async_hooks";

import { cyan, gray, red, yellow } from "kleur/colors";

const PREFIX = "agent";
const SEPARATOR = "·";

type Colorize = (text: string) => string;

const formatPrefix = (colorize: Colorize): string =>
  `${colorize(PREFIX)} ${SEPARATOR}`;

interface Logger {
  log: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
}

const loggingEnabledStorage = new AsyncLocalStorage<boolean>();

const isLoggingEnabled = (): boolean =>
  loggingEnabledStorage.getStore() ?? true;

export const runWithLogging = <T>(enabled: boolean, fn: () => T): T =>
  loggingEnabledStorage.run(enabled, fn);

export const logger: Logger = {
  log: (...args) => {
    if (!isLoggingEnabled()) return;
    console.log(formatPrefix(gray), ...args);
  },
  info: (...args) => {
    if (!isLoggingEnabled()) return;
    console.log(formatPrefix(cyan), ...args);
  },
  // Warnings and errors always surface, even on non-tracing workspaces —
  // operators need to see exceptional state to debug self-hosted setups.
  // The tracing gate is for chatty info/log lines and AI SDK telemetry,
  // not for swallowing failures.
  warn: (...args) => {
    console.warn(formatPrefix(yellow), ...args);
  },
  error: (...args) => {
    console.error(formatPrefix(red), ...args);
  },
  debug: (...args) => {
    if (!isLoggingEnabled() || !process.env.DEBUG) return;
    console.debug(formatPrefix(gray), ...args);
  },
};
