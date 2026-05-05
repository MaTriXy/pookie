import { trace } from "@opentelemetry/api";

export const slackTracer = trace.getTracer("pookiebot.slack-tools");
