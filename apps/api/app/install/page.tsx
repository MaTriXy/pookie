import { ExternalLinkIcon } from "lucide-react";
import { headers } from "next/headers";
import Link from "next/link";

import { env } from "@/env";
import { RAILWAY_TEMPLATE_URL, REPO_URL, SUPPORT_EMAIL } from "@/lib/constants";
import { detectHost, isSlackConfigured } from "@/lib/deployment";
import {
  buildSlackAppCreateUrl,
  createPookieManifest,
} from "@/server/slack/manifest";

import {
  ContentPanel,
  MockShell,
} from "../(website)/_components/pookie-mock-app";

import type { HostingPlatform } from "@/lib/deployment";

const REQUIRED_ENV_VARS = [
  "SLACK_CLIENT_ID",
  "SLACK_CLIENT_SECRET",
  "SLACK_SIGNING_SECRET",
  "OPENAI_API_KEY",
  "IS_SELF_DEPLOYED",
];

const UPSTASH_STORE = encodeURIComponent(
  JSON.stringify([
    {
      type: "integration",
      integrationSlug: "upstash",
      productSlug: "upstash-kv",
    },
  ]),
);

const VERCEL_DEPLOY_URL = `https://vercel.com/new/clone?repository-url=${encodeURIComponent(REPO_URL)}&root-directory=apps/api&env=${REQUIRED_ENV_VARS.join(",")}&envDescription=Slack%20OAuth%20client%20id%20%2B%20secret%20%2B%20signing%20secret%2C%20your%20OpenAI%20API%20key%2C%20and%20IS_SELF_DEPLOYED%3Dtrue&stores=${UPSTASH_STORE}`;

const SELF_HOST_ENV_SNIPPET = `SLACK_CLIENT_ID=...
SLACK_CLIENT_SECRET=...
SLACK_SIGNING_SECRET=...`;

// Read env at request time so the page reflects live config, not build-time
// dummy values baked in by the Dockerfile. Path B also needs request headers
// to derive the deployment's own origin for the Slack manifest.
export const dynamic = "force-dynamic";

const resolveOriginFromHeaders = async (): Promise<string> => {
  if (env.BASE_URL) return env.BASE_URL;
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
};

interface InstallPageProps {
  searchParams: Promise<{ setup?: string }>;
}

const Code = ({ children }: { children: React.ReactNode }) => (
  <code className="rounded bg-[#f0f0f0] px-1 py-0.5 text-[13px] text-[#1d1c1d]">
    {children}
  </code>
);

