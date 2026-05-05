# Install Pookie — agent skill

You're helping a user install **Pookie**, an AI agent that searches Slack workspaces. Tag `@pookie` in a channel or thread and it replies with relevant context from the user's Slack history.

This skill drives the install flow end to end. Read it fully before doing anything.

---

## Step 1 — Pick a path

Pookie installs two ways. Ask the user:

> Want **managed** (one click, we host Pookie for you) or **self-host** (you run it on your own infra)?

Default recommendation: **managed**, unless the user has a specific reason to self-host (data residency, air-gapped network, wants to fork the agent logic).

- **Path A — Managed** is below. ~30 seconds, no code, no infra.
- **Path B — Self-host** is below. ~15 minutes, requires a Node host, Redis, and an OpenAI API key.

Pick one path and run only its steps. Don't mix them.

---

## Path A — Managed install

### A1. Send the user to the install link

Tell the user to open this URL in their browser:

```
https://getpookie.com/api/slack/install
```

What happens:

1. Slack OAuth consent screen opens
2. User picks the workspace they want Pookie installed in
3. They approve the bot scopes (read messages where they tag the bot, post replies, search the workspace, write canvas/files)
4. Slack redirects them to `https://getpookie.com/guide?team=...&app=...&team_name=...`
5. The guide page deep-links them straight back into Slack via `slack://app?team=...&id=...&tab=home`

### A2. Confirm it works

Wait for the user to confirm they landed on the guide page. Then ask them to test:

1. In Slack, find Pookie in the sidebar (Apps section) and DM it `hi`, **or**
2. Invite Pookie to a channel (`/invite @pookie`) and mention it (`@pookie hello`)

Pookie should reply within ~3 seconds.

### A3. If something failed

If they got redirected back to `https://getpookie.com/?slack_error=<reason>`, the reason explains what happened:

| `slack_error` value             | What it means                                                                                                                                      | What to do                                                                   |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `access_denied`                 | User clicked Cancel on Slack's consent screen                                                                                                      | Re-run A1                                                                    |
| `invalid_state`                 | CSRF cookie mismatch — usually means they took >10 min between steps, used incognito after starting in normal, or bounced through multiple devices | Re-run A1 from the same browser session                                      |
| `invalid_scope`                 | Pookie's Slack app isn't configured to grant a scope it requested. **Maintainer-side bug**, not user-fixable.                                      | File at https://github.com/millionco/pookie/issues with the URL they were on |
| `install_failed` (or any other) | Server-side error during OAuth code exchange (Redis down, Slack API hiccup)                                                                        | Wait a minute, retry. If it persists, file an issue.                         |

Don't guess. Read the URL in their browser bar and report the exact `slack_error` value.

### A4. Stop here

For managed install, you are **done**. Do not run Path B steps. Do not ask them for env vars. Do not deploy anything.

---

## Path B — Self-host

Self-hosting runs Pookie on the user's own infra. They keep their Slack tokens and AI provider keys; nothing transits Pookie's hosted instance. About 15 minutes start to finish.

### B1. Verify prerequisites

Before doing anything, confirm with the user:

