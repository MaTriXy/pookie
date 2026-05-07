// Errors thrown deep in the agent (Slack APIs, OpenAI, MCP, queue SDK) can
// embed long opaque tokens, base64 blobs, or partial prompts in their
// messages. We persist a `lastError` snippet on scheduled-task records to
// help operators debug failures, but we don't want raw tokens or PII in
// Redis even though the record is encrypted at rest.
//
// Strategy: replace any run of 20+ "secret-shaped" characters
// (alphanumeric + dash/underscore — the shape of tokens, JWTs, sha hashes,
// base64 ids) with `[redacted]`, then truncate to 200 chars. Loses some
// debug fidelity vs. the raw error, but keeps the structural error class
// + short error code, which is what operators usually need.
const SECRET_SHAPED_REGEX = /[A-Za-z0-9_-]{20,}/g;
const REDACTED_ERROR_MAX_CHARS = 200;

export const redactError = (errorMessage: string): string =>
  errorMessage
    .replace(SECRET_SHAPED_REGEX, "[redacted]")
    .slice(0, REDACTED_ERROR_MAX_CHARS);
