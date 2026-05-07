import { CronExpressionParser } from "cron-parser";

export interface CronValidationOk {
  ok: true;
  firstFireMs: number;
}

export interface CronValidationErr {
  ok: false;
  message: string;
}

export type CronValidationResult = CronValidationOk | CronValidationErr;

const summarizeParseError = (parseError: unknown): string => {
  const raw =
    parseError instanceof Error ? parseError.message : String(parseError);
  // cron-parser's errors are usually short and useful as-is, but cap to
  // avoid leaking long stack-shaped strings into the agent's error path.
  return raw.length > 200 ? `${raw.slice(0, 200)}…` : raw;
};

// Compute the next fire timestamp strictly after `afterMs`, in the user's
// timezone. Returns ms-epoch UTC. Throws if the cron expression has no
// next fire (e.g., `* * 30 2 *` — Feb 30 doesn't exist; cron-parser
// throws after exhausting its lookahead window).
//
// Accepts both 5-field (minute hour dom month dow) and 6-field (seconds
// minute hour dom month dow) cron — cron-parser detects automatically.
export const nextFireMs = (
  cronExpression: string,
  timezone: string,
  afterMs: number,
): number => {
  const parsed = CronExpressionParser.parse(cronExpression, {
    currentDate: new Date(afterMs),
    tz: timezone,
  });
  return parsed.next().getTime();
};

export const validateCronExpression = (
  cronExpression: string,
  timezone: string,
  nowMs: number,
): CronValidationResult => {
  try {
    const firstFireMs = nextFireMs(cronExpression, timezone, nowMs);
    return { ok: true, firstFireMs };
  } catch (parseError) {
    return {
      ok: false,
      message: `invalid cron expression: ${summarizeParseError(parseError)}`,
    };
  }
};
