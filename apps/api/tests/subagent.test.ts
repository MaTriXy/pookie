import * as AI from "ai";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { MCP_PRESETS } from "../server/mcp/presets";
import { SEARCH_SUBAGENT_SEQUENTIAL_SYSTEM_PROMPT } from "../server/tools/search";
import { buildSubagentToolset } from "../server/tools/subagent";

const createTestTool = (): AI.Tool =>
  AI.tool({
    description: "test tool",
    inputSchema: z.object({}),
    execute: async () => "ok",
  });

describe("buildSubagentToolset", () => {
  it("includes MCP search tools using the connected server name", () => {
    const slackSearch = createTestTool();
    const linearPersonalListIssues = createTestTool();
    const linearWorkListIssues = createTestTool();
    const normalizedLinearListIssues = createTestTool();
    const unrelatedTool = createTestTool();

    const result = buildSubagentToolset({
      mainToolset: {},
      slackSearch,
      mcpTools: {
        mcp_linear_personal_list_issues: linearPersonalListIssues,
        mcp_linear_work_list_issues: linearWorkListIssues,
        mcp_linear_list_issues: normalizedLinearListIssues,
        mcp_linear_personal_delete_issue: unrelatedTool,
      },
      mcpSearchToolSources: [
        { preset: MCP_PRESETS.linear, serverName: "linear_personal" },
        { preset: MCP_PRESETS.linear, serverName: "linear_work" },
      ],
    });

    expect(result.slack_search).toBe(slackSearch);
    expect(result.mcp_linear_personal_list_issues).toBe(
      linearPersonalListIssues,
    );
    expect(result.mcp_linear_work_list_issues).toBe(linearWorkListIssues);
    expect(result.mcp_linear_list_issues).toBeUndefined();
    expect(result.mcp_linear_personal_delete_issue).toBeUndefined();
  });
});

describe("SEARCH_SUBAGENT_SEQUENTIAL_SYSTEM_PROMPT", () => {
  it("routes connected MCP data-source lookups", () => {
    expect(SEARCH_SUBAGENT_SEQUENTIAL_SYSTEM_PROMPT).toContain("<mcp_routing>");
    expect(SEARCH_SUBAGENT_SEQUENTIAL_SYSTEM_PROMPT).toContain(
      "mcp_<server>_<tool>",
    );
    expect(SEARCH_SUBAGENT_SEQUENTIAL_SYSTEM_PROMPT).toContain(
      "do not fake the lookup",
    );
  });
});
