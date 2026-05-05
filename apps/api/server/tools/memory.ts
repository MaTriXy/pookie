import { z } from "zod";

import { defineTool } from "../agent/define-tool";
import { toolErr, toolResult } from "../agent/tool-result";
import { decryptJson, encryptJson } from "../utils/secure-store";
import {
  DUPLICATE_LOOKBACK_COUNT,
  INJECT_GLOBAL_MAX_CHARS,
  INJECT_GLOBAL_RECENT_COUNT,
  INJECT_MAX_CHARS,
  INJECT_RECENT_COUNT,
  MAX_NOTES_GLOBAL,
  MAX_NOTES_PER_CHANNEL,
  MAX_NOTES_PER_USER,
  RECALL_DEFAULT_LIMIT,
  RECALL_MAX_LIMIT,
  memoryKeyChannel,
  memoryKeyGlobal,
  memoryKeyUser,
} from "./constants";

import type { StateAdapter } from "chat";

import type { PookieToolError } from "../agent/tool-result";

interface MemoryEntry {
  note: string;
  timestamp: string;
  createdBy?: string;
}

type MemoryScope = "personal" | "channel" | "global";

interface ScopeResolution {
  key: string;
  scope: MemoryScope;
  maxNotes: number;
}

interface ScopeInput {
  teamId: string;
  userId?: string;
  channelId?: string;
  global?: boolean;
}

const resolveScope = (input: ScopeInput): ScopeResolution | PookieToolError => {
  if (input.channelId) {
    return {
      key: memoryKeyChannel(input.teamId, input.channelId),
      scope: "channel",
      maxNotes: MAX_NOTES_PER_CHANNEL,
    };
  }
  if (input.global) {
    return {
      key: memoryKeyGlobal(input.teamId),
      scope: "global",
      maxNotes: MAX_NOTES_GLOBAL,
    };
  }
  if (input.userId) {
    return {
      key: memoryKeyUser(input.teamId, input.userId),
      scope: "personal",
      maxNotes: MAX_NOTES_PER_USER,
    };
  }
  return toolErr(
    "validation",
    "userId or channelId is required (or set global: true)",
  );
};

const encryptEntry = (entry: MemoryEntry): unknown => encryptJson(entry);

const decryptEntries = (items: unknown[]): MemoryEntry[] =>
  items.map((item) => decryptJson<MemoryEntry>(item));

const getRecentEntries = async (
  state: StateAdapter,
  key: string,
  count: number,
): Promise<MemoryEntry[]> => {
  const all = decryptEntries(await state.getList<unknown>(key));
  return all.slice(-count).reverse();
};

const trimToBudget = (entries: MemoryEntry[], maxChars: number): string[] => {
  const notes: string[] = [];
  let totalChars = 0;
  for (const entry of entries) {
    if (totalChars + entry.note.length > maxChars) break;
    notes.push(entry.note);
    totalChars += entry.note.length;
  }
  return notes;
};

const formatBlock = (header: string, notes: string[]): string => {
  if (notes.length === 0) return "";
  return `\n\n${header}\n${notes.map((noteText) => `- ${noteText}`).join("\n")}`;
};

const isDuplicate = async (
  state: StateAdapter,
  key: string,
  note: string,
): Promise<boolean> => {
  const recent = await getRecentEntries(state, key, DUPLICATE_LOOKBACK_COUNT);
  const normalized = note.toLowerCase().trim();
  return recent.some((entry) => entry.note.toLowerCase().trim() === normalized);
};

export const loadPersonalMemories = async (
  state: StateAdapter,
  teamId: string,
  userId: string | undefined,
): Promise<string> => {
  if (!userId || userId === "unknown") return "";
  try {
    const entries = await getRecentEntries(
      state,
      memoryKeyUser(teamId, userId),
      INJECT_RECENT_COUNT,
    );
    const notes = trimToBudget(entries, INJECT_MAX_CHARS);
    return formatBlock("what you remember about this person:", notes);
  } catch (error) {
    console.warn("[loadMemories] error", error);
    return "";
  }
};

export const loadChannelMemories = async (
  state: StateAdapter,
  teamId: string,
  channelId: string | undefined,
): Promise<string> => {
  if (!channelId || channelId === "unknown") return "";
  try {
    const entries = await getRecentEntries(
      state,
      memoryKeyChannel(teamId, channelId),
      INJECT_RECENT_COUNT,
    );
    const notes = trimToBudget(entries, INJECT_MAX_CHARS);
    return formatBlock(
      "channel context (things remembered about this channel — repos, projects, ownership):",
      notes,
    );
  } catch (error) {
    console.warn("[loadChannelMemories] error", error);
    return "";
  }
};

