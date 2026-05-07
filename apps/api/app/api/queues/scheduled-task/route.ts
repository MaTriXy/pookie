import { scheduledTaskMessageSchema } from "@/server/scheduling";
import { isQueuesAvailable } from "@/server/scheduling/capability";
import { processScheduledTaskMessage } from "@/server/scheduling/run-task";
import "@/server/bot";

export const maxDuration = 799;

const QUEUES_UNAVAILABLE_RESPONSE = {
  error: "queues_unavailable",
  message:
    "Vercel Queues is not enabled on this deployment. The scheduled-task consumer is a no-op on self-hosted Pookie.",
} as const;

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
  if (!cachedHandler) {
    const { handleCallback } = await import("@vercel/queue");
    cachedHandler = handleCallback(handleQueueMessage, RETRY_HANDLER_OPTIONS);
  }
  return cachedHandler(request);
};
