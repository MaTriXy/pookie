# Slack Agent Docs (Chat SDK)

Instructions for building and deploying Slack agents on Vercel using the [Chat SDK](https://www.chat-sdk.dev/) — `chat` + `@chat-adapter/slack` running on Next.js.

> Adapted from [vercel-labs/slack-agent-skill](https://github.com/vercel-labs/slack-agent-skill). Bolt for JavaScript paths have been stripped — Chat SDK only.

## Layout

```
docs/slack/
├── SKILL.md                 # Main entry point — load this first
├── wizard/                  # 7-phase setup walkthrough
│   ├── 1-project-setup.md
│   ├── 1b-approve-plan.md
│   ├── 2-create-slack-app.md
│   ├── 3-configure-environment.md
│   ├── 4-test-locally.md
│   ├── 5-deploy-production.md
│   └── 6-setup-testing.md
├── reference/               # Deep-dive docs (load on demand)
│   ├── agent-archetypes.md
│   ├── ai-sdk.md
│   ├── env-vars.md
│   ├── slack-setup.md
│   └── vercel-setup.md
├── patterns/                # Pattern catalog
│   ├── slack-patterns.md
│   └── testing-patterns.md
└── templates/               # Copy-paste boilerplate
    ├── vitest.config.ts
    ├── test-setup.ts
    └── sample-tests/
        ├── agent.test.ts
        └── tools.test.ts
```

## How to Use

### Starting a New Project

Run the slash command:

```
/slack-agent
```

Or with arguments:

```
/slack-agent new       # Start fresh project
/slack-agent configure # Configure existing project
/slack-agent deploy    # Deploy to production
/slack-agent test      # Set up testing
```

The wizard will guide you through:

1. Custom implementation plan generation and approval
2. Project scaffolding (`create-next-app` + Chat SDK)
3. Slack app creation with customized manifest
4. Environment configuration
5. Local testing with ngrok
6. Production deployment to Vercel
7. Test framework setup

### Phase Detection

Check the project state to determine the appropriate starting phase:

| Condition                                      | Starting Phase                  |
| ---------------------------------------------- | ------------------------------- |
| No `package.json` with `chat`                  | Phase 1 — New project           |
| Has project but `manifest.json` not customized | Phase 2 — Create Slack app      |
| Has project but no `.env` file                 | Phase 3 — Configure environment |
| Has `.env` but not tested locally              | Phase 4 — Test locally          |
| Tested locally but not deployed                | Phase 5 — Deploy to production  |
| Deployed but no tests                          | Phase 6 — Set up testing        |

## Key Commands

```bash
# Development
pnpm dev              # Start local dev server (port 3000)
ngrok http 3000       # Expose local server

# Quality
pnpm lint             # Check linting
pnpm lint --write     # Auto-fix lint issues
pnpm typecheck        # TypeScript check
pnpm test             # Run tests

# Deployment
vercel                # Deploy to Vercel
vercel --prod         # Production deployment
```

## Quality Standards

- **Unit tests** for all exported functions
- **E2E tests** for user-facing changes
- **Linting** must pass (Biome)
- **TypeScript** must compile without errors
- **All tests** must pass before completion

## Environment Variables Summary

| Variable               | Required         | Where to Get It               |
| ---------------------- | ---------------- | ----------------------------- |
| `SLACK_BOT_TOKEN`      | Yes              | Slack App > Install App       |
| `SLACK_SIGNING_SECRET` | Yes              | Slack App > Basic Information |
| `OPENAI_API_KEY`       | Yes              | platform.openai.com/api-keys  |
| `REDIS_URL`            | Yes (production) | Upstash or any Redis provider |
| `NGROK_AUTH_TOKEN`     | Local only       | ngrok.com dashboard           |

## Related Resources

- [Chat SDK Documentation](https://www.chat-sdk.dev/)
- [AI SDK Documentation](https://ai-sdk.dev)
- [Slack API Documentation](https://api.slack.com)
- [Vercel Documentation](https://vercel.com/docs)
