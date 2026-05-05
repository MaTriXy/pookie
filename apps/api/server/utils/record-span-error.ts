import { SpanStatusCode } from "@opentelemetry/api";

import { getErrorMessage, getPlatformErrorCode } from "./normalize-tool-error";

import type { Span } from "@opentelemetry/api";

export const recordSpanError = (span: Span, caughtError: unknown): void => {
  span.recordException(
    caughtError instanceof Error ? caughtError : new Error(String(caughtError)),
  );
  span.setStatus({
    code: SpanStatusCode.ERROR,
    message:
      getPlatformErrorCode(caughtError) ??
      getErrorMessage(caughtError) ??
      String(caughtError),
  });
};
