import { z } from "zod";

const TOOL_ERROR_KINDS = [
  "validation",
  "slack_access",
  "slack_api",
  "unknown",
] as const;

export type ToolErrorKind = (typeof TOOL_ERROR_KINDS)[number];

const PookieToolErrorSchema = z.object({
  type: z.literal("error"),
  error: z.object({
    kind: z.enum(TOOL_ERROR_KINDS),
    message: z.string(),
    code: z.string().optional(),
    instructions: z.string().optional(),
  }),
});

export type PookieToolError = z.infer<typeof PookieToolErrorSchema>;

export const makeToolOutput = <Result extends z.ZodTypeAny>(
  resultSchema: Result,
) =>
  z.discriminatedUnion("type", [
    PookieToolErrorSchema,
    z.object({ type: z.literal("success"), result: resultSchema }),
  ]);

export type PookieToolResult<Result> =
  | { type: "success"; result: Result }
  | PookieToolError;

export const toolResult = <Result>(
  result: Result,
): PookieToolResult<Result> => ({
  type: "success",
  result,
});

interface ToolErrOptions {
  code?: string;
  instructions?: string;
}

export const toolErr = (
  kind: ToolErrorKind,
  message: string,
  options: ToolErrOptions = {},
): PookieToolError => ({
  type: "error",
  error: { kind, message, ...options },
});
