import { randomBytes, timingSafeEqual } from "node:crypto";

export const createOauthStateNonce = (): string =>
  randomBytes(32).toString("base64url");

export const isOauthStateMatch = (
  cookieValue: string | undefined,
  paramValue: string | null,
): boolean => {
  if (!cookieValue || !paramValue) return false;
  // Compare byte lengths, not JS string code-unit lengths. timingSafeEqual
  // throws RangeError on mismatched-byte-length buffers, and an attacker
  // crafting multi-byte UTF-8 chars (e.g. "ñ") in the state param can have
  // string.length match while Buffer byte-length differs.
  const cookieBuf = Buffer.from(cookieValue);
  const paramBuf = Buffer.from(paramValue);
  if (cookieBuf.length !== paramBuf.length) return false;
  return timingSafeEqual(cookieBuf, paramBuf);
};
