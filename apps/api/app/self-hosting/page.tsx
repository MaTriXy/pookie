import { readFileSync } from "node:fs";
import { join } from "node:path";

import { MarkdownContent } from "@/components/markdown-content";

import {
  ContentPanel,
  MockShell,
} from "../(website)/_components/pookie-mock-app";

import type { Metadata } from "next";

// Read once at module load — the markdown is part of the deploy bundle and
// pinned to the build via outputFileTracingIncludes in next.config.ts.
const CONTENT = readFileSync(
  join(process.cwd(), "docs", "self-hosting.md"),
  "utf-8",
);

export const metadata: Metadata = {
  title: "Self-host Pookie",
  description:
    "Run Pookie on your own infra. Vercel, Railway, Render, Fly, DigitalOcean, Cloud Run, AWS, or Docker on any VPS. About 15 minutes start to finish.",
};

const SelfHostingPage = () => (
  <MockShell activeChannel="docs">
    <ContentPanel channelName="docs">
      <article>
        <MarkdownContent content={CONTENT} />
      </article>
    </ContentPanel>
  </MockShell>
);

export default SelfHostingPage;
