# Quickstart · Managed

The hosted version. About thirty seconds, no infra. Pookie runs on our servers; you install it to your Slack workspace via OAuth.

## 1. Install the Slack app

Open [getpookie.com/api/slack/install](https://getpookie.com/api/slack/install).

Slack walks you through:

1. Pick the workspace to install Pookie in.
2. Approve the bot scopes (read messages where you tag Pookie, post replies, search workspace history, write canvas/files).
3. Slack redirects you to a guide page, which deep-links you back into Slack.

If you bounce out partway through, just open the install URL again.

## 2. Add Pookie to a channel

Pookie only sees channels it's invited to. In any channel you want it active in, run:

```
/invite @pookie
```

Pookie posts a short hello on join. The first time you invite it to any channel, you'll get a longer help message walking through the basics.

DMs work without the invite step. Open a new direct message with `@pookie` from the sidebar and start chatting.

## 3. Run `/onboarding`

In Slack, run:

```
/onboarding
```

Pookie replies with an interactive card listing the most common MCP servers (Linear, GitHub, Sentry, PostHog, Vercel, Supabase, and more). Click the OAuth link next to any server to connect it. GitHub uses a personal access token instead, paste it inline.

### Permission scopes

When you connect an MCP server, you choose who can use it:

- **Personal** (default): only you. Your tokens, your data. Use this for personal accounts like your own Linear.
- **`--channel`**: anyone in the current channel. Use for shared accounts: a team Sentry, a project's GitHub org.
- **`--global`**: anyone in the workspace. Admins only.

The same flags work directly with `/mcp-add`:

```
/mcp-add linear              # personal
/mcp-add sentry --channel    # shared with this channel
/mcp-add github --global     # workspace-wide (admin only)
```

To connect the same preset twice (e.g. personal and work Linear accounts), use an alias suffix:

```
/mcp-add linear_personal
/mcp-add linear_work
```

For custom MCP servers that aren't in the preset list, pass a URL:

```
/mcp-add my-server https://my-server.example.com/mcp
```

## 4. Try your first query

Tag Pookie in a channel where it's a member, or DM it directly:

```
@pookie what did we decide about the Q3 launch?
@pookie summarize this thread
@pookie find the design doc for billing v2
```

Pookie replies inline and cites the messages it read.

## Slash commands

- `/help`: overview of what Pookie does
- `/onboarding`: connect MCP tools
- `/mcp-add`, `/mcp-list`, `/mcp-status`, `/mcp-remove`, `/mcp-presets`: manage MCP servers
- `/pookie-config`: set personality (`cute` / `balanced` / `professional`) and other behavior

## Stuck?

[File an issue on GitHub](https://github.com/millionco/pookie/issues) or jump in [Discord](https://discord.gg/hUesQBQGUn).
