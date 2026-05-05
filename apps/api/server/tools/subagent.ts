import { MCP_TOOL_NAME_SEPARATOR } from "../mcp/constants";

import type * as AI from "ai";

import type { McpPreset } from "../mcp/presets";

const SUBAGENT_INCLUDED_TOOL_NAMES_FROM_MAIN = new Set<string>([
  "slack_channel_history",
  "slack_read_thread",
  "slack_read_file",
  "slack_check_channel_access",
  "slack_list_channels",
  "web_search",
  "recall",
]);

interface BuildSubagentToolsetArgs {
  mainToolset: Record<string, AI.Tool>;
  slackSearch: AI.Tool;
  mcpTools?: Record<string, AI.Tool>;
  mcpSearchToolSources?: McpSearchToolSource[];
}

export interface McpSearchToolSource {
  preset: McpPreset;
  serverName: string;
}

const mcpPrefixedName = (serverName: string, toolName: string): string =>
  `mcp${MCP_TOOL_NAME_SEPARATOR}${serverName}${MCP_TOOL_NAME_SEPARATOR}${toolName}`;

export const buildSubagentToolset = ({
  mainToolset,
  slackSearch,
  mcpTools,
  mcpSearchToolSources,
}: BuildSubagentToolsetArgs): Record<string, AI.Tool> => {
  const subagentTools: Record<string, AI.Tool> = { slack_search: slackSearch };

  for (const [toolName, tool] of Object.entries(mainToolset)) {
    if (!SUBAGENT_INCLUDED_TOOL_NAMES_FROM_MAIN.has(toolName)) continue;
    subagentTools[toolName] = tool;
  }

  if (mcpTools && mcpSearchToolSources) {
    for (const { preset, serverName } of mcpSearchToolSources) {
      if (!preset.searchTools) continue;
      for (const toolName of preset.searchTools) {
        const prefixed = mcpPrefixedName(serverName, toolName);
        const tool = mcpTools[prefixed];
        if (tool) subagentTools[prefixed] = tool;
      }
    }
  }

  return subagentTools;
};
