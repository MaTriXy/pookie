import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { splitDelay } from "../server/scheduling";
import { isQueuesAvailable } from "../server/scheduling/capability";

const VERCEL_ENV_KEYS = [
  "VERCEL",
  "VERCEL_URL",
  "VERCEL_ENV",
  "NEXT_RUNTIME_VERCEL",
] as const;

describe("isQueuesAvailable", () => {
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

  it("returns true when Vercel sets VERCEL=1", () => {
    process.env.VERCEL = "1";
    expect(isQueuesAvailable()).toBe(true);
  });

  it("returns true on platform-only env vars (VERCEL_URL or VERCEL_ENV)", () => {
    process.env.VERCEL_URL = "pookie.vercel.app";
    expect(isQueuesAvailable()).toBe(true);

    delete process.env.VERCEL_URL;
    process.env.VERCEL_ENV = "production";
    expect(isQueuesAvailable()).toBe(true);
  });

  it("returns false on self-hosted (no Vercel env vars)", () => {
    expect(isQueuesAvailable()).toBe(false);
  });
});

describe("splitDelay", () => {
  const SEVEN_DAYS = 7 * 24 * 60 * 60;

  it("returns the full delay when within the 7-day cap", () => {
    expect(splitDelay(60)).toEqual({
      chunkSeconds: 60,
      remainingSeconds: 0,
    });
  });

  it("returns a chunk plus remainder for delays past 7 days", () => {
    const totalSeconds = SEVEN_DAYS + 3600;
    expect(splitDelay(totalSeconds)).toEqual({
      chunkSeconds: SEVEN_DAYS,
      remainingSeconds: 3600,
    });
  });

  it("clamps negative inputs to zero on the chunk", () => {
    expect(splitDelay(-100)).toEqual({
      chunkSeconds: 0,
      remainingSeconds: 0,
    });
  });

  it("returns no remainder when total exactly equals the cap", () => {
    expect(splitDelay(SEVEN_DAYS)).toEqual({
      chunkSeconds: SEVEN_DAYS,
      remainingSeconds: 0,
    });
  });
});
