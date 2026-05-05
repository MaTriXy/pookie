import { DISCORD_URL, REPO_URL, SUPPORT_EMAIL } from "@/lib/constants";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Support | Pookie",
  description: `Get help with Pookie. Email ${SUPPORT_EMAIL} for product questions, bugs, billing, account deletion, and security reports. We aim to respond within two business days.`,
};

const SupportPage = () => (
  <>
    <header className="flex flex-col gap-1">
      <h1>Support</h1>
      <p className="text-xs!">Last updated May 3, 2026</p>
    </header>

    <p>
      Need help with Pookie? You don&apos;t need a GitHub account, a Discord
      account, or a paid plan to reach us. Email is the primary support channel
      and works for everyone.
    </p>

    <h2>Email support</h2>
    <p>
      Send a note to <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>{" "}
      from any email address. We aim to respond within two business days (Monday
      – Friday, US Pacific Time), and almost always sooner.
    </p>
    <p>So we can help you faster, please include:</p>
    <ul>
      <li>
        <strong>What you were trying to do</strong> and what happened instead
      </li>
      <li>
        <strong>Your Slack workspace name</strong> (or workspace ID if you
        prefer not to share the name)
      </li>
      <li>
        <strong>Approximate time</strong> the issue happened, with timezone
      </li>
      <li>
        <strong>Pookie&apos;s reply, if any</strong> — a screenshot or copy of
        the message helps us trace the request in our logs
      </li>
    </ul>

    <h2>What to email about</h2>
    <ul>
      <li>
        <strong>Bugs and unexpected behavior:</strong> Pookie said something
        wrong, didn&apos;t reply, posted in the wrong place, or stopped working
      </li>
      <li>
        <strong>Slack permissions and OAuth:</strong> trouble installing,
        re-installing, or removing Pookie from a workspace
      </li>
      <li>
        <strong>MCP and connected services:</strong> trouble adding, listing, or
        removing an MCP server connection
      </li>
      <li>
        <strong>Memory and configuration:</strong> requests to wipe
        Pookie&apos;s memory for your user, channel, or workspace
      </li>
      <li>
        <strong>Billing and account changes:</strong> upgrading, downgrading, or
        canceling a paid plan
      </li>
      <li>
        <strong>Account and data deletion:</strong> request a full deletion of
        your workspace&apos;s data
      </li>
      <li>
        <strong>Privacy and DPA requests:</strong> data subject requests,
        sub-processor lists, or signed agreements
      </li>
      <li>
        <strong>Enterprise inquiries:</strong> security questionnaires, SLA
        questions, or self-hosting support
      </li>
    </ul>

    <h2>Reporting a security issue</h2>
    <p>
      If you have found a security vulnerability, please follow the responsible
      disclosure process described in our{" "}
      <a href="/security">Security Policy</a> and email{" "}
      <code>{SUPPORT_EMAIL}</code> with the subject prefix{" "}
      <code>[security]</code>. We will acknowledge security reports within two
      business days and aim to provide a remediation timeline within five.
    </p>

    <h2>Other channels</h2>
    <p>
      Email is the only channel we commit to a response time on, but you can
      also reach us in these places. They&apos;re great for community questions,
      but we don&apos;t guarantee a reply on either:
    </p>
    <ul>
      <li>
        <strong>GitHub Issues</strong> for bug reports against the open-source
        repository, feature requests, and pull requests:{" "}
        <a
          href={`${REPO_URL}/issues`}
          target="_blank"
          rel="noopener noreferrer"
        >
          {REPO_URL.replace(/^https?:\/\//, "")}/issues
        </a>
      </li>
      <li>
        <strong>Discord</strong> for community discussion, tips, and
        show-and-tell:{" "}
        <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer">
          {DISCORD_URL.replace(/^https?:\/\//, "")}
        </a>
      </li>
    </ul>

    <h2>Status and known issues</h2>
    <p>
      If something feels broken at the platform level (Slack, Vercel, our
      hosting provider, or an upstream model provider), check those
      vendors&apos; status pages first, then email us so we can confirm whether
      it&apos;s affecting Pookie too.
    </p>

    <h2>Contact</h2>
    <p>
      For everything above:{" "}
      <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
    </p>
  </>
);

export default SupportPage;