const PrimaryButton = ({
  href,
  children,
  external = false,
}: {
  href: string;
  children: React.ReactNode;
  external?: boolean;
}) => (
  <a
    href={href}
    className="inline-flex h-[33px] items-center gap-1.5 rounded-[6px] bg-[#007a5a] px-3 text-[14px] leading-none font-semibold text-white no-underline transition-colors hover:bg-[#005e45]"
    {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
  >
    {children}
  </a>
);

const OutlineButton = ({
  href,
  children,
  external = false,
}: {
  href: string;
  children: React.ReactNode;
  external?: boolean;
}) => (
  <a
    href={href}
    className="inline-flex h-[33px] items-center gap-1.5 rounded-[6px] border border-[#d7d7d7] bg-white px-3 text-[14px] leading-none font-semibold text-[#1d1c1d] no-underline transition-colors hover:bg-[#f8f8f8]"
    {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
  >
    {children}
  </a>
);

const StepBadge = ({ children }: { children: React.ReactNode }) => (
  <span className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-full bg-[#007a5a] text-[12px] font-semibold text-white">
    {children}
  </span>
);

const Divider = () => <hr className="border-t border-[#f0f0f0]" />;

const InstallPage = async ({ searchParams }: InstallPageProps) => {
  const slackConfigured = isSlackConfigured();
  const isSelfDeployed = env.IS_SELF_DEPLOYED;
  // Escape hatch for users whose env vars happen to look real (or who
  // pasted creds from the wrong app) but actually still need to create
  // the Slack app. SelfHostInstall links here when shape-validation can't
  // distinguish "configured" from "filled with wrong values".
  const forceSetup = (await searchParams).setup === "1";

  if (isSelfDeployed && (!slackConfigured || forceSetup)) {
    return <SelfHostSetupWizard />;
  }

  if (isSelfDeployed && slackConfigured) {
    return <SelfHostInstall />;
  }

  return <CloudInstall />;
};

const CloudInstall = () => (
  <MockShell activeChannel="install">
    <ContentPanel channelName="install">
      <div className="flex flex-col gap-8 text-[15px] leading-[23px] tracking-[-0.01em] text-[#4d4d4d]">
        <section className="flex flex-col gap-3">
          <h2 className="text-[17px] font-bold tracking-[-0.03em] text-[#1d1c1d]">
            Managed
          </h2>
          <p>
            One click, we host. Add Pookie via Slack OAuth — no infra, no env
            vars.
          </p>
          <div>
            <PrimaryButton href="/api/slack/install">
              Add to Slack →
            </PrimaryButton>
          </div>
        </section>

        <Divider />

        <section className="flex flex-col gap-3">
          <h2 className="text-[17px] font-bold tracking-[-0.03em] text-[#1d1c1d]">
            Self-host
          </h2>
          <p>
            Run Pookie on your own infra. Your keys, your Redis, your rules.
          </p>
          <div className="flex flex-wrap gap-2">
            <PrimaryButton href={VERCEL_DEPLOY_URL} external>
              Deploy to Vercel
            </PrimaryButton>
            <OutlineButton href={RAILWAY_TEMPLATE_URL} external>
              Deploy to Railway
            </OutlineButton>
            <OutlineButton href={REPO_URL} external>
              View on GitHub
            </OutlineButton>
          </div>
          <p className="text-[13px] text-[#888]">
            After deploy, visit <Code>/install</Code> on your URL to finish
            setup. You&apos;ll need <Code>REDIS_URL</Code>,{" "}
            <Code>OPENAI_API_KEY</Code>, and the three <Code>SLACK_*</Code>{" "}
            credentials.
          </p>
        </section>

        <Divider />

        <InstallFooter />
      </div>
    </ContentPanel>
  </MockShell>
);

const SelfHostInstall = () => (
  <MockShell activeChannel="install">
    <ContentPanel channelName="install">
      <div className="flex flex-col gap-8 text-[15px] leading-[23px] tracking-[-0.01em] text-[#4d4d4d]">
        <section className="flex flex-col gap-3">
          <p>
            Your self-hosted Pookie is configured. Add it to a Slack workspace
            via OAuth.
          </p>
          <div>
            <PrimaryButton href="/api/slack/install">
              Add to Slack →
            </PrimaryButton>
          </div>
          <p className="text-[13px] text-[#888]">
            Wrong credentials?{" "}
            <Link
              className="text-[#006fa8] underline underline-offset-2"
              href="/install?setup=1"
            >
              Redo setup
            </Link>
          </p>
        </section>

        <Divider />

        <InstallFooter />
      </div>
    </ContentPanel>
  </MockShell>
);

const SelfHostSetupWizard = async () => {
  const origin = await resolveOriginFromHeaders();
  const slackAppCreateUrl = buildSlackAppCreateUrl(
    createPookieManifest(new URL(origin)),
  );

  return (
    <MockShell activeChannel="install">
      <ContentPanel channelName="install">
        <div className="flex flex-col gap-8 text-[15px] leading-[23px] tracking-[-0.01em] text-[#4d4d4d]">
          <p>
            Deployment live at <Code>{origin}</Code>. Three steps to connect
            Slack.
          </p>

          <section className="flex flex-col gap-3">
            <h3 className="flex items-center gap-2 text-[15px] font-bold text-[#1d1c1d]">
              <StepBadge>1</StepBadge>
              Create your Slack app
            </h3>
            <p>
              Opens Slack with a pre-filled manifest pointing to{" "}
              <Code>{origin}</Code>.
            </p>
            <div>
              <PrimaryButton href={slackAppCreateUrl} external>
                Create Slack App →
              </PrimaryButton>
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h3 className="flex items-center gap-2 text-[15px] font-bold text-[#1d1c1d]">
              <StepBadge>2</StepBadge>
              Copy credentials
            </h3>
            <p>
              In <strong className="text-[#1d1c1d]">Basic Information</strong>{" "}
              on the Slack dashboard, grab:
            </p>
            <div className="flex flex-col gap-1 pl-1 font-mono text-[13px]">
              <span>
                Client ID → <Code>SLACK_CLIENT_ID</Code>
              </span>
              <span>
                Client Secret → <Code>SLACK_CLIENT_SECRET</Code>
              </span>
              <span>
                Signing Secret → <Code>SLACK_SIGNING_SECRET</Code>
              </span>
            </div>
            <div>
              <OutlineButton href="https://api.slack.com/apps" external>
                Slack dashboard <ExternalLinkIcon className="h-3.5 w-3.5" />
              </OutlineButton>
            </div>
          </section>

          <Step3Redeploy host={detectHost()} />

          <Divider />

          <InstallFooter />
        </div>
      </ContentPanel>
    </MockShell>
  );
};

const REDEPLOY_HEADING: Record<HostingPlatform, string> = {
  railway: "Set env vars in Railway",
  vercel: "Set env vars in Vercel",
  render: "Set env vars in Render",
  fly: "Set env vars on Fly",
  docker: "Update .env and restart",
};

const Step3Redeploy = ({ host }: { host: HostingPlatform }) => (
  <section className="flex flex-col gap-3">
    <h3 className="flex items-center gap-2 text-[15px] font-bold text-[#1d1c1d]">
      <StepBadge>3</StepBadge>
      {REDEPLOY_HEADING[host]}
    </h3>
    <RedeployBody host={host} />
    <p className="text-[13px] text-[#888]">
      After it boots, refresh this page to install.
    </p>
  </section>
);

const RedeployBody = ({ host }: { host: HostingPlatform }) => {
  if (host === "fly") {
    return (
      <pre className="overflow-x-auto rounded-lg bg-[#f7f7f7] px-4 py-3 font-mono text-[13px] leading-[20px] text-[#4d4d4d]">
        {`fly secrets set \\
  SLACK_CLIENT_ID=... \\
  SLACK_CLIENT_SECRET=... \\
  SLACK_SIGNING_SECRET=...`}
      </pre>
    );
  }
  if (host === "docker") {
    return (
      <>
        <pre className="overflow-x-auto rounded-lg bg-[#f7f7f7] px-4 py-3 font-mono text-[13px] leading-[20px] text-[#4d4d4d]">
          {SELF_HOST_ENV_SNIPPET}
        </pre>
        <pre className="overflow-x-auto rounded-lg bg-[#f7f7f7] px-4 py-3 font-mono text-[13px] leading-[20px] text-[#4d4d4d]">
          docker compose up -d --force-recreate
        </pre>
      </>
    );
  }
  const dashboardUrls: Record<string, string> = {
    railway: "https://railway.app/dashboard",
    vercel: "https://vercel.com/dashboard",
    render: "https://dashboard.render.com/",
  };
  return (
    <p>
      Paste the three values in your{" "}
      <a
        className="text-[#006fa8] underline underline-offset-2"
        href={dashboardUrls[host]}
        target="_blank"
        rel="noopener noreferrer"
      >
        {host} dashboard
      </a>{" "}
      → Environment Variables.{" "}
      {host === "vercel" ? "Then redeploy." : "Auto-redeploys."}
    </p>
  );
};

const LEGAL_LINKS = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/security", label: "Security" },
  { href: "/support", label: "Support" },
] as const;

const InstallFooter = () => (
  <footer className="flex flex-col gap-2 text-[13px] text-[#888]">
    <p>
      Stuck?{" "}
      <a
        href={`mailto:${SUPPORT_EMAIL}`}
        className="text-[#006fa8] underline underline-offset-2"
      >
        {SUPPORT_EMAIL}
      </a>
      {" · "}
      <a
        href={`${REPO_URL}/issues`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[#006fa8] underline underline-offset-2"
      >
        GitHub
      </a>
    </p>
    <nav className="flex flex-wrap items-center gap-x-3">
      {LEGAL_LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className="text-[#888] no-underline transition-colors hover:text-[#4d4d4d]"
        >
          {link.label}
        </Link>
      ))}
    </nav>
  </footer>
);

export default InstallPage;
