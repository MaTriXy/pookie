import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-node";
import { registerOTel } from "@vercel/otel";

// Next.js calls register() once on server boot; @vercel/otel hooks in
// the right tracer/processor so AI SDK's `experimental_telemetry` and
// any `trace.getActiveSpan()` reads work everywhere downstream.
//
// Telemetry is opt-in via standard OTel env vars so self-hosters get
// zero phone-home by default. Set OTEL_EXPORTER_OTLP_ENDPOINT to enable.
export const register = async (): Promise<void> => {
  if (process.env.NODE_ENV !== "production") return;
  if (process.env.AXIOM_TOKEN) {
    registerOTel({
      serviceName: "pookiebot",
      spanProcessors: [
        new BatchSpanProcessor(
          new OTLPTraceExporter({
            url: "https://api.axiom.co/v1/traces",
            headers: {
              Authorization: `Bearer ${process.env.AXIOM_TOKEN}`,
              "X-Axiom-Dataset": "pookiebot",
            },
          }),
        ),
      ],
    });
  }

  if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    // for self-hosters
    const parseOtlpHeaders = (
      raw: string | undefined,
    ): Record<string, string> => {
      if (!raw) return {};
      const headers: Record<string, string> = {};
      for (const pair of raw.split(",")) {
        const [key, ...rest] = pair.split("=");
        if (!key || rest.length === 0) continue;
        headers[key.trim()] = rest.join("=").trim();
      }
      return headers;
    };

    registerOTel({
      serviceName: process.env.OTEL_SERVICE_NAME ?? "pookiebot",
      spanProcessors: [
        new BatchSpanProcessor(
          new OTLPTraceExporter({
            url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
            headers: parseOtlpHeaders(process.env.OTEL_EXPORTER_OTLP_HEADERS),
          }),
        ),
      ],
    });
  }
};
