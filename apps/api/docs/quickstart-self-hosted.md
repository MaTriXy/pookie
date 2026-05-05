# Quickstart · Self-hosted

Run Pookie on your own infra. Three paths below. Pick one and follow it end to end. About fifteen minutes.

## Before you start

You'll need:

- A Slack workspace where you have permission to install apps.
- An OpenAI API key (`OPENAI_API_KEY`). Get one at [platform.openai.com/api-keys](https://platform.openai.com/api-keys).
- A Redis instance, only if you're deploying outside Vercel/Railway/Docker (which bundle their own). [Upstash](https://upstash.com) free tier is fine; grab the `rediss://` TCP URL.

## Deploy on Vercel

### 1. Click the deploy link

Open the [Vercel deploy link](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fmillionco%2Fpookie&root-directory=apps%2Fapi&env=SLACK_CLIENT_ID,SLACK_CLIENT_SECRET,SLACK_SIGNING_SECRET,SLACK_ENCRYPTION_KEY,OPENAI_API_KEY,IS_SELF_DEPLOYED&stores=%5B%7B%22type%22%3A%22integration%22%2C%22integrationSlug%22%3A%22upstash%22%2C%22productSlug%22%3A%22upstash-kv%22%7D%5D).

### 2. Fill in env vars

The deploy flow automatically provisions an Upstash Redis instance and injects `REDIS_URL`. Vercel asks for the remaining env vars. Use placeholders for the three `SLACK_*` values (replaced in step 5). `SLACK_ENCRYPTION_KEY` needs a real generated value upfront — encrypts OAuth tokens and MCP creds in Redis. Generate it with `openssl rand -hex 32`.

```
SLACK_CLIENT_ID=placeholder
SLACK_CLIENT_SECRET=placeholder
SLACK_SIGNING_SECRET=placeholder
SLACK_ENCRYPTION_KEY=<paste output of: openssl rand -hex 32>
OPENAI_API_KEY=sk-your-openai-key
IS_SELF_DEPLOYED=true
```

Click **Deploy**. Vercel hands you a URL like `pookie-yourname.vercel.app`. That's your deploy URL.

### 3. Create your Slack app

Visit `https://YOUR-DEPLOY-URL/install` in a browser. Pookie detects you're self-hosted and walks you through generating a Slack app manifest with your URLs baked in. Click through to Slack, click **Create App**.

### 4. Copy the OAuth credentials

In the Slack app dashboard, go to **Basic Information** → **App Credentials**. Copy these three values:

- **Client ID** → `SLACK_CLIENT_ID`
- **Client Secret** → `SLACK_CLIENT_SECRET`
- **Signing Secret** → `SLACK_SIGNING_SECRET`

### 5. Replace the placeholder env vars

In your Vercel project, **Settings** → **Environment Variables**, replace the three `SLACK_*` placeholders with the real values from step 4.

### 6. Redeploy

Vercel doesn't auto-redeploy on env-var changes. **Deployments** tab → latest deployment → three-dot menu → **Redeploy**.

### 7. Install Pookie into your Slack workspace

Open `https://YOUR-DEPLOY-URL/api/slack/install`. Slack walks through workspace selection and scope approval, then redirects back to your deploy.

### 8. Add Pookie to a channel

```
/invite @pookie
```

Pookie posts a hello on join. DMs work without invite.

### 9. Run `/onboarding`

```
/onboarding
```

Pookie posts an interactive card with one-click MCP server connectors (Linear, GitHub, Sentry, PostHog, etc.). Click the OAuth links to wire each one up.

### 10. Try your first query

```
@pookie what did we decide about the Q3 launch?
```

Pookie replies inline with sources cited. Done.

### Vercel-specific gotchas

If Slack manifest creation fails on URL verification, **Deployment Protection** is the usual culprit. Vercel Dashboard → Project Settings → **Deployment Protection** → **Protection Bypass for Automation** → copy the secret. Edit the manifest in Slack's dashboard → JSON tab → add `?x-vercel-protection-bypass=YOUR_SECRET` to the webhook URL → Save.

## Deploy on Railway

![Pookie Railway deploy walkthrough](/PookieRailwayDeploy.mp4)

### 1. Click the template

[One-click Railway template](https://railway.com/deploy/93SQTC?utm_medium=integration&utm_source=template&utm_campaign=installation_guide). Provisions Pookie + managed Redis side by side.

### 2. Fill in env vars

At the deploy form, use placeholders for the three `SLACK_*` values (replaced in step 5). `SLACK_ENCRYPTION_KEY` needs a real generated value upfront — encrypts OAuth tokens and MCP creds in Redis. Generate it with `openssl rand -hex 32`.

```
SLACK_CLIENT_ID=placeholder
SLACK_CLIENT_SECRET=placeholder
SLACK_SIGNING_SECRET=placeholder
SLACK_ENCRYPTION_KEY=<paste output of: openssl rand -hex 32>
OPENAI_API_KEY=sk-your-openai-key
```

`REDIS_URL`, `BASE_URL`, and `IS_SELF_DEPLOYED` auto-wire from Railway's variable references and the Dockerfile.

Click **Deploy** and wait for the build to finish.

### 3. Generate a public domain

Railway doesn't expose your service publicly by default. In the Railway dashboard, click your Pookie service → **Settings** → scroll to **Networking** → click **Generate Domain**. Railway hands back a URL like `pookie-production-xxxx.up.railway.app`. That's your deploy URL. Slack needs it to reach Pookie.

### 4. Create your Slack app

Visit `https://YOUR-DEPLOY-URL/install`. Pookie detects you're self-hosted and walks you through generating a Slack app manifest. Click through to Slack, click **Create App**.

### 5. Copy the OAuth credentials

In the Slack app dashboard: **Basic Information** → **App Credentials**. Copy:

- **Client ID** → `SLACK_CLIENT_ID`
- **Client Secret** → `SLACK_CLIENT_SECRET`
- **Signing Secret** → `SLACK_SIGNING_SECRET`

### 6. Replace the placeholder env vars

In Railway, click your Pookie service → **Variables** tab. Replace the three `SLACK_*` placeholders with the real values from step 5.

### 7. Redeploy

```
railway redeploy
```

Or trigger a redeploy from the Railway dashboard.

### 8. Install Pookie into your Slack workspace

Open `https://YOUR-DEPLOY-URL/api/slack/install`. Slack walks through workspace selection and scope approval.

### 9. Add Pookie to a channel

```
/invite @pookie
```

### 10. Run `/onboarding`

```
/onboarding
```

Click the OAuth links to connect MCP servers.

### 11. Try your first query

```
@pookie what did we decide about the Q3 launch?
```

## Deploy on Docker

For Docker on a VPS, Cloud Run, Fly, or any container host. Slack must be able to reach Pookie over public HTTPS, so you'll either need a real domain (VPS + Caddy/nginx; Cloud Run/Fly handle HTTPS automatically) or a tunnel like ngrok for local testing.

### 1. Clone and expose Pookie publicly

```bash
git clone https://github.com/millionco/pookie
cd pookie
```

Get a public HTTPS URL pointing at port `3000`. Pick one:

- **VPS:** put a reverse proxy (Caddy/nginx/Traefik) in front, point a domain at it.
- **Cloud Run / Fly:** the platform assigns a `*.run.app` / `*.fly.dev` URL.
- **Local dev:** `ngrok http 3000`. Copy the `https://*.ngrok-free.dev` URL.

Export it so the rest of the commands run as-is:

```bash
export BASE_URL=https://your-tunnel-or-domain.example.com
```

### 2. Create a `.env` file

`docker compose` auto-loads `.env` from the repo root. Copy the template and fill in real values:

```bash
cp .env.example .env
```

Edit `.env`. Use placeholders for the three `SLACK_*` values (replaced in step 5). `SLACK_ENCRYPTION_KEY` needs a real generated value upfront — encrypts OAuth tokens and MCP creds in Redis. Generate it with `openssl rand -hex 32`.

```
SLACK_CLIENT_ID=placeholder
SLACK_CLIENT_SECRET=placeholder
SLACK_SIGNING_SECRET=placeholder
SLACK_ENCRYPTION_KEY=<paste output of: openssl rand -hex 32>
OPENAI_API_KEY=sk-your-openai-key
BASE_URL=<paste the URL from step 1>
```

The Dockerfile sets `IS_SELF_DEPLOYED=true` automatically. The bundled `docker-compose.yml` provisions Redis on the side.

### 3. Start the stack

```bash
docker compose up -d --build
```

Verify:

```bash
curl $BASE_URL/api/health
# {"ok":true}
```

### 4. Create your Slack app

Open `$BASE_URL/install` in a browser. You'll see a setup wizard. Click **"Create Slack App"**. It opens slack.com with a pre-filled manifest pointing at your `BASE_URL`. Sign in and click **Create** to spin up a new Slack app.

> ⚠️ **Don't click any "Install to Workspace" button yet.** Pookie still has placeholder Slack creds, so the install would fail with `Invalid client_id`. Do steps 5–6 first.

### 5. Copy the Slack OAuth credentials into `.env`

On the new Slack app's dashboard: **Basic Information** → **App Credentials**. Replace the three placeholders in `.env`:

```
SLACK_CLIENT_ID=<paste Client ID>
SLACK_CLIENT_SECRET=<paste Client Secret>
SLACK_SIGNING_SECRET=<paste Signing Secret>
```

### 6. Recreate the container with the new env

```bash
docker compose up -d --force-recreate
```

### 7. Install Pookie into your Slack workspace

Open `$BASE_URL/api/slack/install`. Slack walks through workspace selection and scope approval, then redirects back to Pookie.

### 8. Add Pookie to a channel

In Slack:

```
/invite @pookie
```

### 9. Run `/onboarding`

```
/onboarding
```

Click the OAuth links to connect MCP servers.

### 10. Try your first query

```
@pookie what did we decide about the Q3 launch?
```

## Other hosts

Render, Fly.io, DigitalOcean, GCP Cloud Run, and AWS all run the same Pookie Docker image. The Slack flow (create app, copy creds, install to workspace) is identical to the Vercel/Railway sections above — only the deploy step differs. Env vars are the same everywhere:

```
SLACK_CLIENT_ID=placeholder
SLACK_CLIENT_SECRET=placeholder
SLACK_SIGNING_SECRET=placeholder
SLACK_ENCRYPTION_KEY=<paste output of: openssl rand -hex 32>
OPENAI_API_KEY=sk-your-openai-key
```

Replace the three `SLACK_*` placeholders after creating your Slack app. `SLACK_ENCRYPTION_KEY` needs a real generated value upfront — encrypts OAuth tokens and MCP creds in Redis.

### Render · one-click, includes managed Redis

```
https://render.com/deploy?repo=https://github.com/millionco/pookie
```

Uses `render.yaml` to provision a Docker web service plus a managed Key Value (Redis) instance. Provide `OPENAI_API_KEY` and `SLACK_ENCRYPTION_KEY`; leave the three `SLACK_*` placeholders alone. `BASE_URL` auto-derives from `RENDER_EXTERNAL_URL` at runtime. The deployed URL looks like `https://pookie-XXXX.onrender.com`.

### Fly.io · CLI, bring your own Redis

```bash
git clone https://github.com/millionco/pookie && cd pookie
fly launch --copy-config --no-deploy   # claims app name + region
fly redis create                       # provisions Upstash via Fly extension, sets REDIS_URL
fly secrets set OPENAI_API_KEY=...
fly secrets set SLACK_ENCRYPTION_KEY=$(openssl rand -hex 32)
fly deploy
```

`BASE_URL` auto-derives from `FLY_APP_NAME` to `https://<app>.fly.dev`. Set `BASE_URL` explicitly only if you front Pookie with a custom domain.

### DigitalOcean App Platform · one-click, bring your own Redis

```
https://cloud.digitalocean.com/apps/new?repo=https://github.com/millionco/pookie/tree/main
```

Uses `.do/deploy.template.yaml`. DO doesn't ship free managed Redis, so paste in an Upstash `REDIS_URL`. `BASE_URL` is wired via DO's `${APP_URL}` substitution.

### GCP Cloud Run · one-click, bring your own Redis

```
https://deploy.cloud.run/?git_repo=https://github.com/millionco/pookie
```

Builds the Dockerfile via Cloud Build. Use Upstash for Redis since Memorystore needs a Serverless VPC Connector that the button can't automate. Cloud Run doesn't expose its public URL in env, so after the first deploy copy `https://<service>-<hash>.run.app` and set it as a `BASE_URL` env var on the service, then redeploy.

### AWS · CloudFormation, Lightsail Containers

```
https://console.aws.amazon.com/cloudformation/home#/stacks/quickcreate?stackName=pookie&templateURL=https%3A%2F%2Fraw.githubusercontent.com%2Fmillionco%2Fpookie%2Fmain%2Faws%2Fcloudformation.yml
```

Provisions a Lightsail Container Service that pulls `ghcr.io/millionco/pookie:latest`. Cheapest viable AWS deploy (~$7/mo nano), automatic HTTPS, no VPC/ALB/ACM glue. Bring an Upstash `REDIS_URL`.

This is a **two-step deploy** because Lightsail's URL contains a random suffix only known after creation:

1. Click Launch Stack, fill in `RedisUrl`, `OpenaiApiKey`, and `SlackEncryptionKey` (output of `openssl rand -hex 32`); leave `BaseUrl` at its placeholder. Hit Create.
2. After ~5 min the stack reaches `CREATE_COMPLETE`. Read the `ServiceUrl` from the Outputs tab.
3. Update the stack with `BaseUrl` = that URL. Lightsail redeploys with the right URL.

## Common issues

| Symptom                                                    | Cause                                              | Fix                                                   |
| ---------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------- |
| Bot doesn't respond in a channel                           | Forgot `/invite @pookie`                           | Invite it                                             |
| Bot doesn't respond at all                                 | Env vars not picked up after redeploy              | Force a redeploy                                      |
| Bot still using `placeholder` Slack creds                  | Initial deploy values never replaced               | Replace with real values, redeploy                    |
| OAuth fails with `invalid_client_id`                       | Slack credentials wrong or still placeholder       | Re-copy from Slack's Basic Information page, redeploy |
| Logs show `invalid_signature`                              | `SLACK_SIGNING_SECRET` doesn't match the Slack app | Re-copy from Slack's Basic Information page, redeploy |
| AI calls fail with auth errors                             | No OpenAI key configured                           | Set `OPENAI_API_KEY`                                  |
| Slack manifest creation fails on URL verification (Vercel) | Deployment Protection blocking Slack               | See the Vercel-specific gotchas section above         |

## Stuck?

[File an issue on GitHub](https://github.com/millionco/pookie/issues) or jump in [Discord](https://discord.gg/hUesQBQGUn).
