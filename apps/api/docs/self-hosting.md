# Self-host Pookie

Pookie is a Slack bot that searches your Slack workspace. Tag `@pookie` in any channel, thread, or DM and it replies with relevant context. This guide walks through running Pookie on your own infrastructure — about 15 minutes start to finish.

If you'd rather use the hosted version, click "Add to Slack" on [getpookie.com](https://getpookie.com) and skip this whole page. Self-hosting is for users who want data residency, an air-gapped network, or to fork the agent.

When you self-host, your Slack tokens, OpenAI key, and Redis stay with you. Nothing transits Pookie's hosted instance.

---

## 1. Prerequisites

Before deploying, make sure you have:

- A Slack workspace where you can install apps
- A host. Pookie ships first-party templates for **Vercel**, **Railway**, **Render**, **Fly.io**, **DigitalOcean App Platform**, **GCP Cloud Run**, **AWS** (Lightsail Containers via CloudFormation), or **Docker** on any VPS (Hetzner, EC2, Coolify, etc.).
- A Redis instance. Railway and Render provision one in the deploy template; everywhere else, bring your own — [Upstash](https://upstash.com) free tier works.
- An **OpenAI API key** (`OPENAI_API_KEY`) — [platform.openai.com](https://platform.openai.com/api-keys)

If you want to swap in a different model provider, you'll need to edit the model strings and provider client in `apps/api/server/agent/`.

---

## 2. Deploy Pookie

Pick whichever host fits your stack. Pookie auto-derives `BASE_URL` on Vercel, Railway, Render, and Fly — on those, you only need to provide an OpenAI key (and a Redis URL on hosts that don't bundle one).

### Vercel — one click, includes managed Redis

```
https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fmillionco%2Fpookie&root-directory=apps%2Fapi&env=SLACK_CLIENT_ID,SLACK_CLIENT_SECRET,SLACK_SIGNING_SECRET,OPENAI_API_KEY,IS_SELF_DEPLOYED&stores=%5B%7B%22type%22%3A%22integration%22%2C%22integrationSlug%22%3A%22upstash%22%2C%22productSlug%22%3A%22upstash-kv%22%7D%5D
```

The deploy flow automatically provisions an Upstash Redis instance and injects `REDIS_URL`. Vercel will ask for the remaining env-var values. The real Slack values come later (Step 4). For now, use placeholder strings so env validation passes at boot:

```
SLACK_CLIENT_ID=placeholder
SLACK_CLIENT_SECRET=placeholder
SLACK_SIGNING_SECRET=placeholder
OPENAI_API_KEY=<your real OpenAI key>
IS_SELF_DEPLOYED=true
```

`IS_SELF_DEPLOYED=true` switches `/install` to the post-deploy setup wizard (Step 3). Docker-based hosts (Railway, Fly, Render, DO, AWS, plain Docker) get it automatically via the Dockerfile — Vercel is the only host where you set it by hand.

`OPENAI_API_KEY` needs a real value now. `REDIS_URL` is provisioned automatically by the Upstash integration. Slack values can be junk strings — `/api/slack/manifest` only reads `BASE_URL`. You'll replace the placeholders in Step 5.

Per-workspace bot tokens (`xoxb-...`) come from OAuth at install time; there's no `SLACK_BOT_TOKEN` to configure manually.

### Railway — one click, includes managed Redis

```
https://railway.com/deploy/93SQTC?utm_medium=integration&utm_source=template&utm_campaign=installation_guide
```

The template provisions Pookie + Redis side-by-side. Fill in `OPENAI_API_KEY`; leave the Slack placeholders alone. `REDIS_URL` and `BASE_URL` auto-wire from Railway's variable references. After the build finishes, generate a public domain: Pookie service → **Settings** → **Networking** → **Generate Domain**. Railway hands back a URL like `pookie-production-xxxx.up.railway.app`.

### Render — one click, includes managed Redis

```
https://render.com/deploy?repo=https://github.com/millionco/pookie
```

Uses `render.yaml` to provision a Docker web service plus a managed Key Value (Redis) instance. Provide `OPENAI_API_KEY`; leave Slack placeholders alone. `BASE_URL` auto-derives from `RENDER_EXTERNAL_URL` at runtime. The deployed URL looks like `https://pookie-XXXX.onrender.com`.

### Fly.io — CLI, bring your own Redis

```bash
git clone https://github.com/millionco/pookie && cd pookie
fly launch --copy-config --no-deploy   # claims app name + region
fly redis create                       # provisions Upstash via Fly extension, sets REDIS_URL
fly secrets set OPENAI_API_KEY=...
fly deploy
```

`BASE_URL` auto-derives from `FLY_APP_NAME` to `https://<app>.fly.dev`. Set `BASE_URL` explicitly only if you front Pookie with a custom domain.

### DigitalOcean App Platform — one click, bring your own Redis

```
https://cloud.digitalocean.com/apps/new?repo=https://github.com/millionco/pookie/tree/main
```

Uses `.do/deploy.template.yaml`. DO doesn't ship free managed Redis, so paste in an Upstash `REDIS_URL`. `BASE_URL` is wired via DO's `${APP_URL}` substitution.

### GCP Cloud Run — one click, bring your own Redis

```
https://deploy.cloud.run/?git_repo=https://github.com/millionco/pookie
```

Builds the Dockerfile via Cloud Build. Use Upstash for Redis — Memorystore needs a Serverless VPC Connector that the button can't automate. Cloud Run doesn't expose its public URL in env, so after the first deploy copy `https://<service>-<hash>.run.app` and set it as a `BASE_URL` env var on the service, then redeploy.

### AWS — CloudFormation, Lightsail Containers

```
https://console.aws.amazon.com/cloudformation/home#/stacks/quickcreate?stackName=pookie&templateURL=https%3A%2F%2Fraw.githubusercontent.com%2Fmillionco%2Fpookie%2Fmain%2Faws%2Fcloudformation.yml
```

Provisions a Lightsail Container Service that pulls `ghcr.io/millionco/pookie:latest`. Cheapest viable AWS deploy (~$7/mo nano), automatic HTTPS, no VPC/ALB/ACM glue. Bring an Upstash `REDIS_URL`.

This is a **two-step deploy** because Lightsail's URL contains a random suffix only known after creation:

1. Click Launch Stack, fill in `RedisUrl` + `OpenaiApiKey`, leave `BaseUrl` at its placeholder, hit Create.
2. After ~5 min the stack reaches `CREATE_COMPLETE`. Read the `ServiceUrl` from the Outputs tab.
3. Update the stack with `BaseUrl` = that URL. Lightsail redeploys with the right URL.

### Docker on your own VPS — Hetzner, EC2, Lightsail VM, Coolify, anything

The repo ships a `Dockerfile` and a `docker-compose.yml` that bundles Pookie + Redis. Public image: `ghcr.io/millionco/pookie:latest` (multi-arch, amd64 + arm64).

Local dev:

```bash
git clone https://github.com/millionco/pookie && cd pookie
OPENAI_API_KEY=... docker compose up
```

Production VPS — install Docker + Caddy, then:

```bash
git clone https://github.com/millionco/pookie && cd pookie
cat > .env <<EOF
BASE_URL=https://pookie.example.com
OPENAI_API_KEY=...
EOF
docker compose --env-file .env up -d
```

`/etc/caddy/Caddyfile`:

```caddyfile
pookie.example.com {
  reverse_proxy localhost:3000
}
```

To run Node directly without Docker:

```bash
pnpm install && pnpm --filter api build && pnpm --filter api start
```

Either way, bind to `0.0.0.0:3000` and put it behind HTTPS. The webhook endpoint must be reachable from `slack.com` over the public internet.

For Cloud Run, AWS, DO, Hetzner, EC2 — set `BASE_URL=https://your-pookie.example.com` explicitly. Vercel, Railway, Render, and Fly auto-derive it.

After deploy, **note the public URL** (e.g. `https://pookie-yourname.vercel.app` or `https://pookie.example.com`). You'll need it in every remaining step.

---

## 3. Generate the Slack manifest URL

Pookie's manifest endpoint bakes your deploy URL into the Slack app config. Open this in a browser:

```
https://YOUR-DEPLOY-URL/api/slack/manifest
```

The response is JSON like `{ "url": "https://api.slack.com/apps?new_app=1&manifest_json=..." }`.

Open the `url` value in a new tab. Slack's "Create app from manifest" page loads with everything pre-filled — name, scopes, event subscriptions, redirect URLs. Click **Next**, then **Create**.

---

## 4. Grab Pookie's OAuth credentials

In the Slack app dashboard, go to **Basic Information** → **App Credentials** and copy three values:

1. **Signing Secret** (click **Show**, copy) → `SLACK_SIGNING_SECRET`
2. **Client ID** → `SLACK_CLIENT_ID`
3. **Client Secret** → `SLACK_CLIENT_SECRET`

Pookie uses these to drive its own OAuth install flow at `/api/slack/install`. Per-workspace bot tokens (`xoxb-...`) are issued by Slack at install time and stored in Redis — you don't copy a bot token here.

**Never commit these values.** They go directly into your deploy host's encrypted env-var store.

---

## 5. Configure environment variables

Set these on your deploy host:

```env
SLACK_CLIENT_ID=...
SLACK_CLIENT_SECRET=...
SLACK_SIGNING_SECRET=...
REDIS_URL=redis://default:PASSWORD@HOST:PORT
OPENAI_API_KEY=sk-...

# Required on Cloud Run, AWS, DO, Hetzner, EC2 (Vercel, Railway, Render, Fly auto-derive):
# BASE_URL=https://pookie.example.com

# Vercel only — Docker-based hosts (Railway, Fly, Render, DO, AWS, plain Docker)
# get this from the Dockerfile automatically:
# IS_SELF_DEPLOYED=true

# Optional:
# SLACK_BOT_NAME=pookie                 # display name override
# CRON_SECRET=...                       # if you wire cron jobs later

# GitHub OAuth (optional — enables one-click GitHub MCP connection):
# GITHUB_CLIENT_ID=Ov23li...
# GITHUB_CLIENT_SECRET=...
```

**Redis**: any Redis-compatible URL works. [Upstash](https://upstash.com) free tier is fine. Connection string format: `redis://default:PASSWORD@HOST:PORT` or with TLS `rediss://...`.

**GitHub OAuth (optional)**: to let users connect GitHub via OAuth instead of personal access tokens:

1. Go to [github.com/settings/developers](https://github.com/settings/developers) → **New OAuth App**
2. Set **Authorization callback URL** to `https://YOUR-DEPLOY-URL/api/mcp/oauth/callback/github`
3. Copy **Client ID** and **Client Secret**
4. Set `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` env vars on your deploy host

Without these, users can still connect GitHub using a personal access token via `/mcp add github <token>`.

---

## 6. Redeploy

Env-var changes don't apply to running deployments — you have to restart. Per platform:

- **Vercel** — env-var changes do **not** auto-redeploy. Deployments tab → latest deployment → three-dot menu → **Redeploy**, or push an empty commit to retrigger CI.
- **Railway / Fly** — `railway redeploy` / `fly deploy`.
- **Render** — env-var changes auto-redeploy. Watch the Events tab.
- **DigitalOcean App Platform** — env-var changes auto-redeploy.
- **GCP Cloud Run** — editing env vars on a service creates a new revision automatically.
- **AWS (Lightsail Containers via CFN)** — update the CloudFormation stack with the new parameter values; Lightsail rolls a new container deployment.
- **Docker** — `docker compose up -d --force-recreate`.

Confirm the deployment shows the new env vars before moving on. On Vercel: open the Function logs and look for `Ready in Xms` after the redeploy timestamp.

---

## 7. Install Pookie into your workspace

With real Slack credentials live, kick off the OAuth install:

```
https://YOUR-DEPLOY-URL/api/slack/install
```

Slack walks you through workspace selection and scope approval, then redirects back. Pookie stores the issued bot token in Redis — there's no manual `xoxb-...` to paste.

---

## 8. Verify

1. Mention `@pookie` in a channel where the bot is a member (run `/invite @pookie` first if needed)
2. Pookie should reply within ~3 seconds
3. If silent: check the deploy logs

Common failure modes, in order of frequency:

| Symptom                                                     | Cause                                                                               | Fix                                                        |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Bot doesn't respond                                         | Forgot to `/invite @pookie`                                                         | Invite it                                                  |
| Bot doesn't respond                                         | Env vars not picked up                                                              | Force a redeploy (see Step 6)                              |
| Bot doesn't respond                                         | Initial deploy still has `placeholder` Slack env vars from Step 2                   | Replace with real values from Step 4, redeploy             |
| Slack manifest creation fails with `url_verification` error | Deploy URL not reachable, returning non-200, or behind Vercel Deployment Protection | See "Vercel Deployment Protection" below                   |
| OAuth install fails with `invalid_client_id`                | `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET` wrong or still `placeholder`              | Re-copy from Basic Information → App Credentials, redeploy |
| Logs contain `invalid_auth` after install                   | Stored bot token in Redis was revoked (app uninstalled / reinstalled)               | Re-run `/api/slack/install` for that workspace             |
| Logs contain `invalid_signature`                            | `SLACK_SIGNING_SECRET` doesn't match the Slack app (or still `placeholder`)         | Re-copy from Basic Information, redeploy                   |
| AI calls fail with auth errors                              | `OPENAI_API_KEY` missing or invalid                                                 | Set a valid OpenAI key, redeploy                           |

### Vercel Deployment Protection (very common)

If the Slack manifest creation fails on URL verification and you're on Vercel, the cause is usually **Deployment Protection** blocking Slack:

1. Vercel Dashboard → Project Settings → **Deployment Protection** → **Protection Bypass for Automation** → copy the secret
2. Add it as a query parameter to the manifest's webhook URL:
   ```
   https://pookie.example.com/api/webhooks/slack?x-vercel-protection-bypass=YOUR_SECRET
   ```
3. Edit the manifest in Slack's dashboard → App Manifest → JSON tab → paste updated manifest with the bypass URL → Save Changes

The bypass parameter only lets Slack through the deployment-protection wall. Pookie still validates every request via `SLACK_SIGNING_SECRET`. Rotate the bypass secret periodically since it lives in your Slack app config.

---

## Done

You have a fully isolated Pookie running on your infra. You own the tokens, the OpenAI key, the Slack app — nothing routes through Pookie's managed instance.

If you want to enable public distribution (so others can install **your** Pookie via OAuth), point at `https://api.slack.com/apps/{APP_ID}/distribute` → Manage Distribution → Activate Public Distribution.

---

## Reference

- Source: [github.com/millionco/pookie](https://github.com/millionco/pookie)
- Issues: [github.com/millionco/pookie/issues](https://github.com/millionco/pookie/issues)
- Discord: [discord.gg/hUesQBQGUn](https://discord.gg/hUesQBQGUn)
- Manifest endpoint: `https://YOUR-DEPLOY/api/slack/manifest`
- OAuth install entry: `https://YOUR-DEPLOY/api/slack/install`
- OAuth callback: `https://YOUR-DEPLOY/api/slack/oauth`
- Webhook (Slack events + interactivity): `https://YOUR-DEPLOY/api/webhooks/slack`
- Post-install guide UI: `https://YOUR-DEPLOY/guide`
