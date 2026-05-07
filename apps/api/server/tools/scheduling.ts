import { z } from "zod";

import { defineTool } from "../agent/define-tool";
import { toolErr, toolResult } from "../agent/tool-result";
import {
  cancelScheduledTask,
  isQueuesAvailable,
  listScheduledTasksForUser,
  scheduleTask,
} from "../scheduling";
import { SCHEDULE_PROMPT_MAX_CHARS } from "../scheduling/constants";
import { validateTargetChannelMembership } from "../scheduling/membership";
import { resolveUserTimezone } from "../utils/resolve-user-timezone";

import type { ScheduledTaskRecord } from "../scheduling";

interface SchedulingContext {
  teamId: string;
  channelId?: string;
  userId?: string;
  threadId: string;
  isDM: boolean;
}

const SELF_HOST_NOTE =
  " On self-hosted Pookie deployments scheduling is unavailable; the tool returns a clear error explaining how to use external cron instead. Don't invent a workaround — relay the error verbatim.";

const QUEUES_UNAVAILABLE_TOOL_MESSAGE =
  "scheduled tasks aren't available on this deployment — Pookie's scheduler runs on Vercel Queues, which only works when Pookie is deployed on Vercel. On self-hosted setups (Docker, Railway, Render, Fly, VPS) use external cron (the host's cron service, GitHub Actions schedule, etc.) instead.";

const withAvailabilityNote = (description: string): string =>
  isQueuesAvailable() ? description : `${description}${SELF_HOST_NOTE}`;

const queuesUnavailableError = () =>
  toolErr("validation", QUEUES_UNAVAILABLE_TOOL_MESSAGE, {
    code: "queues_unavailable",
  });

const taskSummary = (record: ScheduledTaskRecord) => ({
  id: record.id,
  prompt: record.prompt,
  cron: record.cronExpression,
  recurring: record.recurring,
  timezone: record.userTimezone,
  nextRunAt: new Date(record.nextRunAt).toISOString(),
  // Surfaced so users can answer "did my Monday digest fire last week?".
  // undefined for tasks that haven't yet had a successful run.
  lastRunAt: record.lastRunAt
    ? new Date(record.lastRunAt).toISOString()
    : undefined,
  cancelled: record.cancelled,
  channelId: record.channelId,
  // When set, fires post a top-level message in this channel instead of
  // replying in the originating thread. Surfaced so the user can audit
  // routing and so cron_list answers "where do my automations post?".
  targetChannelId: record.targetChannelId,
});

const cronCreateInputSchema = z.object({
  cron: z
    .string()
    .min(1)
    .describe(
      "Cron expression interpreted in the scheduler's Slack timezone (looked up automatically). " +
        "Accepts both 5-field (`minute hour day-of-month month day-of-week`) and 6-field (`seconds minute hour day-of-month month day-of-week`) syntax — use 6-field when you need sub-minute fires. " +
        "Examples: `0 9 * * 1-5` = 9am on weekdays, " +
        "`*/15 * * * *` = every 15 minutes, " +
        "`*/10 * * * * *` = every 10 seconds, " +
        "`0 14 1 * *` = 2pm on the 1st of every month. " +
        "For recurring jobs that fire on the hour, prefer minute marks like :07 or :23 over :00 / :30 so many automations don't all wake at the same instant.",
    ),
  prompt: z
    .string()
    .min(1)
    .max(SCHEDULE_PROMPT_MAX_CHARS)
    .describe(
      "What Pookie should do when the task fires. Phrase it as the user's instruction (e.g. 'post the engineering digest', 'check Sentry for new error spikes and reply with a summary'). Do NOT include scheduling phrasing like 'every Monday at 9am' here — that goes in the cron field.",
    ),
  recurring: z
    .boolean()
    .optional()
    .default(true)
    .describe(
      "true = keep firing on the schedule until cancelled. false = fire once at the next matching time then auto-delete. For 'remind me at 5pm tomorrow' use false; for 'every Monday at 9am' use true.",
    ),
  channel: z
    .string()
    .optional()
    .describe(
      "Optional Slack channel ID (e.g. C0789ABCDEF) to fire the task into a channel OTHER than the one you scheduled it from. Use this for 'every Monday at 9am post the digest in #engineering' from a DM with Pookie. Each fire creates a fresh top-level message (and therefore a new thread) in that channel — not a reply to a previous fire. Both Pookie AND the scheduling user must be members of the channel; if either isn't, the schedule is rejected. Use slack_check_channel_access first to resolve `#engineering` to its ID and confirm Pookie is in it.",
    ),
});

const cronCreateResultSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  cron: z.string(),
  recurring: z.boolean(),
  timezone: z.string(),
  firstFireAt: z.string(),
  // When set, fires post a top-level message in this channel; when
  // undefined, fires post in the originating thread.
  targetChannelId: z.string().optional(),
  // True when we couldn't determine the user's Slack timezone and fell back
  // to UTC. The toModelOutput surfaces this so the agent can warn the user
  // instead of silently firing "9am" as 9am UTC.
  timezoneFallback: z.boolean(),
});

const cronCreateTool = (context: SchedulingContext) =>
  defineTool({
    description: withAvailabilityNote(
      "Schedule a prompt to run on a cron schedule. " +
        "When fired, Pookie posts a self-prompt in the originating thread and runs it as if the original requester just asked, so any tool — search, web, MCP — is available. " +
        "Use for reminders, recurring digests, automations, and any 'at X time / every X / on day Y' request. " +
        "Returns a job ID for use with cron_delete. " +
        "Cron expressions are interpreted in the scheduling user's Slack timezone, looked up automatically. Both 5-field and 6-field (with seconds) cron are accepted.",
    ),
    inputSchema: cronCreateInputSchema,
    resultSchema: cronCreateResultSchema,
    errorFallback: "failed to create cron job",
    execute: async ({ cron, prompt, recurring, channel }) => {
      if (!context.channelId || !context.userId) {
        return toolErr(
          "validation",
          "scheduling requires the message to be in a Slack channel or DM with a known user",
        );
      }

      // Validate target-channel membership BEFORE any record write or
      // queue publish. Hard posture (per design): both bot AND scheduler
      // must be members of the target channel. Closes the laundering
      // vector where a user could route the bot's voice into a channel
      // they themselves can't post into.
      if (channel) {
        const membership = await validateTargetChannelMembership(
          context.teamId,
          channel,
          context.userId,
        );
        if (!membership.ok) {
          return toolErr("validation", membership.message, {
            code: "target_channel_access",
          });
        }
      }

      const { tz, isFallback } = await resolveUserTimezone(
        context.teamId,
        context.userId,
      );

      const result = await scheduleTask({
        teamId: context.teamId,
        channelId: context.channelId,
        threadId: context.threadId,
        isDM: context.isDM,
        createdByUserId: context.userId,
        prompt,
        cronExpression: cron,
        recurring,
        userTimezone: tz,
        targetChannelId: channel,
      });

      if (!result.ok) {
        return toolErr("validation", result.message, { code: result.reason });
      }

      const { record } = result;
      return toolResult({
        id: record.id,
        prompt: record.prompt,
        cron: record.cronExpression,
        recurring: record.recurring,
        timezone: record.userTimezone,
        firstFireAt: new Date(record.nextRunAt).toISOString(),
        targetChannelId: record.targetChannelId,
        timezoneFallback: isFallback,
      });
    },
    toModelOutput: (output) => {
      if (output.type === "error") return output.error.message;
      const {
        id,
        prompt,
        cron,
        recurring,
        timezone,
        firstFireAt,
        targetChannelId,
        timezoneFallback,
      } = output.result;
      const cadence = recurring ? "recurring" : "one-shot";
      const target = targetChannelId
        ? ` posting into <#${targetChannelId}>`
        : "";
      const tzWarning = timezoneFallback
        ? ` ⚠️ couldn't determine your Slack timezone, scheduled in UTC — if "${cron}" was meant in your local time, set your timezone in Slack profile and reschedule.`
        : "";
      return `${cadence} cron created (${id}) — \`${cron}\` (${timezone})${target}; first fire at ${firstFireAt}: ${prompt}${tzWarning}`;
    },
  });

