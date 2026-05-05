# Pookie — website copy (draft)

Layout conceit: the marketing page renders as a faux Slack workspace. Sidebar with channels (decorative), main pane scrolls through "channels" and "threads" that double as marketing sections. Pookie demos itself as you scroll.

---

## Sidebar (decorative)

```
Pookie HQ
  # general
  # announcements
  # eng
  # design
  # random
  ▾ Direct Messages
  • @pookie
```

---

## Section 1 — Hero · `#general`

Pinned message from `@pookie`.

**pookie** `APP` · `1:00 PM`

> **hey, i'm pookie.**
> i'm an AI agent that lives in your Slack. tag me in any thread and ask anything — i'll read the relevant messages and reply inline.
> not keyword search. an actual teammate.

Reactions: 🧠 12 🔍 8 🫡 24 ⭐ 31

CTAs: `[ Add to Slack ]` `[ Self-host ]` `[ View on GitHub ]`

---

## Section 2 — The pain · `#why-pookie`

Thread of messages from "you."

**you** · `1:02 PM`

> searching Slack is the worst experience i have all week.

**you** · `1:02 PM`

> [screenshot: Slack search results, irrelevant, 6 months old, in a channel you left]

**you** · `1:03 PM`

> Slack rolled out their AI thing. it's $10/user/month _extra_ and still tells me to "try a different keyword."

**you** · `1:03 PM`

> [screenshot: Slack AI returning "I couldn't find anything"]

**you** · `1:04 PM`

> so i made pookie. it actually works. self-host it, fork it, free.

---

## Section 3 — How it works (live demo thread)

A single thread that expands into the actual demo.

**alex** · `9:14 AM`

> what did we decide about the Q3 launch deadline? i can't find the thread

> **2 replies** · Last reply 1 minute ago

— click expands —

**alex** · `9:14 AM`

> @pookie what did we decide about the Q3 launch deadline?

**pookie** `APP` · `9:14 AM`

> launch is locked for **Aug 14**. decided in `#eng-leads` on July 22 after the load-testing thread — sarah signed off, jamal flagged the migration risk but it was scoped down.
>
> sources:
> ↳ `#eng-leads` · jul 22, 3:41 PM
> ↳ `#launch-q3` · jul 22, 4:08 PM
> ↳ DM with sarah · jul 23

**alex** · `9:15 AM`

> 🫡 ty

---

## Section 4 — Features · `#features`

Pinned bot message, release-notes style.

**pookie** `APP` · pinned

> **what i can do**
>
> - **answer questions across your workspace** — channels, threads, DMs you've granted access to
> - **cite sources** — every answer links back to the original messages
> - **respect permissions** — i only see what you'd see
> - **work in any thread** — replies inline, no app switching
> - **extend via MCP** — connect PostHog, GitHub, Linear, your own tools
> - **powered by OpenAI** — fast, cited replies via the AI SDK
> - **self-host in one click** — Vercel, Railway, Fly, Docker

---

## Section 5 — Beyond search · `#what-else`

**pookie** `APP` · `2:30 PM`

> i'm not just search. i'm an agent. give me MCP servers and i'll use them.

Sub-thread of example capability messages:

> **@pookie** how many signups did we get yesterday?
> → _queries PostHog, returns chart_

> **@pookie** open a PR that fixes the typo in `auth.ts` line 42
> → _spins up a coding agent, opens PR, links it_

> **@pookie** summarize the last week in `#eng`
> → _returns a digest with links_

> **@pookie** who owns the billing service?
> → _checks GitHub CODEOWNERS + Slack history, replies with name_

---

## Section 6 — Setup · `#setup`

Tabs: **Add to Slack** · **Self-host** · **One-click deploy**

### Add to Slack (admins)

> Click below. Approve the OAuth scopes. Pookie shows up in your sidebar. Done in 60 seconds.
>
> `[ Add to Slack ]`

### Self-host

```bash
git clone https://github.com/pookiebot/pookie
cp .env.example .env  # add your API keys
docker compose up
```

> Need a guide? → `docs.getpookie.com/self-host`

### One-click deploy

> `[ Deploy on Vercel ]` `[ Deploy on Railway ]` `[ Deploy on Fly ]`
>
> Bring your own OpenAI key.

---

## Section 7 — Why self-host · `#trust`

**pookie** `APP` · `3:00 PM`

> **your slack, your data, your model.**
>
> - open source (MIT)
> - runs on your infra
> - your API keys, your bill
> - no telemetry you didn't opt into
> - fork it, change it, ship it

CTAs: `[ Star on GitHub ]` `[ Read the source ]`

---

## Section 8 — FAQ · `#faq`

Q&A as a thread.

> **does it index my entire workspace?**
> only what you grant access to during install. you can scope it to specific channels.

> **how is this different from Slack AI?**
> we cite sources. we cost less. we work. you can self-host. and we're not just search — we're an agent.

> **what models does it use?**
> OpenAI by default. self-host to swap in a different provider with one import change.

> **is my data sent to OpenAI?**
> only the messages relevant to the current question, only when you tag pookie. OpenAI doesn't train on API traffic by default. self-host if you want zero third-party hops to inference (use a local model).

> **does it work in DMs?**
> yes. tag it or DM it directly.

---

## Section 9 — Footer (channel header style)

```
# pookie  ·  an AI agent for your Slack
★ Star · ⑂ Fork · 📖 Docs · 🐦 @getpookie
made by [you] · MIT licensed · self-host with dignity
```

---

## Tone notes

- lowercase, casual — matches real Slack message voice and the README scratchpad.
- punchy contrasts — "not keyword search. an actual teammate."
- show, don't tell — Section 3's demo thread carries more weight than any feature list.
- anti-Slack-AI angle is implicit, not whiny — landed once in Section 2, dropped after.
