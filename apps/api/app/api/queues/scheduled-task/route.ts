import { scheduledTaskMessageSchema } from "@/server/scheduling";
import { isQueuesAvailable } from "@/server/scheduling/capability";
import { processScheduledTaskMessage } from "@/server/scheduling/run-task";

export const maxDuration = 799;

// IMPORTANT: this route MUST stay declared as an experimentalTriggers
// `queue/v2beta` consumer in vercel.json. That declaration is what makes
// the route air-gapped on Vercel — without it, the route is publicly
// reachable. @vercel/queue's handleCallback does NOT verify any signature
// or HMAC on inbound requests; it only parses the CloudEvent envelope.
//
// Defense-in-depth: we additionally check that the request has the
// CloudEvent v2beta `ce-type` header set by Vercel's queue infrastructure
// AND a Vercel platform header (`x-vercel-id` is set on every Vercel
// edge invocation). Neither is auth-grade — both can be forged by anyone
// who can reach the route — but together they raise the bar past the
// trivial "POST a JSON body and trigger a task" attack.
//
// If you ever need to test this route locally outside `vercel dev`,
// set ALLOW_QUEUE_LOCAL_FORGERY=1 to bypass the platform-header check
// (still requires the CloudEvent type header for the SDK parser).
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

const looksLikeQueueDelivery = (request: Request): boolean => {
  if (request.headers.get("ce-type") !== VERCEL_QUEUE_CE_TYPE) return false;
  if (process.env.ALLOW_QUEUE_LOCAL_FORGERY === "1") return true;
  return Boolean(request.headers.get("x-vercel-id"));
};

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
    return Response.json(FORBIDDEN_RESPONSE, { status: 403 });
  }
  if (!cachedHandler) {
    const { handleCallback } = await import("@vercel/queue");
    cachedHandler = handleCallback(handleQueueMessage, RETRY_HANDLER_OPTIONS);
  }
  return cachedHandler(request);
};
