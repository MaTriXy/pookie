import { describe, expect, it } from "vitest";

import {
  createOauthStateNonce,
  isOauthStateMatch,
} from "../server/slack/oauth-state";

describe("createOauthStateNonce", () => {
  it("returns a base64url-safe string", () => {
    const nonce = createOauthStateNonce();
    expect(nonce).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("produces a different value on each call", () => {
    const a = createOauthStateNonce();
    const b = createOauthStateNonce();
    expect(a).not.toBe(b);
  });

  it("encodes 32 random bytes (~43 base64url chars)", () => {
    const nonce = createOauthStateNonce();
    expect(nonce.length).toBe(43);
  });
});

describe("isOauthStateMatch", () => {
  it("returns true when cookie and param match exactly", () => {
    expect(isOauthStateMatch("abc123", "abc123")).toBe(true);
  });

  it("returns false when cookie is missing", () => {
    expect(isOauthStateMatch(undefined, "abc123")).toBe(false);
    expect(isOauthStateMatch("", "abc123")).toBe(false);
  });

  it("returns false when param is missing", () => {
    expect(isOauthStateMatch("abc123", null)).toBe(false);
    expect(isOauthStateMatch("abc123", "")).toBe(false);
  });

  it("returns false when both are missing", () => {
    expect(isOauthStateMatch(undefined, null)).toBe(false);
  });

  it("returns false when values differ", () => {
    expect(isOauthStateMatch("abc123", "abc124")).toBe(false);
  });

  it("returns false when lengths differ (avoids timingSafeEqual throw)", () => {
    expect(isOauthStateMatch("abc", "abcd")).toBe(false);
  });

  it("uses constant-time comparison and does not throw on equal-length inputs", () => {
    expect(isOauthStateMatch("aaaaa", "bbbbb")).toBe(false);
  });

  it("does not throw when inputs have equal code-unit length but different UTF-8 byte length", () => {
    // 43 chars of base64url (the actual nonce length) vs a string of 43
    // UTF-16 code units where some chars take 2 UTF-8 bytes. "ñ" is one
    // UTF-16 code unit (string.length 1) but two UTF-8 bytes.
    const ascii = "a".repeat(43);
    const multiByte = `${"a".repeat(39)}${"ñ".repeat(4)}`;
    expect(ascii.length).toBe(multiByte.length);
    expect(Buffer.from(ascii).length).not.toBe(Buffer.from(multiByte).length);
    expect(() => isOauthStateMatch(ascii, multiByte)).not.toThrow();
    expect(isOauthStateMatch(ascii, multiByte)).toBe(false);
  });
});
