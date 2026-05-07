import prettyMilliseconds from "pretty-ms";
import { z } from "zod";

import { defineTool } from "../agent/define-tool";
import { toolErr, toolResult } from "../agent/tool-result";
import {
  cancelScheduledTask,
  isQueuesAvailable,
  listScheduledTasksForUser,
  scheduleTask,
} from "../scheduling";
import {
  SCHEDULE_MAX_DELAY_SECONDS,
  SCHEDULE_MIN_DELAY_SECONDS,
  SCHEDULE_MIN_RECURRING_INTERVAL_SECONDS,
  SCHEDULE_PROMPT_MAX_CHARS,
} from "../scheduling/constants";

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

const formatCadence = (intervalSeconds: number | undefined): string =>
  intervalSeconds !== undefined
    ? ` (every ${prettyMilliseconds(intervalSeconds * 1000)})`
    : "";

const taskSummary = (record: ScheduledTaskRecord) => ({
  taskId: record.id,
  prompt: record.prompt,
  nextRunAt: new Date(record.nextRunAt).toISOString(),
  intervalSeconds: record.intervalSeconds,
  cancelled: record.cancelled,
  channelId: record.channelId,
});

const scheduleInputSchema = z.object({
  prompt: z
    .string()
    .min(1)
    .max(SCHEDULE_PROMPT_MAX_CHARS)
    .describe(
      "What Pookie should do when the task fires. Phrase it as the user's instruction (e.g. 'remind the team to ship the weekly digest', 'check Sentry for new error spikes and post a summary'). Do NOT include scheduling phrasing like 'every Monday at 9am' here — that goes in delaySeconds/intervalSeconds.",
    ),
  delaySeconds: z
    .number()
    .int()
    .min(SCHEDULE_MIN_DELAY_SECONDS)
    .max(SCHEDULE_MAX_DELAY_SECONDS)
    .describe(
      `Seconds from now until the FIRST run. Min ${SCHEDULE_MIN_DELAY_SECONDS} (1 minute), max ${SCHEDULE_MAX_DELAY_SECONDS} (7 days). For 'tomorrow at 9am' compute the seconds from now in the team's timezone — assume UTC if unknown and tell the user.`,
    ),
  intervalSeconds: z
    .number()
    .int()
    .min(SCHEDULE_MIN_RECURRING_INTERVAL_SECONDS)
    .optional()
    .describe(
      `Set ONLY for recurring tasks. Seconds between runs. Common values: 3600 (hourly), 86400 (daily), 604800 (weekly). Omit for one-shot reminders. Min ${SCHEDULE_MIN_RECURRING_INTERVAL_SECONDS} (10 minutes).`,
    ),
});

const scheduleResultSchema = z.object({
  taskId: z.string(),
  prompt: z.string(),
  scheduledFor: z.string(),
  intervalSeconds: z.number().optional(),
});

const scheduleTaskTool = (context: SchedulingContext) =>
  defineTool({
    description: withAvailabilityNote(
      "Schedule a task for Pookie to run later in this thread. Use for reminders, recurring check-ins, or any 'at X o'clock / every X / in Y minutes' request. When fired, Pookie posts a self-prompt in the thread and runs it as if the original requester just asked, so any tool — search, web, MCP — is available.",
    ),
    inputSchema: scheduleInputSchema,
    resultSchema: scheduleResultSchema,
    errorFallback: "failed to schedule task",
    execute: async ({ prompt, delaySeconds, intervalSeconds }) => {
      if (!context.channelId || !context.userId) {
        return toolErr(
          "validation",
          "scheduling requires the message to be in a Slack channel or DM with a known user",
        );
      }

      const result = await scheduleTask({
        teamId: context.teamId,
        channelId: context.channelId,
        threadId: context.threadId,
        isDM: context.isDM,
        createdByUserId: context.userId,
        prompt,
        delaySeconds,
        intervalSeconds,
      });

      if (!result.ok) {
        return toolErr("validation", result.message, { code: result.reason });
      }

      const { record } = result;
      return toolResult({
        taskId: record.id,
        prompt: record.prompt,
        scheduledFor: new Date(record.nextRunAt).toISOString(),
        intervalSeconds,
      });
    },
    toModelOutput: (output) => {
      if (output.type === "error") return output.error.message;
      const { taskId, prompt, scheduledFor, intervalSeconds } = output.result;
      return `scheduled (${taskId}) for ${scheduledFor}${formatCadence(intervalSeconds)}: ${prompt}`;
    },
  });

