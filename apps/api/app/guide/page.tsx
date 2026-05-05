import { CheckCircle2Icon, ExternalLinkIcon } from "lucide-react";
import Link from "next/link";

import { DISCORD_URL, REPO_URL } from "@/lib/constants";

import {
  ContentPanel,
  MockShell,
} from "../(website)/_components/pookie-mock-app";

interface GuidePageProps {
  searchParams: Promise<{
    team?: string;
    app?: string;
    team_name?: string;
  }>;
}

const Code = ({ children }: { children: React.ReactNode }) => (
  <code className="rounded bg-[#f0f0f0] px-1 py-0.5 text-[13px] text-[#393939]">
    {children}
  </code>
);

const StepBadge = ({ children }: { children: React.ReactNode }) => (
  <span className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-md bg-[#f0f0f0] text-[12px] font-semibold text-[#666]">
    {children}
  </span>
);

const GuidePage = async ({ searchParams }: GuidePageProps) => {
  const params = await searchParams;
  const slackDeepLink =
    params.team && params.app
      ? `slack://app?team=${encodeURIComponent(params.team)}&id=${encodeURIComponent(params.app)}&tab=home`
      : null;
  const teamLabel = params.team_name?.trim();

  return (
    <MockShell activeChannel="install">
      <ContentPanel channelName="install">
        <div className="flex flex-col gap-8 text-[14px] leading-[21px] text-[#4d4d4d]">
          <div className="flex flex-col gap-2">
            <span className="inline-flex w-fit items-center gap-1.5 rounded-md bg-[#007a5a] px-2 py-0.5 text-[12px] font-semibold text-white">
              <CheckCircle2Icon className="h-3 w-3" />
              Installed
            </span>
            <h2 className="text-[19px] font-semibold tracking-[-0.03em] text-[#393939]">
              Pookie is in {teamLabel || "your Slack"}
            </h2>
            <p className="text-[#666]">
              Three steps to start chatting with Pookie. Takes about thirty
              seconds.
            </p>
          </div>

          {slackDeepLink ? (
            <a
              href={slackDeepLink}
              className="inline-flex h-[33px] w-fit items-center gap-1.5 rounded-[6px] bg-[#007a5a] px-3 text-[14px] leading-none font-semibold text-white no-underline transition-colors hover:bg-[#005e45]"
            >
              Open Pookie in Slack →
            </a>
          ) : null}

          <hr className="border-t border-[#f0f0f0]" />

          <section className="flex flex-col gap-3">
            <h3 className="flex items-center gap-2 text-[15px] font-semibold text-[#393939]">
              <StepBadge>1</StepBadge>
              Invite Pookie to a channel
            </h3>
            <p className="text-[#666]">In any channel, type:</p>
            <pre className="overflow-x-auto rounded-lg bg-[#fafafa] px-4 py-3 font-mono text-[13px] text-[#555]">
              /invite @pookie
            </pre>
            <p className="text-[12px] text-[#999]">
              Or for DMs, just open a new direct message with{" "}
              <Code>@pookie</Code> from the sidebar.
            </p>
          </section>

          <hr className="border-t border-[#f0f0f0]" />

          <section className="flex flex-col gap-3">
            <h3 className="flex items-center gap-2 text-[15px] font-semibold text-[#393939]">
              <StepBadge>2</StepBadge>
              Tag Pookie with a question
            </h3>
            <p className="text-[#666]">
              Mention <Code>@pookie</Code> in any channel or thread. It reads
              the relevant context and replies inline.
            </p>
            <pre className="overflow-x-auto rounded-lg bg-[#fafafa] px-4 py-3 font-mono text-[13px] text-[#555]">{`@pookie what did we decide about the Q3 launch?
@pookie summarize this thread
@pookie find the design doc for billing v2`}</pre>
          </section>

          <hr className="border-t border-[#f0f0f0]" />

          <section className="flex flex-col gap-3">
            <h3 className="flex items-center gap-2 text-[15px] font-semibold text-[#393939]">
              <StepBadge>3</StepBadge>
              Try the slash commands
            </h3>
            <ul className="flex flex-col gap-2 text-[#666]">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-[#999]">💬</span>
                <Code>/help</Code> — see what Pookie can do
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-[#999]">🔌</span>
                <Code>/mcp</Code> — connect MCP servers to extend Pookie&apos;s
                tools
              </li>
            </ul>
          </section>

          <hr className="border-t border-[#f0f0f0]" />

          <div className="flex gap-3 rounded-lg bg-[#fafafa] px-4 py-3 text-[13px] text-[#666]">
            <CheckCircle2Icon className="mt-0.5 h-4 w-4 shrink-0 text-[#999]" />
            <span>
              <strong className="text-[#393939]">Privacy note: </strong>
              Pookie only reads channels you invite it to and messages where you
              tag it.
            </span>
          </div>

          <footer className="flex flex-wrap items-center gap-3 text-[12px] text-[#999]">
            <span>Need help?</span>
            <a
              href={`${REPO_URL}/issues`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[#666] underline underline-offset-2"
            >
              File an issue <ExternalLinkIcon className="h-3 w-3" />
            </a>
            <span aria-hidden>·</span>
            <a
              href={DISCORD_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[#666] underline underline-offset-2"
            >
              Discord <ExternalLinkIcon className="h-3 w-3" />
            </a>
          </footer>
        </div>
      </ContentPanel>
    </MockShell>
  );
};

export default GuidePage;
