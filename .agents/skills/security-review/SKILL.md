---
name: security-review
description: >-
  Review code for security issues in self-hosted and managed Vercel deployments
  of this Slack bot. Covers secrets, tokens, permissions, logs, user data
  handling, SSRF, and data minimization. Use when reviewing code for security,
  auditing data handling, checking for leaked secrets, or verifying privacy
  compliance.
---

# Security Review

Review the relevant code with a code review mindset. Prioritize bugs, behavioral regressions, security issues, and missing tests. Findings must be the primary focus, ordered by severity. Do not make code changes unless the user explicitly asks for them.

This is a self-hostable Slack bot. Review it for security issues in both self-hosted deployments and our managed Vercel deployment. Pay close attention to how secrets, tokens, permissions, logs, and user data are handled. Make sure we do not collect, track, or store any user data unless it comes from the Million workspace or is strictly required for the product to function.

## Threat Model

Two deployment modes — each has different trust boundaries:

| Mode                 | Operator          | Tokens held by | Trust boundary                                            |
| -------------------- | ----------------- | -------------- | --------------------------------------------------------- |
| **Managed** (Vercel) | Million           | Million        | Million workspace data only; no cross-workspace leaks     |
| **Self-hosted**      | External operator | Operator       | Operator controls their own data; bot must not phone home |

## Review Checklist

Work through every item. Report each finding with severity, file, and line range.

### Secrets & Credentials

- [ ] No hardcoded secrets, tokens, or API keys in source
- [ ] `.env` / `.env.*` files are in `.gitignore`
- [ ] `env.ts` schemas mark optional secrets as `.optional()` — no startup crash on missing non-critical vars
- [ ] Secrets never appear in `console.log`, `console.error`, or structured log payloads
- [ ] Error responses to users never leak internal state, stack traces, or secret fragments
- [ ] `SLACK_USER_TOKEN` warning comment present — must not be set on multi-workspace installs

### Token & Session Handling

- [ ] Slack signing secret is verified on every inbound webhook before processing
- [ ] OAuth tokens are stored scoped (per-user or per-team), never globally
- [ ] OAuth state parameters use cryptographic randomness and are single-use
- [ ] Token refresh flows handle expiry and revocation without exposing tokens in logs
- [ ] Connect-link tokens in `/api/onboarding/connect` are time-limited and single-use

### SSRF & URL Validation

- [ ] User-supplied MCP server URLs pass `validateMcpServerUrl` before any fetch
- [ ] Private IPs, loopback, link-local, and cloud metadata endpoints are blocked
- [ ] HTTPS is enforced for all outbound MCP connections
- [ ] No DNS rebinding window between validation and fetch

### Data Minimization & Privacy

- [ ] No telemetry, analytics, or tracking pixels ship to third parties
- [ ] Redis keys store only functional data (thread state, config, welcome flags) — no user message content at rest
- [ ] Search results are scoped to the requesting user's Slack permissions — no privilege escalation
- [ ] `SLACK_USER_TOKEN` fallback only activates on self-hosted single-workspace deployments
- [ ] No cross-workspace data sharing in multi-tenant mode
- [ ] Bot only reads channels it has been explicitly invited to

### Permissions & Authorization

- [ ] Admin-only operations (`--global` config, MCP management) check caller identity
- [ ] Slash command handlers verify `teamId` / `userId` from the signed Slack payload, not from user-supplied text
- [ ] MCP server configs are scoped to the correct user/team — no scope confusion

### Error Handling & Logging

- [ ] All `catch` blocks log enough context to debug without leaking PII or secrets
- [ ] Error messages returned to Slack users are generic, not raw error strings
- [ ] HTML error pages escape dynamic values (XSS prevention in `renderHtml`)

### Dependency & Deployment Surface

- [ ] No `eval`, `Function()`, or dynamic `import()` of user-supplied strings
- [ ] Cron endpoints authenticate via `CRON_SECRET` bearer token
- [ ] `Cache-Control: no-store` on all auth/onboarding HTML responses
- [ ] No open redirects — redirect targets are derived from known presets, not user input

## Severity Scale

| Level             | Meaning                                                    |
| ----------------- | ---------------------------------------------------------- |
| **P0 — Critical** | Exploitable now: RCE, auth bypass, secret leak to client   |
| **P1 — High**     | Data exposure, privilege escalation, SSRF                  |
| **P2 — Medium**   | Missing validation, excessive logging, weak error handling |
| **P3 — Low**      | Hardening opportunities, defense-in-depth gaps             |

## Output Format

```
### P0 — [Title]
**File:** `path/to/file.ts` (lines X–Y)
**Issue:** Description of the vulnerability
**Impact:** What an attacker can achieve
**Fix:** Concrete remediation steps
```

Group findings by severity. End with a summary count: `X critical, Y high, Z medium, W low`.
