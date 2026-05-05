import { DISCORD_URL, REPO_URL } from "@/lib/constants";

export const GET = (request: Request) => {
  const origin = new URL(request.url).origin;
  const content = `# Pookie

> AI agent that searches your Slack workspace. Tag @pookie in any channel or thread and it replies with relevant context from Slack history. Open source, self-hostable, MIT-licensed.

> Each guide URL serves HTML to browsers and \`text/markdown\` to anything that asks (\`Accept: text/markdown\`). No \`.md\` suffix needed.

## Install

- [Install guide](${origin}/install): Agent skill that walks the install end to end. Branches into managed (one-click OAuth) or self-host (~15 minutes on your own infra). The self-host branch (Path B) covers Slack app creation via the manifest URL.
- [Self-hosting guide](${origin}/self-hosting): Host setup walkthrough across Vercel / Railway / Fly / Render / DigitalOcean / Cloud Run / AWS / Docker on a VPS.

## Docs

- [Quickstart · Managed](${origin}/docs/quickstart-managed): Human-facing quickstart for the hosted version. OAuth install, /invite, /onboarding with MCP scope explanation, first query.
- [Quickstart · Self-hosted](${origin}/docs/quickstart-self-hosted): Human-facing quickstart for self-hosting. Railway / Vercel / Docker deploy options, Slack app creation, env vars, OAuth install, troubleshooting.

## Endpoints

- [Managed OAuth entry](${origin}/api/slack/install): Redirects to Slack OAuth consent. The "Add to Slack" button target.
- [Slack manifest](${origin}/api/slack/manifest): Returns a JSON \`{ url }\` pointing to Slack's "Create app from manifest" page with this deploy's URLs baked in. Used by self-hosters in Path B Step 3.
- [Webhook](${origin}/api/webhooks/slack): Slack events + interactivity ingress.
- [OAuth callback](${origin}/api/slack/oauth): Handles Slack's OAuth code exchange.

## UI

- [Landing page](${origin}/): Marketing page with feature overview and FAQ.
- [Post-install guide](${origin}/guide): Lands here after a successful managed OAuth install.

## Resources

- [GitHub](${REPO_URL}): Source, issues, contribution guide.
- [Discord](${DISCORD_URL}): Community.
`;

  return new Response(content, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "private, max-age=60",
    },
  });
};
