import type { send as sendFn } from "@vercel/queue";

// Vercel Queues only works on a Vercel deployment — the SDK calls into
// platform-internal HTTP endpoints. Self-hosted Pookie (Docker, Railway,
// Render, Fly, Cloud Run, VPS) doesn't have those endpoints, so the tool
// must gracefully decline rather than 500.
//
// Vercel sets `VERCEL=1` on its runtime, plus `VERCEL_URL` / `VERCEL_ENV`.
// We accept any of those signals so a future change to the canonical env
// var doesn't silently disable scheduling on the platform.
export const isQueuesAvailable = (): boolean =>
  Boolean(
    process.env.VERCEL ||
    process.env.VERCEL_URL ||
    process.env.VERCEL_ENV ||
    process.env.NEXT_RUNTIME_VERCEL,
  );

// Dynamic import keeps the SDK out of self-hosted bundles that never call
// it. Node's module loader caches imports, so a per-call lookup is free.
export const getQueueSend = async (): Promise<typeof sendFn> => {
  if (!isQueuesAvailable()) {
    throw new Error(
      "Vercel Queues are unavailable on this deployment. Scheduling requires running on Vercel.",
    );
  }
  const { send } = await import("@vercel/queue");
  return send;
};
