import { readFile } from "node:fs/promises";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SCHEDULED_TASK_TOPIC } from "../server/scheduling/constants";

const VERCEL_ENV_KEYS = [
  "VERCEL",
  "VERCEL_URL",
  "VERCEL_ENV",
  "NEXT_RUNTIME_VERCEL",
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

describe("vercel.json topic name (M2)", () => {
  it("matches SCHEDULED_TASK_TOPIC exactly", async () => {
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

    expect(queueTrigger?.topic).toBe(SCHEDULED_TASK_TOPIC);
  });
});

describe("scheduled-task route 503 path (L4)", () => {
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

  it("returns 503 with queues_unavailable on self-host", async () => {
    const { POST } = await import("../app/api/queues/scheduled-task/route");
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
});
