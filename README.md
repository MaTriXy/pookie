# Pookie

Pookie is a Slack bot for searching your Slack.

Tag it in any channel or thread, and it replies with what you're looking for. It can also generate images, run Python on attached files, search the web, and connect to other tools through MCP.

[**View demo**](https://getpookie.com)

## Install

### 1. Managed

The hosted version of Pookie. Click the button, pick a workspace, approve the scopes. Good if you want to try it without setting up infra.

[<img alt="Add to Slack" height="40" width="139" src="https://platform.slack-edge.com/img/add_to_slack.png" srcset="https://platform.slack-edge.com/img/add_to_slack.png 1x, https://platform.slack-edge.com/img/add_to_slack@2x.png 2x" />](https://getpookie.com/api/slack/install)

### 2. Self-Hosted

Run Pookie on your own infra. Your Slack tokens, OpenAI key, and Redis stay with you. Good if you need data residency, an air-gapped network, or want to fork the agent.

#### Option 1: Vercel (one click, includes managed Redis)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fmillionco%2Fpookie&root-directory=apps%2Fapi&env=SLACK_CLIENT_ID,SLACK_CLIENT_SECRET,SLACK_SIGNING_SECRET,SLACK_ENCRYPTION_KEY,OPENAI_API_KEY,IS_SELF_DEPLOYED&stores=%5B%7B%22type%22%3A%22integration%22%2C%22integrationSlug%22%3A%22upstash%22%2C%22productSlug%22%3A%22upstash-kv%22%7D%5D)

Easiest if you already use Vercel. The deploy flow provisions an Upstash Redis instance and injects `REDIS_URL` for you.

Set these env vars before deploying:

- `OPENAI_API_KEY`: your OpenAI API key.
- `SLACK_ENCRYPTION_KEY`: a 32-byte hex string used to encrypt OAuth tokens and MCP credentials in Redis. Generate one with `openssl rand -hex 32`.
- `IS_SELF_DEPLOYED=true`: tells `/install` to show the post-deploy setup wizard instead of the cloud marketing flow. (Docker-based hosts below set this automatically via the Dockerfile.)

For the three Slack values (`SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_SIGNING_SECRET`), use placeholder strings on first deploy. You'll replace them after the bundled `/install` wizard creates your Slack app.

#### Option 2: Railway (one click, includes managed Redis)

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/93SQTC?utm_medium=integration&utm_source=template&utm_campaign=installation_guide)

Provisions Pookie + Redis on Railway. Provide an `OPENAI_API_KEY` and leave the Slack values at their defaults. You'll fill them in after the first deploy via the bundled `/install` wizard.

#### Option 3: Docker (Fly, Render, Cloud Run, your VPS)

The repo ships a standard `Dockerfile` (Next.js standalone) plus a `docker-compose.yml` that brings up Pookie + Redis locally:

```bash
git clone https://github.com/millionco/pookie
cd pookie
OPENAI_API_KEY=... docker compose up
# visit http://localhost:3000/install to wire up Slack
```

The same image runs on Fly.io, Render, Cloud Run, Kubernetes, or your own VPS.

#### Guided walkthrough

For anything bespoke, or to walk through the full setup with an agent:

```md
Fetch https://getpookie.com/install.md and help me install Pookie
```

That URL returns an agent skill covering both paths (managed and self-host). The agent will ask which one you want and walk you through it.

To follow the guide by hand, see [`apps/api/docs/install.md`](./apps/api/docs/install.md).

## Usage

In Slack:

```text
@pookie find the thread where ray shipped the new pricing page
@pookie summarize what happened in #eng-platform this week
@pookie what's our policy on travel reimbursements
```

In a DM you can skip the mention. Pookie also responds in any thread it has been pulled into.

To invite Pookie to a channel, run `/invite @pookie`. Pookie only sees channels it has been invited to.

### Slash commands

| Command                 | What it does                                                      |
| ----------------------- | ----------------------------------------------------------------- |
| `/help`                 | Summary of what Pookie can do.                                    |
| `/mcp-add <name> [url]` | Add an MCP server. Pass `--channel` or `--global` to share scope. |
| `/mcp-list`             | List connected MCP servers visible in this context.               |
| `/mcp-presets`          | Show built-in preset names.                                       |
| `/mcp-status`           | Check connection health for each connected server.                |
| `/mcp-remove <name>`    | Disconnect a server.                                              |

The combined form (`/mcp add <name>`, `/mcp list`, etc.) also works.

## Adding integrations via MCP

Pookie has presets for the most common Model Context Protocol servers. Run `/mcp-add <name>` and Pookie handles the OAuth handshake (or asks for a token, depending on the server):

| Preset                                   | Description                       | Auth  |
| ---------------------------------------- | --------------------------------- | ----- |
| [`linear`](https://linear.app)           | Linear projects, issues, cycles   | OAuth |
| [`github`](https://github.com)           | Repos, issues, PRs                | Token |
| [`sentry`](https://sentry.io)            | Errors, performance, releases     | OAuth |
| [`vercel`](https://vercel.com)           | Deployments, projects             | Token |
| [`stripe`](https://stripe.com)           | Payments, billing                 | OAuth |
| [`posthog`](https://posthog.com)         | Product analytics                 | OAuth |
| [`mercury`](https://mercury.com)         | Banking                           | OAuth |
| [`axiom`](https://axiom.co)              | Observability and logs            | OAuth |
| [`cloudflare`](https://cloudflare.com)   | Workers, DNS, API                 | OAuth |
| [`supabase`](https://supabase.com)       | Databases and projects            | OAuth |
| [`neon`](https://neon.tech)              | Postgres databases and branches   | OAuth |
| [`planetscale`](https://planetscale.com) | MySQL databases                   | OAuth |
| [`pagerduty`](https://pagerduty.com)     | Incident management               | OAuth |
| [`render`](https://render.com)           | Deployments and services          | OAuth |
| [`exa`](https://exa.ai)                  | Web search                        | OAuth |
| [`repogrep`](https://repogrep.com)       | Search across public GitHub repos | None  |

### Examples

Add an OAuth preset. Pookie replies with an authorization link the first time:

```text
/mcp-add linear
```

Add a token preset. Pass the token inline:

```text
/mcp-add github ghp_xxxxxxxxxxxxxxxxxxxx
/mcp-add vercel vercel_xxxxxxxxxxxxxxxxxxxx
```

Add more than one account of the same preset by appending an alias suffix:

```text
/mcp-add linear_personal
/mcp-add linear_work
/mcp-add github_oss ghp_xxxxxxxxxxxxxxxxxxxx
```

Add a server that isn't in the preset list:

```text
/mcp-add my-server https://my-server.example.com/mcp
```

Change scope. By default a connection is personal; pass `--channel` to share it with everyone in the current channel, or `--global` (admin only) to make it available workspace-wide:

```text
/mcp-add linear --channel
/mcp-add sentry --global
```

Manage existing connections:

```text
/mcp-list
/mcp-status
/mcp-remove linear_work
```

### Scopes

- **Personal** (default). Only you. Lives on your user.
- **Channel** (`--channel`). Anyone in the current channel.
- **Global** (`--global`). Available across the workspace. Slack workspace admins and owners only.

## Resources & Contributing Back

Want to try it? Check out [our demo](https://getpookie.com).

Looking to contribute? Check out the [Contributing Guide](./CONTRIBUTING.md).

Want to talk to the community? Hop in our [Discord](https://discord.gg/hUesQBQGUn) and share your ideas and what you've built with Pookie.

Find a bug? Head over to our [issue tracker](https://github.com/millionco/pookie/issues) and we'll do our best to help.

We expect all contributors to abide by the terms of our [Code of Conduct](./.github/CODE_OF_CONDUCT.md).

[**Start contributing on GitHub**](./CONTRIBUTING.md)

## License

Pookie is FSL-1.1-MIT-licensed open-source software. See [LICENSE](./LICENSE).
