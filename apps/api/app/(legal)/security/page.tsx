import { SUPPORT_EMAIL } from "@/lib/constants";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Security Policy | Pookie",
  description:
    "How Pookie protects Slack workspace data: least-privilege access, encrypted transport and storage, signed webhooks, no model training on customer content, and responsible disclosure.",
};

const SecurityPage = () => (
  <>
    <header className="flex flex-col gap-1">
      <h1>Security Policy</h1>
      <p className="text-xs!">Last updated May 3, 2026</p>
    </header>

    <p>
      Pookie is a Slack-native AI teammate built by Million Software, Inc. Slack
      workspaces trust Pookie with conversations, files, and credentials for
      connected tools, so we treat security as a product requirement, not an
      afterthought. This page describes what we do today, what data we handle,
      and how to report a problem.
    </p>

    <h2>1. What Slack data Pookie sees</h2>
    <p>
      Pookie is read-on-demand, not an indexer. We do not crawl your workspace,
      we do not build a long-running search index of your messages, and we do
      not pull message history into background jobs.
    </p>
    <ul>
      <li>
        <strong>Channels:</strong> Pookie can only read channels it has been
        explicitly invited to. Inviting Pookie is a per-channel decision made by
        a workspace member.
      </li>
      <li>
        <strong>Direct messages and threads:</strong> Pookie reads a
        conversation only when a user opens a DM with it, mentions it with{" "}
        <code>@pookie</code>, or invokes one of its slash commands.
      </li>
      <li>
        <strong>Search:</strong> Slack search scopes (
        <code>search:read.public</code>, <code>search:read.users</code>, and
        related) are used to fulfill a user&apos;s explicit request. Searches
        run live against Slack&apos;s API; results are not persisted beyond the
        lifetime of the request that asked for them.
      </li>
      <li>
        <strong>Files:</strong> File scopes are used only when a user shares a
        file with Pookie or asks it to operate on one. Files are streamed,
        processed, and discarded.
      </li>
      <li>
        <strong>User profiles:</strong> Pookie reads user profile data (display
        name, profile email when needed) so it can refer to people by name in
        responses.
      </li>
    </ul>
    <p>
      The full list of OAuth scopes Pookie requests is published in our Slack
      app manifest in the source repository, so you can audit it before
      installation.
    </p>

    <h2>2. Encryption</h2>
    <ul>
      <li>
        <strong>In transit:</strong> All traffic between Slack, Pookie, model
        providers, and connected services is over HTTPS using TLS 1.2 or higher.
        We do not accept plaintext connections.
      </li>
      <li>
        <strong>At rest:</strong> State, OAuth tokens, MCP server credentials,
        memory entries, and configuration are stored in a managed Redis instance
        (Upstash) with disk encryption enabled by the provider. Self-hosted
        deployments inherit the encryption guarantees of whatever Redis they
        configure.
      </li>
      <li>
        <strong>Secrets:</strong> Slack signing secrets, OAuth client
        credentials, model-provider keys, and similar values live only in the
        deployment&apos;s environment variables, never in the repository or in
        logs.
      </li>
    </ul>

    <h2>3. Authentication and request integrity</h2>
    <ul>
      <li>
        <strong>Slack OAuth:</strong> Pookie installs to a workspace via
        Slack&apos;s standard OAuth 2.0 flow. We never ask for, accept, or store
        user passwords.
      </li>
      <li>
        <strong>OAuth state verification:</strong> The OAuth flow is
        CSRF-protected via a signed state cookie tied to the installing browser
        session.
      </li>
      <li>
        <strong>Webhook signing:</strong> Every inbound request from Slack
        (events, slash commands, interactivity) is verified against{" "}
        <code>SLACK_SIGNING_SECRET</code> before any handler runs. Requests with
        a missing, malformed, or stale signature are rejected with a 401.
      </li>
      <li>
        <strong>No long-lived bot tokens by default:</strong> The managed
        deployment relies on per-workspace OAuth tokens issued by Slack at
        install time. Self-hosted deployments may optionally configure a single
        static bot token for single-workspace use.
      </li>
    </ul>

    <h2>4. AI models and your content</h2>
    <p>
      Pookie sends your message and the relevant context to{" "}
      <a
        href="https://openai.com/policies/api-data-usage-policies/"
        target="_blank"
        rel="noopener noreferrer"
      >
        OpenAI
      </a>{" "}
      so a large language model can produce a reply. Self-hosted deployments may
      configure additional or alternative providers.
    </p>
    <ul>
      <li>
        <strong>No training on Inputs or Suggestions:</strong> We do not use
        your messages or Pookie&apos;s replies to train any AI model. OpenAI
        does not train on data submitted through its API by default, and Pookie
        sends API traffic with that posture. See our{" "}
        <a href="/privacy">Privacy Policy</a> for the narrow exceptions
        (security review, explicit user feedback, explicit consent).
      </li>
      <li>
        <strong>Provider data handling:</strong> OpenAI acts as a subprocessor
        and is bound by its own DPA and data-usage policies. Inference requests
        carry only the data needed to answer the current turn. Pookie does not
        bundle unrelated workspace history into the prompt.
      </li>
      <li>
        <strong>Image generation and code execution:</strong> When you ask
        Pookie to generate an image or run code, those requests are sent to the
        corresponding OpenAI tool with the same no-training posture and are
        scoped to the current turn.
      </li>
    </ul>

    <h2>5. Subprocessors</h2>
    <p>
      Pookie&apos;s managed deployment relies on the following subprocessors.
      Each is contractually bound to handle Customer Data only as needed to
      provide its service.
    </p>
    <ul>
      <li>
        <strong>Slack:</strong> Source of all conversations, files, and
        OAuth-scoped access to your workspace.
      </li>
      <li>
        <strong>Vercel:</strong> Application hosting.
      </li>
      <li>
        <strong>Upstash:</strong> Managed Redis for OAuth tokens, state, memory,
        and per-workspace configuration.
      </li>
      <li>
        <strong>OpenAI:</strong> LLM inference, image generation, and code
        execution. Bound by OpenAI&apos;s API data usage policy, which excludes
        API traffic from model training by default.
      </li>
      <li>
        <strong>Connected MCP servers (optional, customer-controlled):</strong>{" "}
        Any third-party tool a workspace administrator or user connects via{" "}
        <code>/mcp</code>. Credentials and scopes are supplied by the installing
        user; Pookie acts as a client.
      </li>
    </ul>

    <h2>6. Memory, retention, and deletion</h2>
    <ul>
      <li>
        <strong>Memory is explicit:</strong> Pookie&apos;s long-term memory is
        only written when it (or a user, via the assistant) decides a fact is
        worth remembering. Each entry is scoped to a person, a channel, or the
        workspace, and the scope determines who can recall it.
      </li>
      <li>
        <strong>User control:</strong> Workspace members can ask Pookie to
        recall, list, or forget memories at any time. Workspace admins can also
        tune behavior with <code>/pookie-config</code>.
      </li>
      <li>
        <strong>Conversation history:</strong> Pookie keeps the minimum rolling
        context needed to maintain a coherent conversation; older turns are aged
        out as new ones arrive.
      </li>
      <li>
        <strong>Uninstall = deletion:</strong> When you remove Pookie from a
        Slack workspace, we delete the OAuth tokens, memories, MCP credentials,
        and configuration tied to that workspace. You can also request deletion
        at any time by emailing{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> from a verified
        workspace-admin email.
      </li>
    </ul>

    <h2>7. MCP and connected services</h2>
    <p>
      Pookie can connect to Model Context Protocol (MCP) servers (for example,
      GitHub, Linear, PostHog, or any custom MCP) to read and write data on your
      behalf. These connections are opt-in and customer-driven.
    </p>
    <ul>
      <li>
        <strong>You bring the credentials:</strong> The installing user provides
        OAuth tokens or API keys for each MCP server. Pookie does not embed
        shared credentials for third-party services.
      </li>
      <li>
        <strong>Scoping:</strong> Each MCP connection can be scoped to a single
        channel or to the whole workspace via <code>/mcp-add</code>. Removing a
        connection (<code>/mcp-remove</code>) deletes the stored credential.
      </li>
      <li>
        <strong>Action transparency:</strong> Tool calls, including MCP tool
        invocations, are surfaced inline in Pookie&apos;s replies so you can see
        what was read or written and where.
      </li>
    </ul>

    <h2>8. Open source and self-hosting</h2>
    <p>
      Pookie&apos;s source is published at{" "}
      <a
        href="https://github.com/millionco/pookie"
        target="_blank"
        rel="noopener noreferrer"
      >
        github.com/millionco/pookie
      </a>
      . You can audit every Slack scope, every webhook handler, every system
      prompt, and every tool definition before you install it. Workspaces that
      need full data residency or air-gapped operation can self-host on their
      own infrastructure (Vercel, Railway, Fly, Cloud Run, AWS, or Docker on any
      VPS). See the self-hosting guide for details.
    </p>

    <h2>9. Vulnerability disclosure</h2>
    <p>
      If you discover a security vulnerability in Pookie, please report it
      privately so we can fix it before disclosure. Email{" "}
      <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> with the subject
      prefix <code>[security]</code>. Include a description, reproduction steps,
      the affected version or deployment, and any proof-of-concept code.
    </p>
    <p>
      We will acknowledge the report within two business days and aim to provide
      a remediation timeline within five business days. We will keep you updated
      as we work on a fix and credit you in the release notes if you would like.
    </p>
    <p>
      <strong>Safe harbor.</strong> We will not pursue or support legal action
      against researchers who, in good faith, follow this policy. Please do not
      access, modify, or exfiltrate data that does not belong to you, do not run
      automated scans against the production deployment, and do not degrade
      service for other users.
    </p>
    <p>In scope:</p>
    <ul>
      <li>The Pookie web application and its public APIs</li>
      <li>The Slack app at the addresses Pookie ships with</li>
      <li>Source code published in the Pookie repository</li>
    </ul>
    <p>Out of scope:</p>
    <ul>
      <li>
        Findings against third-party services (Slack, Vercel, Upstash, model
        providers, customer-connected MCP servers). Please report those to the
        respective vendor
      </li>
      <li>
        Volumetric denial-of-service tests, social engineering of Million
        Software employees, and physical attacks
      </li>
      <li>
        Self-hosted deployments operated by third parties. Please report to the
        operator of that deployment
      </li>
    </ul>

    <h2>10. Incident response</h2>
    <p>
      If we learn of an incident affecting the confidentiality, integrity, or
      availability of customer data, we will: (1) contain the incident, (2)
      investigate the scope and root cause, (3) notify affected workspace
      administrators by email without undue delay and within the timelines
      required by applicable law, and (4) publish a post-incident summary where
      appropriate.
    </p>

    <h2>11. Compliance posture</h2>
    <p>
      Pookie is a young product and we are upfront about it. We are not
      currently SOC 2, ISO 27001, or HIPAA certified. We follow the practices
      described on this page, our infrastructure providers (Vercel, Upstash,
      Slack, OpenAI) maintain their own SOC 2 and equivalent certifications, and
      self-hosting is available for workspaces with stricter compliance
      requirements. If your organization needs a security questionnaire, DPA, or
      sub-processor list under your name, email{" "}
      <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
    </p>

    <h2>12. Contact</h2>
    <p>
      For all security questions, reports, or data-deletion requests, email{" "}
      <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. Thank you for
      helping us keep Pookie safe.
    </p>
  </>
);

export default SecurityPage;
