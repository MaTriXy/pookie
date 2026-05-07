import { readFile } from "node:fs/promises";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SCHEDULED_TASK_TOPIC } from "../server/scheduling/constants";

const VERCEL_ENV_KEYS = [
  "VERCEL",
  "VERCEL_URL",
  "VERCEL_ENV",
  "NEXT_RUNTIME_VERCEL",
  "ALLOW_QUEUE_LOCAL_FORGERY",
] as const;

interface VercelTrigger {
  type: string;
  topic: string;
}

interface VercelFunctionConfig {
  experimentalTriggers?: VercelTrigger[];
}

interface VercelConfig {
  functions?: Record<string, VercelFunctionConfig>;
}

describe("vercel.json declares the queue trigger correctly (M2 / P3-5)", () => {
  it("registers the consumer route as a queue/v2beta trigger on the right topic", async () => {
    const raw = await readFile(
      path.resolve(__dirname, "../vercel.json"),
      "utf8",
    );
    const config: VercelConfig = JSON.parse(raw);
    const consumerConfig =
      config.functions?.["app/api/queues/scheduled-task/route.ts"];
    const queueTrigger = consumerConfig?.experimentalTriggers?.find(
      (trigger) => trigger.type === "queue/v2beta",
    );

    // Both fields matter: a missing `type` would let `topic` look right
    // while disabling the platform-level air-gap. See P1-2.
    expect(queueTrigger).toMatchObject({
      type: "queue/v2beta",
      topic: SCHEDULED_TASK_TOPIC,
    });
  });
});

describe("scheduled-task route guards", () => {
  const originalVercelEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of VERCEL_ENV_KEYS) {
      originalVercelEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of VERCEL_ENV_KEYS) {
      if (originalVercelEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalVercelEnv[key];
    }
  });

  const importRoute = async () =>
    (await import("../app/api/queues/scheduled-task/route")).POST;

  it("returns 503 with queues_unavailable on self-host (L4)", async () => {
    const POST = await importRoute();
    const response = await POST(
      new Request("http://localhost/api/queues/scheduled-task", {
        method: "POST",
        body: "{}",
      }),
    );
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body).toMatchObject({ error: "queues_unavailable" });
  });

  it("returns 403 when on Vercel but the request lacks queue headers (P1-2)", async () => {
    process.env.VERCEL = "1";
    const POST = await importRoute();
    const response = await POST(
      new Request("http://localhost/api/queues/scheduled-task", {
        method: "POST",
        body: JSON.stringify({ taskId: "anything" }),
      }),
    );
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body).toMatchObject({ error: "forbidden" });
  });

  it("returns 403 when only one of the queue headers is present (P1-2)", async () => {
    process.env.VERCEL = "1";
    const POST = await importRoute();
    const response = await POST(
      new Request("http://localhost/api/queues/scheduled-task", {
        method: "POST",
        headers: { "ce-type": "io.vercel.queue.message.v2beta" },
        body: JSON.stringify({ taskId: "anything" }),
      }),
    );
    expect(response.status).toBe(403);
  });
});