export const loadGlobalMemories = async (
  state: StateAdapter,
  teamId: string,
): Promise<string> => {
  try {
    const entries = await getRecentEntries(
      state,
      memoryKeyGlobal(teamId),
      INJECT_GLOBAL_RECENT_COUNT,
    );
    const notes = trimToBudget(entries, INJECT_GLOBAL_MAX_CHARS);
    return formatBlock(
      "global context (things you remember about the team, project, or general facts):",
      notes,
    );
  } catch (error) {
    console.warn("[loadGlobalMemories] error", error);
    return "";
  }
};

const rememberInputSchema = z.object({
  note: z
    .string()
    .describe(
      "What to remember — a preference, fact, name, project context, or any useful info. " +
        "Include the *why* so future-you knows when the rule applies: " +
        "'prefers TypeScript over Python for code snippets — corrected me' beats 'uses TypeScript'.",
    ),
  userId: z
    .string()
    .optional()
    .describe(
      "Slack user ID of the person this note is about. Use current_user_id from runtime context for the current speaker when global is false and no channelId.",
    ),
  global: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      "If true, saves as a global memory visible across all conversations",
    ),
  channelId: z
    .string()
    .optional()
    .describe(
      "Slack channel ID for channel-scoped memories. Use current_channel_id from runtime context for facts or norms about the current channel.",
    ),
});

const rememberResultSchema = z.object({
  scope: z.enum(["personal", "channel", "global"]),
  note: z.string(),
  duplicate: z.boolean().default(false),
  userId: z.string().optional(),
  channelId: z.string().optional(),
});

export const remember = (state: StateAdapter, teamId: string) =>
  defineTool({
    description:
      "Save a note to Pookie's long-term memory. " +
      "**Whenever the user has to correct you, almost always call remember.** " +
      "If they said 'no', 'actually', 'not X, Y', or swapped out what you produced — save the rule. " +
      "The only reason to skip is if the correction is obviously one-off and has no carryover to future turns (e.g. a typo fix in a single message). " +
      "Call this liberally whenever you notice a delta between the user's intent and how you (or your agents) interpreted it. " +
      "Set global: true for team-wide facts, project context, or company info that applies to everyone. " +
      "Set global: false (default) with current_user_id for personal info about the current speaker. " +
      "Provide current_channel_id for channel-scoped repo, project, ownership, or norm memories.",
    inputSchema: rememberInputSchema,
    resultSchema: rememberResultSchema,
    errorFallback: "failed to save memory",
    execute: async ({ note, userId, global: isGlobal, channelId }) => {
      const resolution = resolveScope({
        teamId,
        userId,
        channelId,
        global: isGlobal,
      });
      if ("type" in resolution) return resolution;

      if (await isDuplicate(state, resolution.key, note)) {
        return toolResult({
          scope: resolution.scope,
          note,
          duplicate: true,
          userId,
          channelId,
        });
      }

      const entry: MemoryEntry = {
        note,
        timestamp: new Date().toISOString(),
        ...(userId ? { createdBy: userId } : {}),
      };
      await state.appendToList(resolution.key, encryptEntry(entry), {
        maxLength: resolution.maxNotes,
      });

      return toolResult({
        scope: resolution.scope,
        note,
        duplicate: false,
        userId,
        channelId,
      });
    },
    toModelOutput: (output) => {
      if (output.type === "error") return output.error.message;
      const { scope, duplicate, note } = output.result;
      if (duplicate) return `(${scope}) already remembered: ${note}`;
      return `(${scope}) saved: ${note}`;
    },
  });

