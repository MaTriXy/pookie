import { MCP_TOOL_NAME_SEPARATOR } from "../mcp/constants";

import type * as AI from "ai";

// SLOPPY: LLMs hallucinate pagination cursor params and fill every optional
// field with empty strings / empty arrays when calling Mercury MCP tools.
// The system prompt tells the model not to, but it doesn't listen — GPT-5.5
// tried 18 cursor variations in one trace and sends "" for every optional
// date/search/category param, causing Mercury to 400.
//
// Evidence:
//   trace 1335f28ec048c8d0bc1f70def8cc7b09 — first cursor occurrence
//   trace d9bce1384ac67f8451e73185f80ce3c6 — 18 retries after prompt fix
//   trace 49c50b0060c693ad508da2f3402650e0 — empty strings causing 400s

const MERCURY_SERVER_PREFIX = `mcp${MCP_TOOL_NAME_SEPARATOR}mercury${MCP_TOOL_NAME_SEPARATOR}`;

// Mutually exclusive cursor pairs. Mercury rejects requests that include both
// sides simultaneously — and the model always sets both.
const CURSOR_PAIR_GROUPS: ReadonlyArray<ReadonlyArray<string>> = [
  ["start_after", "end_before"],
  ["starting_after", "ending_before"],
  ["after", "before"],
];

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isUuidShaped = (value: unknown): boolean =>
  typeof value === "string" && UUID_PATTERN.test(value);

const isEmptyValue = (value: unknown): boolean => {
  if (value === "") return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
};

const sanitizeArgs = (
  args: Record<string, unknown>,
): Record<string, unknown> => {
  const keysToStrip = new Set<string>();

  for (const pair of CURSOR_PAIR_GROUPS) {
    const bothPresent = pair.every(
      (key) => key in args && isUuidShaped(args[key]),
    );
    if (bothPresent) {
      for (const key of pair) keysToStrip.add(key);
    }
  }

  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (keysToStrip.has(key)) continue;
    if (isEmptyValue(value)) continue;
    cleaned[key] = value;
  }
  return cleaned;
};

export const sanitizeMcpToolArgs = (
  mcpTools: Record<string, AI.Tool>,
): Record<string, AI.Tool> => {
  const wrapped: Record<string, AI.Tool> = {};

  for (const [toolName, mcpTool] of Object.entries(mcpTools)) {
    if (!toolName.startsWith(MERCURY_SERVER_PREFIX)) {
      wrapped[toolName] = mcpTool;
      continue;
    }

    const originalExecute = mcpTool.execute;
    if (!originalExecute) {
      wrapped[toolName] = mcpTool;
      continue;
    }

    wrapped[toolName] = {
      ...mcpTool,
      execute: (
        rawArgs: Parameters<typeof originalExecute>[0],
        options: Parameters<typeof originalExecute>[1],
      ) =>
        originalExecute(
          sanitizeArgs(rawArgs as Record<string, unknown>),
          options,
        ),
    };
  }

  return wrapped;
};
