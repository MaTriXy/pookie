import { scheduledTaskMessageSchema } from "@/server/scheduling";
import { isQueuesAvailable } from "@/server/scheduling/capability";
import { processScheduledTaskMessage } from "@/server/scheduling/run-task";
import { logger } from "@/server/utils/logger";

export const maxDuration = 799;

// IMPORTANT: this route MUST stay declared as an experimentalTriggers
// `queue/v2beta` consumer in vercel.json. That declaration is what makes
// the route air-gapped on Vercel — without it, the route is publicly
// reachable. @vercel/queue's handleCallback does NOT verify any signature
// or HMAC on inbound requests; it only parses the CloudEvent envelope.
//
// Defense-in-depth: we additionally check that the request has the
// CloudEvent v2beta `ce-type` header that Vercel's queue infrastructure
// sets on every delivery. This is auth-by-shape, not auth-by-signature —
// an attacker who can reach the route could forge it — but it filters
// trivial "POST a JSON body" probes and the actual security boundary is
// vercel.json's air-gap. Earlier versions of this check also required
// `x-vercel-id`; that header is set on Vercel's *public* edge invocations
// and is not guaranteed on internal queue-trigger invocations, so we
// dropped it after observing legitimate deliveries get 403'd.
const VERCEL_QUEUE_CE_TYPE = "io.vercel.queue.message.v2beta";

const QUEUES_UNAVAILABLE_RESPONSE = {
  error: "queues_unavailable",
  message:
    "Vercel Queues is not enabled on this deployment. The scheduled-task consumer is a no-op on self-hosted Pookie.",
} as const;

const FORBIDDEN_RESPONSE = {
  error: "forbidden",
  message:
    "This endpoint only accepts traffic from Vercel's queue infrastructure.",
} as const;

const looksLikeQueueDelivery = (request: Request): boolean =>
  request.headers.get("ce-type") === VERCEL_QUEUE_CE_TYPE;

const handleQueueMessage = async (
  rawMessage: unknown,
  metadata: { messageId: string },
): Promise<void> => {
  const parsed = scheduledTaskMessageSchema.safeParse(rawMessage);
  if (!parsed.success) {
    throw new Error(`invalid scheduled-task payload: ${parsed.error.message}`);
  }
  await processScheduledTaskMessage({
    message: parsed.data,
    messageId: metadata.messageId,
  });
};

const RETRY_HANDLER_OPTIONS = {
  retry: (
    _error: unknown,
    metadata: { deliveryCount: number },
  ): { afterSeconds: number } | { acknowledge: true } => {
    if (metadata.deliveryCount >= 5) return { acknowledge: true };
    const delay = Math.min(300, 2 ** metadata.deliveryCount * 5);
    return { afterSeconds: delay };
  },
};

let cachedHandler: ((request: Request) => Promise<Response>) | undefined;

export const POST = async (request: Request): Promise<Response> => {
  if (!isQueuesAvailable()) {
    return Response.json(QUEUES_UNAVAILABLE_RESPONSE, { status: 503 });
  }
  if (!looksLikeQueueDelivery(request)) {
    // warn (not info) so this surfaces even on workspaces that opted out
    // of verbose tracing — debugging "why didn't my schedule fire" needs
    // a visible breadcrumb in Vercel logs.
    logger.warn("[scheduling] consumer rejected non-queue request", {
      ceType: request.headers.get("ce-type"),
    });
    return Response.json(FORBIDDEN_RESPONSE, { status: 403 });
  }
  if (!cachedHandler) {
    const { handleCallback } = await import("@vercel/queue");
    cachedHandler = handleCallback(handleQueueMessage, RETRY_HANDLER_OPTIONS);
  }
  return cachedHandler(request);
};