const recallInputSchema = z.object({
  userId: z
    .string()
    .optional()
    .describe(
      "Slack user ID to recall personal memories about. Use current_user_id from runtime context for the current speaker when global is false and no channelId.",
    ),
  global: z
    .boolean()
    .optional()
    .default(false)
    .describe("If true, returns global memories instead of personal ones"),
  channelId: z
    .string()
    .optional()
    .describe(
      "Slack channel ID for channel-scoped recall. Use current_channel_id from runtime context for the current channel.",
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(RECALL_MAX_LIMIT)
    .optional()
    .default(RECALL_DEFAULT_LIMIT)
    .describe(
      `Max number of memories to return (default ${RECALL_DEFAULT_LIMIT})`,
    ),
});

const recallResultSchema = z.object({
  scope: z.enum(["personal", "channel", "global"]),
  noteCount: z.number(),
  notes: z.array(
    z.object({
      note: z.string(),
      timestamp: z.string(),
      createdBy: z.string().optional(),
    }),
  ),
  userId: z.string().optional(),
  channelId: z.string().optional(),
});

const EMPTY_SCOPE_MESSAGE: Record<MemoryScope, string> = {
  global: "no global memories found",
  personal: "no memories found for this user",
  channel: "no memories found for this channel",
};

export const recall = (state: StateAdapter, teamId: string) =>
  defineTool({
    description:
      "Recall what Pookie remembers. " +
      "Set global: true to get team-wide facts and project context. " +
      "Set global: false (default) with current_user_id to get personal memories about the current speaker. " +
      "Provide current_channel_id to get channel-scoped memories. " +
      "Returns the most recent entries (default 20).",
    inputSchema: recallInputSchema,
    resultSchema: recallResultSchema,
    errorFallback: "failed to recall memories",
    execute: async ({ userId, global: isGlobal, channelId, limit }) => {
      const resolution = resolveScope({
        teamId,
        userId,
        channelId,
        global: isGlobal,
      });
      if ("type" in resolution) return resolution;

      const notes = await getRecentEntries(state, resolution.key, limit);
      return toolResult({
        scope: resolution.scope,
        noteCount: notes.length,
        notes,
        userId,
        channelId,
      });
    },
    toModelOutput: (output) => {
      if (output.type === "error") return output.error.message;
      const { scope, noteCount, notes } = output.result;
      if (noteCount === 0) return EMPTY_SCOPE_MESSAGE[scope];
      const lines = notes.map((entry) => `- ${entry.note}`).join("\n");
      return `${scope} memories (${noteCount}):\n${lines}`;
    },
  });

const forgetInputSchema = z.object({
  searchText: z
    .string()
    .describe("Text to search for in memories (removes first match)"),
  userId: z
    .string()
    .optional()
    .describe(
      "Slack user ID to search personal memories. Use current_user_id from runtime context when global is false and no channelId.",
    ),
  global: z
    .boolean()
    .optional()
    .default(false)
    .describe("If true, searches global memories instead of personal ones"),
  channelId: z
    .string()
    .optional()
    .describe(
      "Slack channel ID for channel-scoped forget. Use current_channel_id from runtime context for the current channel.",
    ),
});

const forgetResultSchema = z.object({
  removed: z.boolean(),
  searchText: z.string(),
  message: z.string(),
});

export const forget = (state: StateAdapter, teamId: string) =>
  defineTool({
    description:
      "Remove a memory by searching for matching text. " +
      "Set global: true to search global memories. Set global: false with a userId to search personal memories. " +
      "Use current_user_id for current-speaker personal memories and current_channel_id for current-channel memories. " +
      "Removes the first match containing the search text.",
    inputSchema: forgetInputSchema,
    resultSchema: forgetResultSchema,
    errorFallback: "failed to delete memory",
    execute: async ({ searchText, userId, global: isGlobal, channelId }) => {
      const resolution = resolveScope({
        teamId,
        userId,
        channelId,
        global: isGlobal,
      });
      if ("type" in resolution) return resolution;

      const all = decryptEntries(await state.getList<unknown>(resolution.key));
      if (all.length === 0) {
        return toolResult({
          removed: false,
          searchText,
          message: "no memories to search",
        });
      }

      const needle = searchText.toLowerCase();
      const targetIndex = all.findIndex((entry) =>
        entry.note.toLowerCase().includes(needle),
      );
      if (targetIndex === -1) {
        return toolResult({
          removed: false,
          searchText,
          message: `no memory found containing "${searchText}"`,
        });
      }

      const survivors = all.filter(
        (_entry, listIndex) => listIndex !== targetIndex,
      );
      await state.delete(resolution.key);
      for (const entry of survivors) {
        await state.appendToList(resolution.key, encryptEntry(entry), {
          maxLength: resolution.maxNotes,
        });
      }

      return toolResult({
        removed: true,
        searchText,
        message: "memory removed",
      });
    },
    toModelOutput: (output) => {
      if (output.type === "error") return output.error.message;
      return output.result.message;
    },
  });
