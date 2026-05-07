import { CronExpressionParser } from "cron-parser";

import { SCHEDULE_MIN_RECURRING_INTERVAL_SECONDS } from "./constants";

export interface CronValidationOk {
  ok: true;
  firstFireMs: number;
  // The shortest gap between any two consecutive fires within the next
  // year, used to enforce SCHEDULE_MIN_RECURRING_INTERVAL_SECONDS for
  // recurring tasks. We sample fires forward (vs. parsing the field
  // structure) because cron expressions like `*/2 9-17 * * 1-5` produce
  // gaps that depend on hour-range / day-range interactions.
  minGapMs?: number;
}

export interface CronValidationErr {
  ok: false;
  message: string;
}

export type CronValidationResult = CronValidationOk | CronValidationErr;

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const MIN_GAP_SAMPLES = 32;

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
  recurring: boolean,
  nowMs: number,
): CronValidationResult => {
  let firstFireMs: number;
  try {
    firstFireMs = nextFireMs(cronExpression, timezone, nowMs);
  } catch (parseError) {
    return {
      ok: false,
      message: `invalid cron expression: ${summarizeParseError(parseError)}`,
    };
  }

  if (!recurring) {
    return { ok: true, firstFireMs };
  }

  // Sample forward to find the tightest fire-to-fire gap within a year.
  // If any gap is below the min recurring interval, reject the schedule.
  let cursor = firstFireMs;
  let minGapMs = Number.POSITIVE_INFINITY;
  let parsed;
  try {
    parsed = CronExpressionParser.parse(cronExpression, {
      currentDate: new Date(cursor),
      tz: timezone,
    });
  } catch (parseError) {
    return {
      ok: false,
      message: `invalid cron expression: ${summarizeParseError(parseError)}`,
    };
  }
  for (let sampleIndex = 0; sampleIndex < MIN_GAP_SAMPLES; sampleIndex++) {
    let nextMs: number;
    try {
      nextMs = parsed.next().getTime();
    } catch {
      // Schedule eventually exhausted (e.g., a date pattern that has no
      // future occurrence past this point). Treat as fine — the gap up
      // to here was sufficient.
      break;
    }
    if (nextMs - cursor > ONE_YEAR_MS) break;
    minGapMs = Math.min(minGapMs, nextMs - cursor);
    cursor = nextMs;
  }

  const minRecurringMs = SCHEDULE_MIN_RECURRING_INTERVAL_SECONDS * 1000;
  if (minGapMs < minRecurringMs) {
    return {
      ok: false,
      message: `recurring cron schedules must have at least ${SCHEDULE_MIN_RECURRING_INTERVAL_SECONDS}s between any two fires; this expression has fires only ${Math.round(
        minGapMs / 1000,
      )}s apart`,
    };
  }

  return { ok: true, firstFireMs, minGapMs };
};
