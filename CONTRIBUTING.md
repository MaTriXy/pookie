# Contributing to Pookie

Thanks for your interest in contributing! Pookie is a Slack agent built on the [Chat SDK](https://www.chat-sdk.dev/). This guide covers what you need to start hacking on it.

## Code of Conduct

By participating, you agree to abide by our [Code of Conduct](./.github/CODE_OF_CONDUCT.md).

## Ways to contribute

- **Report a bug**: open an [issue](https://github.com/millionco/pookie/issues) with steps to reproduce.
- **Suggest a feature**: open an issue describing the use case before sending a PR.
- **Send a fix or feature**: fork the repo, branch, and open a PR (see below).
- **Improve the docs**: small wording / clarity fixes are very welcome.

## Prerequisites

- **Node.js** 20+
- **pnpm** 9+ (this is a pnpm monorepo)
- **[@antfu/ni](https://github.com/antfu-collective/ni)** (preferred): use `ni` to install, `nr <script>` to run

## Local setup

```bash
git clone https://github.com/millionco/pookie.git
cd pookie
ni            # or: pnpm install
nr build      # or: pnpm build
nr dev        # or: pnpm dev
```

To run Pookie end-to-end against a real Slack workspace, follow the [self-hosting guide](./apps/api/docs/SETUP.md).

## Development workflow

1. Create a branch off `main`: `git checkout -b your-name/short-description`
2. Make your changes. Keep the diff focused: one concern per PR.
3. `pnpm build` must complete before running tests or lints.
4. Run the checks below before pushing.
5. Add a changeset if your change affects a published package: `pnpm changeset`
6. Open a PR against `main`. Link any related issues.

### Required checks

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm format
```

Or run them all at once:

```bash
pnpm check    # lint + format + typecheck
```

## Code style

The full conventions live in [`AGENTS.md`](./AGENTS.md). The short version:

Lint and format are enforced by `vite-plus` (`vp`). `pnpm check` will catch most style issues.

## Pull request guidelines

- Use a clear, present-tense title (e.g. `fix: handle empty thread context`).
- Describe what changed and why, not just what.
- Include screenshots or short clips for UI changes.
- Make sure CI is green before requesting review.
- Be patient and kind in review. Same goes for maintainers.

## Questions

Open a [discussion](https://github.com/millionco/pookie/discussions), file an issue, or hop into our [Discord](https://discord.gg/hUesQBQGUn).
