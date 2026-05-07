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
  cancelled: record.cancelled,
  channelId: record.channelId,
});

const cronCreateInputSchema = z.object({
  cron: z
    .string()
    .min(1)
    .describe(
      "Standard 5-field cron expression interpreted in the user's local timezone. " +
        "Fields: minute hour day-of-month month day-of-week. Examples: " +
        "`0 9 * * 1-5` = 9am on weekdays, " +
        "`*/15 * * * *` = every 15 minutes, " +
        "`0 14 1 * *` = 2pm on the 1st of every month. " +
        "Avoid the :00 and :30 minute marks for recurring jobs — nudge a few minutes off (e.g. :07 or :23) so dozens of teams don't all fire at the same instant.",
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
});

const cronCreateResultSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  cron: z.string(),
  recurring: z.boolean(),
  timezone: z.string(),
  firstFireAt: z.string(),
});

const cronCreateTool = (context: SchedulingContext) =>
  defineTool({
    description: withAvailabilityNote(
      "Schedule a prompt to run on a cron schedule. " +
        "When fired, Pookie posts a self-prompt in the originating thread and runs it as if the original requester just asked, so any tool — search, web, MCP — is available. " +
        "Use for reminders, recurring digests, automations, and any 'at X time / every X / on day Y' request. " +
        "Returns a job ID for use with cron_delete. " +
        "Recurring jobs respect a per-user cap (10 active) and per-team cap (50 active); " +
        "the smallest interval allowed for recurring is 10 minutes (one-shot can fire as soon as 1 minute out). " +
        "Cron expressions are interpreted in the scheduling user's Slack timezone, looked up automatically.",
    ),
    inputSchema: cronCreateInputSchema,
    resultSchema: cronCreateResultSchema,
    errorFallback: "failed to create cron job",
    execute: async ({ cron, prompt, recurring }) => {
      if (!context.channelId || !context.userId) {
        return toolErr(
          "validation",
          "scheduling requires the message to be in a Slack channel or DM with a known user",
        );
      }

      const userTimezone = await resolveUserTimezone(
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
        userTimezone,
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
      });
    },
    toModelOutput: (output) => {
      if (output.type === "error") return output.error.message;
      const { id, prompt, cron, recurring, timezone, firstFireAt } =
        output.result;
      const cadence = recurring ? "recurring" : "one-shot";
      return `${cadence} cron created (${id}) — \`${cron}\` (${timezone}); first fire at ${firstFireAt}: ${prompt}`;
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
      cancelled: z.boolean(),
      channelId: z.string(),
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
        return `- ${job.id} → \`${job.cron}\` (${job.timezone}, ${cadence}) next ${job.nextRunAt}${cancelledTag}: ${job.prompt}`;
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
