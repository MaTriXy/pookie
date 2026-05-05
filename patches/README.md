# Patches

pnpm patches applied via `pnpm.patchedDependencies` in the root `package.json`.
When upgrading a patched package, re-check whether the patch is still needed.

---

## `@ai-sdk/mcp@1.0.37`

Defers sending `mcp-protocol-version` in HTTP/SSE transport headers until after
the `initialize` handshake completes. Without this, some MCP servers reject
requests that include a protocol version before negotiation.

## `@chat-adapter/slack@4.26.0`

**Security: move webhook side-effects behind signature verification.**

The Slack adapter's `handleWebhook` verifies `x-slack-signature` before
dispatching events. Two gaps prevented us from relying solely on SDK callbacks:

1. `handleMemberJoinedChannel` did not forward the envelope's `team_id` to the
   Chat SDK, so `MemberJoinedChannelEvent` lacked `teamId`. Our welcome and
   onboarding triggers need the team ID to resolve the bot token and track
   per-team state.

2. `handleMessageEvent` silently dropped `message_deleted` via `ignoredSubtypes`,
   so there was no SDK callback to cancel active agent runs when a user deletes
   a message.

Both of these forced us to pre-process the raw webhook body _before_ calling the
SDK handler — meaning side-effects ran on unauthenticated input. An attacker
could forge events to spam welcome messages or abort in-flight agent runs.

**What the patch does:**

- Passes `payload.team_id` through `processEventPayload` →
  `handleMemberJoinedChannel` → `processMemberJoinedChannel`, surfacing it as
  `event.teamId` in `onMemberJoinedChannel` callbacks.
- Intercepts `message_deleted` in `handleMessageEvent` before the ignored-
  subtypes check and routes it to `chat.processMessageDeleted()`.
- Removes `message_deleted` from the `ignoredSubtypes` set (now handled above).

**Remove when:** upstream `@chat-adapter/slack` ships `teamId` on
`MemberJoinedChannelEvent` and a `message_deleted` dispatch path.

## `chat@4.26.0`

**Companion to the `@chat-adapter/slack` patch above.**

Adds the plumbing the adapter patch calls into:

- `MemberJoinedChannelEvent.teamId?: string` (type-only, no runtime change).
- `MessageDeletedEvent` interface and `MessageDeletedHandler` type.
- `Chat.onMessageDeleted(handler)` — registers a handler.
- `Chat.processMessageDeleted(event, options)` — dispatches to registered
  handlers (same `waitUntil` pattern as `processMemberJoinedChannel`).

**Remove when:** upstream `chat` ships `onMessageDeleted` and `teamId` on
`MemberJoinedChannelEvent`.
