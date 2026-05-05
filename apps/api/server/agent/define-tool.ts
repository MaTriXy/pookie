import * as AI from "ai";

import { normalizeToolError } from "../utils/normalize-tool-error";
import { makeToolOutput } from "./tool-result";

import type { z } from "zod";

import type { PookieToolResult } from "./tool-result";

interface DefineToolOptions<
  Input extends z.ZodTypeAny,
  Result extends z.ZodTypeAny,
> {
  description: string;
  inputSchema: Input;
  resultSchema: Result;
  execute: (
    input: z.output<Input>,
    options: AI.ToolCallOptions,
  ) => Promise<PookieToolResult<z.output<Result>>>;
  toModelOutput?: (
    output: PookieToolResult<z.output<Result>>,
    input: z.output<Input>,
  ) => string;
  errorFallback?: string;
}

export const defineTool = <
  Input extends z.ZodTypeAny,
  Result extends z.ZodTypeAny,
>({
  description,
  inputSchema,
  resultSchema,
  execute,
  toModelOutput,
  errorFallback = "tool execution failed",
}: DefineToolOptions<Input, Result>) =>
  AI.tool({
    description,
    inputSchema,
    outputSchema: makeToolOutput(resultSchema),
    execute: async (input, options) => {
      try {
        return await execute(input as z.output<Input>, options);
      } catch (caughtError) {
        return normalizeToolError(caughtError, errorFallback);
      }
    },
    ...(toModelOutput
      ? {
          toModelOutput: ({ input, output }) => ({
            type: "text" as const,
            value: toModelOutput(
              output as PookieToolResult<z.output<Result>>,
              input as z.output<Input>,
            ),
          }),
        }
      : {}),
  });
