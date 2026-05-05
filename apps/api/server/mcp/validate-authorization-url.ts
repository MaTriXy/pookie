interface AuthorizationUrlValidation {
  valid: boolean;
  reason?: string;
}

export const validateAuthorizationUrl = (
  rawUrl: string,
): AuthorizationUrlValidation => {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { valid: false, reason: `invalid url: ${rawUrl}` };
  }

  if (parsed.protocol !== "https:") {
    return {
      valid: false,
      reason: `OAuth authorization URL must use HTTPS. got: ${parsed.protocol.replace(":", "")}`,
    };
  }

  return { valid: true };
};
