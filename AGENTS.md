Pookie is a Slack AI teammate that answers questions, searches across Slack history and connected services, generates images, runs code, and remembers context across conversations.
Each workspace can customize Pookie's personality (cute / balanced / professional), connect external tools via MCP servers, and manage long-term memory — all configurable through slash commands.
Pookie uses OpenAI (GPT) under the hood with web search, image generation, code interpreter, and a deep multi-step search tool that spans Slack messages, threads, files, and any connected MCP data source.
Built as a Next.js app on the Vercel AI SDK and the Chat SDK for Slack.

## General Rules

- MUST: Use TypeScript interfaces over types.
- MUST: Keep all types in the global scope.
- MUST: Use arrow functions over function declarations
- MUST: Default to NO comments. Only add a comment when the user explicitly asks, or when the "why" is truly non-obvious - browser quirks, platform bugs, performance tradeoffs, fragile internal patching, or counter-intuitive design decisions. Never add comments that restate what the code does or what a well-named function/variable already conveys. When in doubt, leave the comment out.
- NEVER delete existing comments that explain "why" something exists (diagnostic logs, workaround rationale, design decisions, etc.). When refactoring around commented code, preserve the comment in its new location.
- MUST: Use kebab-case for files
- MUST: Use descriptive names for variables (avoid shorthands, or 1-2 character names).
  - Example: for .map(), you can use `innerX` instead of `x`
  - Example: instead of `moved` use `didPositionChange`
- MUST: Frequently re-evaluate and refactor variable names to be more accurate and descriptive.
- MUST: Do not type cast ("as") unless absolutely necessary
- MUST: Remove unused code and don't repeat yourself.
- MUST: Always search the codebase, think of many solutions, then implement the most _elegant_ solution.
- MUST: Put all magic numbers in `constants.ts` using `SCREAMING_SNAKE_CASE` with unit suffixes (`_MS`, `_PX`).
- MUST: Put small, focused utility functions in `utils/` with one utility per file.
- MUST: Use Boolean over !!.

## Testing

Run checks always before committing with:

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm format
```

## Development instructions

This is a pnpm monorepo with `apps/` (playgrounds, sites, extensions) and `packages/` (libraries, tools).

### Build before test

`pnpm build` must complete before `pnpm test` or `pnpm lint`. After modifying source files, always rebuild before running tests.

### Approved build scripts

The root `package.json` has `pnpm.onlyBuiltDependencies` configured for `@parcel/watcher`, `esbuild`, `sharp`, `spawn-sync`, and `unrs-resolver`. Without this, `pnpm install` silently skips their native builds and downstream packages may fail.

### Tooling

- **vite-plus** (`vp`) handles lint, format, and `check` (combined). Config lives in root `vite.config.ts`.
- **turbo** orchestrates builds across the monorepo. Config lives in `turbo.json`.
- **changesets** manages versioning and publishing. Run `pnpm changeset` to add a release note.

### Key commands reference

- **Install**: `ni` (or `pnpm install`)
- **Build**: `nr build` (or `pnpm build`)
- **Dev watch**: `nr dev` (or `pnpm dev`)
- **Test**: `pnpm test`
- **Lint**: `pnpm lint`
- **Lint fix**: `pnpm lint:fix`
- **Typecheck**: `pnpm typecheck`
- **Format**: `pnpm format`
- **Format check**: `pnpm format:check`
- **Combined check**: `pnpm check` (lint + format + typecheck via `vp check`)

## Agent skills

### Issue tracker

Issues and PRDs live as markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical roles, default strings (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
