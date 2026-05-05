import { describe, expect, it } from "vitest";

import {
  abortActiveRun,
  cleanupActiveRun,
  registerActiveRun,
} from "../server/agent/active-runs";

describe("registerActiveRun", () => {
  it("returns an AbortController whose signal starts un-aborted", () => {
    const controller = registerActiveRun("C001", "1700000000.000001");
    expect(controller.signal.aborted).toBe(false);
    cleanupActiveRun("C001", "1700000000.000001");
  });

  it("aborts a previously registered run for the same key", () => {
    const first = registerActiveRun("C002", "1700000000.000002");
    const second = registerActiveRun("C002", "1700000000.000002");

    expect(first.signal.aborted).toBe(true);
    expect(second.signal.aborted).toBe(false);

    cleanupActiveRun("C002", "1700000000.000002");
  });
});

describe("abortActiveRun", () => {
  it("aborts a registered run and returns true", () => {
    const controller = registerActiveRun("C003", "1700000000.000003");
    const didAbort = abortActiveRun("C003", "1700000000.000003");

    expect(didAbort).toBe(true);
    expect(controller.signal.aborted).toBe(true);
  });

  it("returns false when no run is registered for the key", () => {
    const didAbort = abortActiveRun("C999", "9999999999.999999");
    expect(didAbort).toBe(false);
  });

  it("returns false on a second abort for the same key", () => {
    registerActiveRun("C004", "1700000000.000004");
    abortActiveRun("C004", "1700000000.000004");

    const secondAbort = abortActiveRun("C004", "1700000000.000004");
    expect(secondAbort).toBe(false);
  });
});

describe("cleanupActiveRun", () => {
  it("removes the run so a subsequent abort returns false", () => {
    registerActiveRun("C005", "1700000000.000005");
    cleanupActiveRun("C005", "1700000000.000005");

    const didAbort = abortActiveRun("C005", "1700000000.000005");
    expect(didAbort).toBe(false);
  });

  it("is a no-op for keys that were never registered", () => {
    expect(() => cleanupActiveRun("C999", "9999999999.999999")).not.toThrow();
  });
});

describe("isolation across different keys", () => {
  it("does not cross-abort runs in different channels", () => {
    const runA = registerActiveRun("C010", "1700000000.000010");
    const runB = registerActiveRun("C011", "1700000000.000010");

    abortActiveRun("C010", "1700000000.000010");

    expect(runA.signal.aborted).toBe(true);
    expect(runB.signal.aborted).toBe(false);

    cleanupActiveRun("C011", "1700000000.000010");
  });

  it("does not cross-abort runs with different message timestamps", () => {
    const runA = registerActiveRun("C012", "1700000000.000001");
    const runB = registerActiveRun("C012", "1700000000.000002");

    abortActiveRun("C012", "1700000000.000001");

    expect(runA.signal.aborted).toBe(true);
    expect(runB.signal.aborted).toBe(false);

    cleanupActiveRun("C012", "1700000000.000002");
  });
});
