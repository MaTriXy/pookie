import { beforeEach, describe, expect, it, vi } from "vitest";

interface TestEnv {
  BASE_URL?: string;
  NODE_ENV: "development" | "test" | "production";
}

const envMock = vi.hoisted(() => {
  const env: TestEnv = {
    NODE_ENV: "development",
  };
  return { env };
});

vi.mock("@/env", () => ({
  env: envMock.env,
}));

import { resolveBaseUrl } from "../lib/deployment";

describe("resolveBaseUrl", () => {
  beforeEach(() => {
    envMock.env.BASE_URL = undefined;
    envMock.env.NODE_ENV = "development";
  });

  it("prefers the configured base URL", () => {
    envMock.env.BASE_URL = "https://pookie.example.com";

    expect(
      resolveBaseUrl(new Request("https://attacker.example.com/install")),
    ).toBe("https://pookie.example.com");
  });

  it("allows request-origin fallback outside production", () => {
    expect(resolveBaseUrl(new Request("http://localhost:3000/install"))).toBe(
      "http://localhost:3000",
    );
  });

  it("rejects request-origin fallback in production", () => {
    envMock.env.NODE_ENV = "production";

    expect(() =>
      resolveBaseUrl(new Request("https://attacker.example.com/install")),
    ).toThrow("BASE_URL must be configured in production");
  });
});
