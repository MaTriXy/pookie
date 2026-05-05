import { CheckCircle2Icon, ExternalLinkIcon } from "lucide-react";

import { DISCORD_URL, REPO_URL } from "@/lib/constants";

import {
  ContentPanel,
  MockShell,
} from "../(website)/_components/pookie-mock-app";
import { Mention } from "../(website)/_components/pookie-mock/mention";

interface GuidePageProps {
  searchParams: Promise<{
    team?: string;
    app?: string;
    team_name?: string;
  }>;
}

const InlineCode = ({ children }: { children: React.ReactNode }) => (
  <code className="rounded bg-[#f0f0f0] px-1.5 py-0.5 font-mono text-[0.85em] text-[#393939]">
    {children}
  </code>
);

const StepBadge = ({ children }: { children: React.ReactNode }) => (
  <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded bg-[#f0f0f0] text-[12px] font-bold text-[#1d1c1d]">
    {children}
  </span>
);

const SectionDivider = () => <hr className="border-t border-[#f0f0f0]" />;

const SectionHeading = ({
  step,
  children,
}: {
  step: number;
  children: React.ReactNode;
}) => (
  <h3 className="flex items-center gap-2 text-base leading-6 font-bold tracking-[-0.02em] text-[#1d1c1d]">
    <StepBadge>{step}</StepBadge>
    {children}
  </h3>
);

const BodyText = ({ children }: { children: React.ReactNode }) => (
  <p className="text-base leading-6 font-medium tracking-[-0.02em] text-[#4d4d4d]">
    {children}
  </p>
);

const CodeBlock = ({ children }: { children: React.ReactNode }) => (
  <pre className="overflow-x-auto rounded-lg bg-[#f7f7f7] px-4 py-3 font-mono text-[14px] leading-[20px] text-[#393939]">
    {children}
  </pre>
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
        <div className="flex flex-col gap-5 pt-1 pb-2">
          <div className="flex flex-col gap-3">
            <span className="inline-flex w-fit items-center gap-1.5 rounded-md bg-[#007a5a] px-2 py-0.5 text-[12px] leading-[18px] font-semibold text-white">
              <CheckCircle2Icon className="h-3 w-3" />
              Installed
            </span>
            <h2 className="text-base leading-6 font-bold tracking-[-0.02em] text-[#1d1c1d]">
              Pookie is in {teamLabel || "your Slack"}
            </h2>
            <BodyText>
              Three steps to start chatting with Pookie. Takes about thirty
              seconds.
            </BodyText>
          </div>

          {slackDeepLink ? (
            <a
              href={slackDeepLink}
              className="inline-flex h-[33px] w-fit items-center gap-1.5 rounded-[6px] bg-[#007a5a] px-3 text-[14px] leading-none font-semibold text-white no-underline transition-colors hover:bg-[#005e45]"
            >
              Open Pookie in Slack →
            </a>
          ) : null}

          <SectionDivider />

          <section className="flex flex-col gap-3">
            <SectionHeading step={1}>Invite Pookie to a channel</SectionHeading>
            <BodyText>In any channel, type:</BodyText>
            <CodeBlock>/invite @pookie</CodeBlock>
            <p className="text-[13px] leading-[19px] tracking-[-0.01em] text-[#717274]">
              Or for DMs, just open a new direct message with{" "}
              <Mention name="pookie" /> from the sidebar.
            </p>
          </section>

          <SectionDivider />

          <section className="flex flex-col gap-3">
            <SectionHeading step={2}>Tag Pookie with a question</SectionHeading>
            <BodyText>
              Mention <Mention name="pookie" /> in any channel or thread. It
              reads the relevant context and replies inline.
            </BodyText>
            <CodeBlock>{`@pookie what did we decide about the Q3 launch?
@pookie summarize this thread
@pookie find the design doc for billing v2`}</CodeBlock>
          </section>

          <SectionDivider />

          <section className="flex flex-col gap-3">
            <SectionHeading step={3}>Try the slash commands</SectionHeading>
            <ul className="flex flex-col gap-2 text-base leading-6 font-medium tracking-[-0.02em] text-[#4d4d4d]">
              <li className="flex items-center gap-2">
                <span aria-hidden>💬</span>
                <InlineCode>/help</InlineCode>
                <span>see what Pookie can do</span>
              </li>
              <li className="flex items-center gap-2">
                <span aria-hidden>🔌</span>
                <InlineCode>/mcp</InlineCode>
                <span>connect MCP servers to extend Pookie&apos;s tools</span>
              </li>
            </ul>
          </section>

          <SectionDivider />

          <div className="flex gap-3 rounded-lg bg-[#f7f7f7] px-4 py-3 text-[13px] leading-[19px] tracking-[-0.01em] text-[#4d4d4d]">
            <CheckCircle2Icon className="mt-0.5 h-4 w-4 shrink-0 text-[#717274]" />
            <span>
              <strong className="font-bold text-[#1d1c1d]">
                Privacy note:{" "}
              </strong>
              Pookie only reads channels you invite it to and messages where you
              tag it.
            </span>
          </div>

          <footer className="flex flex-wrap items-center gap-3 text-[13px] leading-[19px] text-[#717274]">
            <span>Need help?</span>
            <a
              href={`${REPO_URL}/issues`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[#006fa8] underline underline-offset-2 hover:no-underline"
            >
              File an issue <ExternalLinkIcon className="h-3 w-3" />
            </a>
            <span aria-hidden>·</span>
            <a
              href={DISCORD_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[#006fa8] underline underline-offset-2 hover:no-underline"
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