const listScheduledResultSchema = z.object({
  count: z.number(),
  tasks: z.array(
    z.object({
      taskId: z.string(),
      prompt: z.string(),
      nextRunAt: z.string(),
      intervalSeconds: z.number().optional(),
      cancelled: z.boolean(),
      channelId: z.string(),
    }),
  ),
});

const listScheduledTasksTool = (context: SchedulingContext) =>
  defineTool({
    description: withAvailabilityNote(
      "List the current user's scheduled tasks. Includes one-shot reminders and recurring tasks they created via schedule_task. Returns task IDs the user can reference when asking to cancel one. Tasks scheduled by other workspace members are NOT included — privacy boundary.",
    ),
    inputSchema: z.object({}),
    resultSchema: listScheduledResultSchema,
    errorFallback: "failed to list scheduled tasks",
    execute: async () => {
      if (!isQueuesAvailable()) return queuesUnavailableError();
      if (!context.userId) {
        return toolErr(
          "validation",
          "listing scheduled tasks requires a known Slack user",
        );
      }
      const records = await listScheduledTasksForUser(
        context.teamId,
        context.userId,
      );
      return toolResult({
        count: records.length,
        tasks: records.map(taskSummary),
      });
    },
    toModelOutput: (output) => {
      if (output.type === "error") return output.error.message;
      if (output.result.count === 0) return "no scheduled tasks";
      const lines = output.result.tasks.map(
        (task) =>
          `- ${task.taskId} → ${task.nextRunAt}${formatCadence(task.intervalSeconds)}${task.cancelled ? " [cancelled]" : ""}: ${task.prompt}`,
      );
      return `${output.result.count} scheduled task(s):\n${lines.join("\n")}`;
    },
  });

const cancelInputSchema = z.object({
  taskId: z
    .string()
    .min(1)
    .describe(
      "ID of the task to cancel. Get it from list_scheduled_tasks or from the schedule_task response.",
    ),
});

const cancelResultSchema = z.object({
  taskId: z.string(),
  cancelled: z.boolean(),
  prompt: z.string().optional(),
});

const cancelScheduledTaskTool = (context: SchedulingContext) =>
  defineTool({
    description: withAvailabilityNote(
      "Cancel a previously scheduled task by ID. Idempotent — calling twice returns cancelled: true both times. The next time the queue would have fired this task, it's silently dropped. Only the user who scheduled the task can cancel it; attempting to cancel another user's task returns wrong_user.",
    ),
    inputSchema: cancelInputSchema,
    resultSchema: cancelResultSchema,
    errorFallback: "failed to cancel scheduled task",
    execute: async ({ taskId }) => {
      if (!isQueuesAvailable()) return queuesUnavailableError();
      if (!context.userId) {
        return toolErr(
          "validation",
          "cancelling a scheduled task requires a known Slack user",
        );
      }
      const result = await cancelScheduledTask(
        taskId,
        context.teamId,
        context.userId,
      );
      if (!result.ok) {
        const message =
          result.reason === "wrong_team"
            ? "that task ID belongs to a different workspace"
            : result.reason === "wrong_user"
              ? "that task was scheduled by another user — only the original scheduler can cancel it"
              : `no scheduled task found with id ${taskId}`;
        return toolErr("validation", message, { code: result.reason });
      }
      return toolResult({
        taskId: result.record.id,
        cancelled: true,
        prompt: result.record.prompt,
      });
    },
    toModelOutput: (output) =>
      output.type === "error"
        ? output.error.message
        : `cancelled scheduled task ${output.result.taskId}`,
  });

export const schedulingTools = (context: SchedulingContext) => ({
  schedule_task: scheduleTaskTool(context),
  list_scheduled_tasks: listScheduledTasksTool(context),
  cancel_scheduled_task: cancelScheduledTaskTool(context),
});
