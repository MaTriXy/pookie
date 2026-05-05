import { SpanStatusCode, trace, type Attributes } from "@opentelemetry/api";

import type { LanguageModelUsage } from "ai";

export const pookiebotTracer = trace.getTracer("pookiebot");

/**
 * Reads the current OTel trace id (set by `@vercel/otel` for the
 * inbound request span). Returns `undefined` outside an active span,
 * e.g. dev runs without `AXIOM_API_TOKEN` configured. Modeled on
 * pookie's `getCurrentTraceId` (~/Developer/pookie/lib/utils/telemetry.ts).
 */
export const getCurrentTraceId = (): string | undefined =>
  trace.getActiveSpan()?.spanContext().traceId;

export const hasAxiomConnected = (): boolean => {
  return Boolean(process.env.AXIOM_TOKEN);
};

export const getCurrentTraceAxiomLink = (): string | undefined => {
  const traceId = getCurrentTraceId();
  if (!traceId) return undefined;

  if (!hasAxiomConnected()) {
    console.warn(
      "Axiom is not connected. Trace ID will not be linked to Axiom.",
    );
  }

  return `https://app.axiom.co/million-tuqv/dashboards/otel.traces.pookiebot?v_operation_name=ai.streamText&v_service_name=pookiebot&traceId=${encodeURIComponent(traceId)}&traceDataset=pookiebot`;
};

export const printTraceInfo = (): void => {
  const traceId = getCurrentTraceId();
  if (!traceId) return;
  const axiomLink = getCurrentTraceAxiomLink();
  console.log(`Trace ID: ${traceId}`);
  if (axiomLink) {
    console.log(`Axiom Trace Link: ${axiomLink}`);
  }
};

/**
 * Sets a flat string attribute on the active OTel span. Useful for
 * tagging the request span with `pookie.thread_id` / `pookie.trace_id`
 * so APL queries (`['pookie'] | where attributes.pookie.thread_id == "..."`)
 * stay simple regardless of how the AI SDK serializes nested metadata.
 */
export const stampSpanAttribute = (
  key: string,
  value: string | number | boolean,
): void => {
  trace.getActiveSpan()?.setAttribute(key, value);
};

/**
 * Stamps an exception onto the active span. Without this, errors only
 * reach Vercel's console — the OTel span in Axiom stays green, which
 * makes the debug_logs tool lie about what failed. Call from every
 * try/catch boundary that should surface in the trace.
 */
export const recordSpanError = (error: unknown): void => {
  const span = trace.getActiveSpan();
  if (!span) return;
  const errorObject = error instanceof Error ? error : new Error(String(error));
  span.recordException(errorObject);
  span.setStatus({
    code: SpanStatusCode.ERROR,
    message: errorObject.message,
  });
};

/**
 * Returns a short, human-readable trace footer for user-facing replies.
 * Returns `""` when no trace id is available, so call sites can just
 * concatenate without conditionals.
 */
export const buildTraceFooter = (traceId: string | undefined): string => {
  if (!traceId) return "";
  const short = traceId.length > 8 ? traceId.slice(0, 8) : traceId;
  return ` (trace: ${short})`;
};

/**
 * Emit a short-lived `pookie.usage` span with normalized token counts.
 * Mirrors pookie's `recordUsageSpan`. The flat attribute names let the
 * trace viewer read counts without parsing provider-specific metadata.
 */
export const recordUsageSpan = (
  usage: LanguageModelUsage,
  meta: {
    agentKind: string;
    model?: string;
    step?: number;
    functionId?: string;
    threadId?: string;
  },
): void => {
  const attrs: Attributes = {
    "pookiebot.usage.input": usage.inputTokens ?? 0,
    "pookiebot.usage.output": usage.outputTokens ?? 0,
    "pookiebot.usage.total": usage.totalTokens ?? 0,
    "pookiebot.usage.cache_read": usage.inputTokenDetails?.cacheReadTokens ?? 0,
    "pookiebot.usage.cache_write":
      usage.inputTokenDetails?.cacheWriteTokens ?? 0,
    "pookiebot.usage.no_cache": usage.inputTokenDetails?.noCacheTokens ?? 0,
    "pookiebot.usage.reasoning": usage.outputTokenDetails?.reasoningTokens ?? 0,
    "pookiebot.usage.text": usage.outputTokenDetails?.textTokens ?? 0,
    "pookiebot.agent_kind": meta.agentKind,
  };
  if (meta.model) attrs["pookiebot.model"] = meta.model;
  if (meta.step !== undefined) attrs["pookiebot.step"] = meta.step;
  if (meta.functionId) attrs["pookiebot.function_id"] = meta.functionId;
  if (meta.threadId) attrs["pookiebot.thread_id"] = meta.threadId;

  const span = pookiebotTracer.startSpan("pookiebot.usage", { attributes: attrs });
  span.end();
};
