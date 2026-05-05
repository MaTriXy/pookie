import * as dns from "node:dns/promises";

import * as ipaddr from "ipaddr.js";

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.goog",
]);

// ipaddr.js range labels that indicate non-public addresses.
// Anything resolving to one of these is rejected.
const BLOCKED_IP_RANGES = new Set([
  "unspecified",
  "broadcast",
  "loopback",
  "private",
  "linkLocal",
  "uniqueLocal",
  "ipv4Mapped",
  "rfc6145",
  "rfc6052",
  "6to4",
  "teredo",
  "carrierGradeNat",
  "reserved",
]);

const isBlockedAddress = (address: string): boolean => {
  try {
    const parsed = ipaddr.parse(address);
    return BLOCKED_IP_RANGES.has(parsed.range());
  } catch {
    return false;
  }
};

export interface McpServerUrlValidation {
  valid: boolean;
  reason?: string;
}

export const validateMcpServerUrl = async (
  rawUrl: string,
): Promise<McpServerUrlValidation> => {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { valid: false, reason: `invalid url: ${rawUrl}` };
  }

  if (parsed.protocol !== "https:") {
    return {
      valid: false,
      reason: `MCP server URL must use HTTPS. got: ${parsed.protocol.replace(":", "")}`,
    };
  }

  const hostname = parsed.hostname.toLowerCase();

  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return {
      valid: false,
      reason: `MCP server URL cannot point to ${hostname}`,
    };
  }

  // Reject literal private/loopback IPs before DNS resolution
  if (isBlockedAddress(hostname)) {
    return {
      valid: false,
      reason:
        "MCP server URL cannot point to a private or link-local IP address",
    };
  }

  // Resolve DNS and reject hostnames that point to internal infrastructure.
  // Prevents SSRF via DNS rebinding or CNAME-to-private chains.
  try {
    const addresses = await dns.resolve(hostname);
    const blockedAddress = addresses.find(isBlockedAddress);
    if (blockedAddress) {
      return {
        valid: false,
        reason: `MCP server hostname resolves to a blocked address (${blockedAddress})`,
      };
    }
  } catch {
    return {
      valid: false,
      reason: `could not resolve hostname: ${hostname}`,
    };
  }

  return { valid: true };
};
