# Environment Variables Reference

Complete reference for all environment variables used in Chat SDK Slack agent projects.

## Required Variables

### SLACK_BOT_TOKEN

**Description:** OAuth token for authenticating Slack API calls. Auto-detected by `@chat-adapter/slack`.

**Source:**

1. Go to https://api.slack.com/apps
2. Select your app
3. Navigate to **Install App**
4. Copy **Bot User OAuth Token**

**Format:** `xoxb-XXXXXXXXX-XXXXXXXXX-XXXXXXXXXXXXXXXXXXXXXXXX`

**Security:**

- Never commit to version control
- Rotate if compromised
- Use different tokens for dev/prod

---

### SLACK_SIGNING_SECRET

**Description:** Secret used to verify requests originate from Slack. Auto-detected by `@chat-adapter/slack`.

**Source:**

1. Go to https://api.slack.com/apps
2. Select your app
3. Navigate to **Basic Information**
4. Find **Signing Secret** under App Credentials

**Format:** 32-character hexadecimal string

**Usage:** Automatically used by the Chat SDK Slack adapter to verify request signatures.

**Security:**

- Never commit to version control
- Rotate if compromised
- Each Slack app has a unique secret

---

### REDIS_URL

**Description:** Redis connection URL for the Chat SDK state adapter (`@chat-adapter/state-redis`).

**Source:**

- [Upstash Redis](https://upstash.com) (recommended for serverless)
- Any Redis-compatible provider

**Format:** `redis://default:PASSWORD@HOST:PORT` or `rediss://...` for TLS

**Usage:**

```typescript
import { createRedisState } from "@chat-adapter/state-redis";

const state = createRedisState(); // Reads REDIS_URL automatically
```

**Note:** For local development, you can use an in-memory state adapter instead:

```typescript
import { createMemoryState } from "chat";

const state = createMemoryState();
```

---

## AI Integration

Pookie uses OpenAI directly via `@ai-sdk/openai`. The SDK reads `OPENAI_API_KEY` from the environment automatically.

### OPENAI_API_KEY

**Description:** API key for OpenAI access (LLM, image generation, code execution).

**Source:**

1. Go to https://platform.openai.com/api-keys
2. Create a new API key
3. Copy the key (starts with `sk-`)

**Setup:**

```bash
pnpm add @ai-sdk/openai
```

**Usage:**

```typescript
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";

const result = await generateText({
  model: openai("gpt-4o-mini"),
  prompt: "Hello world",
});
```

---

## Development-Only Variables

### NGROK_AUTH_TOKEN

**Description:** Authentication token for ngrok tunneling service.

**Source:**

1. Go to https://dashboard.ngrok.com
2. Sign up or log in
3. Navigate to **Your Authtoken**
4. Copy the token

**Format:** Alphanumeric string

**Usage:** Used for local development tunneling.

**Note:** Not needed in production deployments.

---

## Optional Variables

### NODE_ENV

**Description:** Node.js environment indicator.

**Values:**

- `development` — Local development
- `production` — Production deployment
- `test` — Test environment

**Default:** `development` locally, `production` on Vercel

---

### LOG_LEVEL

**Description:** Controls logging verbosity.

**Values:**

- `debug` — All logs including debug info
- `info` — Standard operational logs
- `warn` — Warnings and errors only
- `error` — Errors only

**Default:** `info`

---

### CRON_SECRET

**Description:** Secret for authenticating cron job endpoints.

**Usage:**

```typescript
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ success: true });
}
```

---

## Local Development Setup

Create a `.env` file in your project root:

```env
# Required - Slack credentials (auto-detected by Chat SDK)
SLACK_BOT_TOKEN=xoxb-your-token-here
SLACK_SIGNING_SECRET=your-signing-secret

# Required - OpenAI access (auto-detected by @ai-sdk/openai)
OPENAI_API_KEY=sk-your-openai-key

# Required - State persistence
REDIS_URL=redis://default:password@host:port

# Development tunnel
NGROK_AUTH_TOKEN=your-ngrok-token

# Optional
NODE_ENV=development
LOG_LEVEL=debug
```

## Security Best Practices

### 1. Never Commit Secrets

Ensure `.gitignore` includes:

```
.env
.env.local
.env.*.local
```

### 2. Use Different Credentials Per Environment

| Environment | Slack App   | Tokens         |
| ----------- | ----------- | -------------- |
| Development | Dev App     | Dev tokens     |
| Staging     | Staging App | Staging tokens |
| Production  | Prod App    | Prod tokens    |

### 3. Rotate Compromised Credentials

If a secret is exposed:

**For Slack tokens:**

1. Go to app settings > **Install App**
2. Click **Reinstall App**
3. Update all environment variables

**For Signing Secret:**

1. Go to **Basic Information**
2. Click **Regenerate** under Signing Secret
3. Update all environment variables

### 4. Limit Token Scopes

Only request the OAuth scopes your app needs. Review scopes in your `manifest.json`.

### 5. Monitor Usage

- Check Slack app analytics for unusual activity
- Monitor Vercel function logs for errors
- Set up alerts for anomalies

## Vercel Environment Configuration

### Setting Variables

**Via Dashboard:**

1. Project Settings > Environment Variables
2. Add variable name and value
3. Select environments (Production/Preview/Development)
4. Save and redeploy

**Via CLI:**

```bash
vercel env add VARIABLE_NAME production
```

### Environment Scopes

| Scope       | When Used                   |
| ----------- | --------------------------- |
| Production  | `vercel --prod` deployments |
| Preview     | Pull request deployments    |
| Development | `vercel dev` local server   |

### Sensitive vs Non-Sensitive

Mark variables as **Sensitive** for:

- API keys
- Tokens
- Secrets

Sensitive variables:

- Are encrypted at rest
- Don't appear in logs
- Can't be read via API

## Accessing Variables

### In Server Code

```typescript
const token = process.env.SLACK_BOT_TOKEN;

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const token = getRequiredEnv("SLACK_BOT_TOKEN");
```

### In Next.js Config

```typescript
// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Environment variables are available via process.env in server components and API routes
};

export default nextConfig;
```

## Troubleshooting

### Variable Not Found

**Symptoms:** `undefined` value, missing env error

**Solutions:**

1. Check variable name spelling (case-sensitive)
2. Verify `.env` file is in project root
3. Restart dev server after changes
4. Redeploy after adding to Vercel

### Invalid Token Errors

**Symptoms:** `invalid_auth`, `token_revoked`

**Solutions:**

1. Verify token is complete (no truncation)
2. Check for extra whitespace
3. Confirm token matches the workspace
4. Regenerate if expired/revoked

### Signature Verification Failed

**Symptoms:** `invalid_signature` errors

**Solutions:**

1. Verify signing secret is correct
2. Check for request timestamp issues
3. Ensure secret matches the Slack app