const cronListResultSchema = z.object({
  count: z.number(),
  jobs: z.array(
    z.object({
      id: z.string(),
      prompt: z.string(),
      cron: z.string(),
      recurring: z.boolean(),
      timezone: z.string(),
      nextRunAt: z.string(),
      lastRunAt: z.string().optional(),
      cancelled: z.boolean(),
      channelId: z.string(),
      targetChannelId: z.string().optional(),
    }),
  ),
});

const cronListTool = (context: SchedulingContext) =>
  defineTool({
    description: withAvailabilityNote(
      "List the current user's active cron jobs. " +
        "Returns IDs the user can reference when asking to cancel one. " +
        "Tasks scheduled by other workspace members are NOT included — privacy boundary.",
    ),
    inputSchema: z.object({}),
    resultSchema: cronListResultSchema,
    errorFallback: "failed to list cron jobs",
    execute: async () => {
      if (!isQueuesAvailable()) return queuesUnavailableError();
      if (!context.userId) {
        return toolErr(
          "validation",
          "listing cron jobs requires a known Slack user",
        );
      }
      const records = await listScheduledTasksForUser(
        context.teamId,
        context.userId,
      );
      return toolResult({
        count: records.length,
        jobs: records.map(taskSummary),
      });
    },
    toModelOutput: (output) => {
      if (output.type === "error") return output.error.message;
      if (output.result.count === 0) return "no active cron jobs";
      const lines = output.result.jobs.map((job) => {
        const cancelledTag = job.cancelled ? " [cancelled]" : "";
        const cadence = job.recurring ? "recurring" : "one-shot";
        const lastRun = job.lastRunAt ? ` last fired ${job.lastRunAt}` : "";
        const target = job.targetChannelId
          ? ` → posts in <#${job.targetChannelId}>`
          : "";
        return `- ${job.id} → \`${job.cron}\` (${job.timezone}, ${cadence})${target} next ${job.nextRunAt}${lastRun}${cancelledTag}: ${job.prompt}`;
      });
      return `${output.result.count} cron job(s):\n${lines.join("\n")}`;
    },
  });

const cronDeleteInputSchema = z.object({
  id: z
    .string()
    .min(1)
    .describe(
      "ID of the cron job to cancel. Get it from cron_list or from the cron_create response.",
    ),
});

const cronDeleteResultSchema = z.object({
  id: z.string(),
  cancelled: z.boolean(),
  prompt: z.string().optional(),
});

const cronDeleteTool = (context: SchedulingContext) =>
  defineTool({
    description: withAvailabilityNote(
      "Cancel a cron job by ID. Idempotent — calling twice returns cancelled: true both times. The next time the queue would have fired this job, it's silently dropped. Only the user who created the job can cancel it; attempting to cancel another user's job returns wrong_user.",
    ),
    inputSchema: cronDeleteInputSchema,
    resultSchema: cronDeleteResultSchema,
    errorFallback: "failed to cancel cron job",
    execute: async ({ id }) => {
      if (!isQueuesAvailable()) return queuesUnavailableError();
      if (!context.userId) {
        return toolErr(
          "validation",
          "cancelling a cron job requires a known Slack user",
        );
      }
      const result = await cancelScheduledTask(
        id,
        context.teamId,
        context.userId,
      );
      if (!result.ok) {
        const message =
          result.reason === "wrong_team"
            ? "that job ID belongs to a different workspace"
            : result.reason === "wrong_user"
              ? "that job was created by another user — only the original creator can cancel it"
              : `no cron job found with id ${id}`;
        return toolErr("validation", message, { code: result.reason });
      }
      return toolResult({
        id: result.record.id,
        cancelled: true,
        prompt: result.record.prompt,
      });
    },
    toModelOutput: (output) =>
      output.type === "error"
        ? output.error.message
        : `cancelled cron job ${output.result.id}`,
  });

export const schedulingTools = (context: SchedulingContext) => ({
  cron_create: cronCreateTool(context),
  cron_list: cronListTool(context),
  cron_delete: cronDeleteTool(context),
});