- [ ] A Slack workspace where they have permission to install apps
- [ ] A Node host: Vercel, Railway, Fly.io, Render, or Docker on their own VPS
- [ ] A Redis instance (Upstash free tier is fine: https://upstash.com)
- [ ] An **OpenAI API key** (`OPENAI_API_KEY`) — https://platform.openai.com/api-keys

If any prerequisite is missing, help the user get it before continuing.

### B2. Clone and deploy `apps/api`

The repo is a pnpm monorepo. The Slack agent lives in `apps/api`.

```bash
git clone https://github.com/millionco/pookie
cd pookie/apps/api
```

#### Option 1 — Vercel (one click, includes managed Redis)

```
https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fmillionco%2Fpookie&root-directory=apps%2Fapi&env=SLACK_CLIENT_ID,SLACK_CLIENT_SECRET,SLACK_SIGNING_SECRET,SLACK_ENCRYPTION_KEY,OPENAI_API_KEY,IS_SELF_DEPLOYED&stores=%5B%7B%22type%22%3A%22integration%22%2C%22integrationSlug%22%3A%22upstash%22%2C%22productSlug%22%3A%22upstash-kv%22%7D%5D
```

The deploy flow automatically provisions an Upstash Redis instance and injects `REDIS_URL`. Vercel will ask for the remaining env-var values. We don't have the real Slack values yet — they come from B3 + B4. Use **placeholder strings** for now so env validation passes at boot:

```
SLACK_CLIENT_ID=placeholder
SLACK_CLIENT_SECRET=placeholder
SLACK_SIGNING_SECRET=placeholder
SLACK_ENCRYPTION_KEY=<paste output of: openssl rand -hex 32>
OPENAI_API_KEY=<paste your real OpenAI key>
IS_SELF_DEPLOYED=true
```

`IS_SELF_DEPLOYED=true` flips `/install` from the cloud marketing flow to the post-deploy setup wizard you'll use in B3. Docker-based hosts (Railway, Fly, Render, DO, AWS Lightsail, plain `docker compose`) get this set automatically via the Dockerfile — Vercel is the only host where you set it by hand.

`OPENAI_API_KEY` needs a real value from B1 — Pookie reads it at request time. `REDIS_URL` is provisioned automatically by the Upstash integration. The Slack ones can be junk strings during initial deploy because we only need `/api/slack/manifest` to work in B3, and that endpoint only reads `BASE_URL`. We'll replace the Slack placeholders with real values in B5.

`SLACK_ENCRYPTION_KEY` needs a **real** generated value upfront — it's the symmetric key used to encrypt OAuth tokens and MCP credentials before they're written to Redis. Generate it once with `openssl rand -hex 32` and treat it as a long-lived secret (rotating it makes previously stored tokens undecryptable, forcing every workspace to reinstall and re-enter MCP creds).

Per-workspace bot tokens (`xoxb-...`) come from OAuth when someone installs Pookie via `/api/slack/install` — there's no `SLACK_BOT_TOKEN` to configure manually.

#### Option 2 — Railway (one click, includes managed Redis)

```
https://railway.com/deploy/93SQTC?utm_medium=integration&utm_source=template&utm_campaign=installation_guide
```

The template provisions Pookie + Redis side-by-side. At the deploy form, fill in `OPENAI_API_KEY` and `SLACK_ENCRYPTION_KEY` (generate with `openssl rand -hex 32` — encrypts OAuth tokens and MCP creds in Redis, needs a real value upfront, not a placeholder). Leave the three `SLACK_*` placeholders at their defaults — they get real values in B5. `REDIS_URL` and `BASE_URL` auto-wire from Railway's variable references.

After the build finishes (~2 min), generate a public domain: Pookie service → **Settings** → **Networking** → **Generate Domain**. Railway doesn't provision a domain by default. The URL it hands back (e.g. `pookie-production-xxxx.up.railway.app`) is what the rest of these steps refer to.

#### Option 3 — Docker / Fly / Cloud Run / VPS

The repo ships a `Dockerfile` (Next.js standalone, ~150 MB image) and a `docker-compose.yml` that bundles Redis. Locally:

```bash
git clone https://github.com/millionco/pookie
cd pookie
OPENAI_API_KEY=... docker compose up
```

To run Node directly without Docker:

```bash
pnpm install
pnpm --filter api build
pnpm --filter api start
```

Either way, bind to `0.0.0.0:3000` and put it behind HTTPS. The webhook endpoint must be reachable from `slack.com` over the public internet.

For non-Vercel/non-Railway hosts, set `BASE_URL=https://your-pookie.example.com` explicitly — Pookie auto-derives this from `VERCEL_PROJECT_PRODUCTION_URL` and `RAILWAY_PUBLIC_DOMAIN`; everywhere else it's required. Same placeholder strategy as the other options: use `placeholder` for the Slack env vars during initial deploy and replace them in B5.

After deploy, **note the public URL** (e.g. `https://pookie-yourname.vercel.app` or `https://pookie.example.com`). You'll need it in every remaining step.

### B3. Generate the Slack manifest URL

Pookie's manifest endpoint bakes the user's deploy URL into the Slack app config. Have them open this in a browser:

```
https://THEIR-DEPLOY-URL/api/slack/manifest
```

The response is JSON like `{ "url": "https://api.slack.com/apps?new_app=1&manifest_json=..." }`.

Open the `url` value in a new tab. Slack's "Create app from manifest" page loads with everything pre-filled — name, scopes, event subscriptions, redirect URLs.

Click **Next**, then **Create**.

### B4. Grab Pookie's OAuth credentials from the Slack app

In the Slack app dashboard, go to **Basic Information** → **App Credentials** and copy the three OAuth values Pookie needs:

1. Click **Show** next to **Signing Secret**, copy. This is `SLACK_SIGNING_SECRET`.
2. Copy **Client ID**. This is `SLACK_CLIENT_ID`.
3. Copy **Client Secret**. This is `SLACK_CLIENT_SECRET`.

Pookie uses these to drive its own OAuth install flow (`/api/slack/install`), so per-workspace bot tokens (`xoxb-...`) get issued by Slack at install time and stored in Redis. You don't copy a bot token here.

**Never commit these values.** They go directly into the deploy host's encrypted env-var store.

### B5. Configure environment variables on the deploy

Set these on Vercel / Railway / Fly / wherever:

```env
SLACK_CLIENT_ID=...
SLACK_CLIENT_SECRET=...
SLACK_SIGNING_SECRET=...
REDIS_URL=redis://default:PASSWORD@HOST:PORT
OPENAI_API_KEY=sk-...

# Required on non-Vercel hosts (Vercel auto-derives from VERCEL_PROJECT_PRODUCTION_URL):
# BASE_URL=https://pookie.example.com

# Vercel only — Docker-based hosts get this from the Dockerfile automatically:
# IS_SELF_DEPLOYED=true

# Optional:
# SLACK_BOT_NAME=pookie                 # display name override
# CRON_SECRET=...                       # if you wire cron jobs later
```

**Redis**: any Redis-compatible URL works. Upstash free tier (https://upstash.com) is fine for getting started. Connection string format: `redis://default:PASSWORD@HOST:PORT` or with TLS `rediss://...`.

### B6. Redeploy

Env-var changes don't apply to running deployments — you have to restart. Per platform:

- **Vercel**: changing env vars does **not** auto-redeploy. Go to the Deployments tab → find the latest deployment → click the three-dot menu → **Redeploy** (or push an empty commit to retrigger CI).
- **Railway / Fly**: trigger a redeploy manually (`railway redeploy` / `fly deploy`).
- **Docker**: `docker compose up -d --force-recreate`.

Confirm the deployment shows the new env vars before moving on. On Vercel: open the Function logs and look for `Ready in Xms` after the redeploy timestamp.

### B7. Install Pookie into the workspace via OAuth

With real Slack credentials live, kick off the OAuth install:

```
https://THEIR-DEPLOY-URL/api/slack/install
```

Slack walks the user through workspace selection and scope approval, then redirects back. Pookie stores the issued bot token in Redis — there's no manual `xoxb-...` to paste.

### B8. Verify

1. Mention `@pookie` in a channel where the bot is a member (run `/invite @pookie` first if needed)
2. Pookie should reply within ~3 seconds
3. If silent: check the deploy logs

Common failure modes (in order of frequency):

| Symptom                                                     | Cause                                                                               | Fix                                                          |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Bot doesn't respond                                         | Forgot to `/invite @pookie`                                                         | Invite it                                                    |
| Bot doesn't respond                                         | Env vars not picked up                                                              | Force a redeploy (see B6)                                    |
| Bot doesn't respond                                         | Initial deploy still has `placeholder` Slack env vars from B2                       | Replace placeholders with real values from B4, then redeploy |
| Slack manifest creation fails with "url_verification" error | Deploy URL not reachable, returning non-200, or behind Vercel Deployment Protection | See B8a                                                      |
| OAuth install fails with `invalid_client_id`                | `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET` wrong or still `placeholder`              | Re-copy from Basic Information → App Credentials, redeploy   |
| Logs contain `invalid_auth` after install                   | The stored bot token in Redis was revoked (app uninstalled / reinstalled)           | Re-run `/api/slack/install` for that workspace               |
| Logs contain `invalid_signature`                            | `SLACK_SIGNING_SECRET` doesn't match the Slack app (or still `placeholder`)         | Re-copy from Basic Information, redeploy                     |
| AI calls fail with auth errors                              | `OPENAI_API_KEY` missing or invalid                                                 | Set a valid OpenAI key, redeploy                             |

#### B8a. Vercel Deployment Protection (very common)

If the Slack manifest creation fails on URL verification, and the user is on Vercel, the cause is usually **Deployment Protection** blocking Slack:

1. Vercel Dashboard → Project Settings → **Deployment Protection** → **Protection Bypass for Automation** → copy the secret
2. Add it as a query parameter to the manifest's webhook URL:

   ```
   https://pookie.example.com/api/webhooks/slack?x-vercel-protection-bypass=YOUR_SECRET
   ```

3. Edit the manifest in Slack's dashboard → App Manifest → JSON tab → paste updated manifest with the bypass URL → Save Changes

The bypass parameter only lets Slack through the deployment-protection wall. Pookie still validates every request via `SLACK_SIGNING_SECRET`. Rotate the bypass secret periodically since it lives in your Slack app config.

### B9. Stop here

Self-host install is **done**. The user has a fully isolated Pookie running on their infra. They own the tokens, the AI keys, the Slack app — nothing routes through Pookie's managed instance.

If they want to enable public distribution (so others can install **their** Pookie via OAuth), that's a separate maintainer task — point them at `https://api.slack.com/apps/{APP_ID}/distribute` → Manage Distribution → Activate Public Distribution.

---

## Reference

- Source: https://github.com/millionco/pookie
- Issues: https://github.com/millionco/pookie/issues
- Discord: https://discord.gg/hUesQBQGUn
- Manifest endpoint (returns Slack app create URL): `https://YOUR-DEPLOY/api/slack/manifest`
- OAuth install entry: `https://YOUR-DEPLOY/api/slack/install`
- OAuth callback: `https://YOUR-DEPLOY/api/slack/oauth`
- Webhook (Slack events + interactivity): `https://YOUR-DEPLOY/api/webhooks/slack`
- Post-install guide UI: `https://YOUR-DEPLOY/guide`
