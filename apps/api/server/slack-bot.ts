import { createSlackAdapter } from "@chat-adapter/slack";
import { createRedisState } from "@chat-adapter/state-redis";
import { Chat } from "chat";

import { env } from "@/env";
import { isSlackConfigured } from "@/lib/deployment";

import type { StateAdapter } from "chat";

// createRedisState reads process.env.REDIS_URL at call time. During Next.js
// build, modules are evaluated for static analysis before runtime env vars
// exist. Wrapping in a Proxy defers construction to the first method call.
const lazyRedisState = (): StateAdapter => {
  let instance: StateAdapter | undefined;
  return new Proxy({} as StateAdapter, {
    get(_target, prop, receiver) {
      instance ??= createRedisState({
        url: process.env.REDIS_URL || process.env.KV_URL,
      });
      const value = Reflect.get(instance, prop, receiver);
      return typeof value === "function" ? value.bind(instance) : value;
    },
  });
};

// Slack adapter throws at construction time if SLACK_SIGNING_SECRET is missing.
// Pass placeholder values when env isn't populated yet so module-load doesn't
// crash the whole server — Slack-facing routes guard on isSlackConfigured.
const slackAdapterConfig = isSlackConfigured()
  ? {
      encryptionKey: process.env.SLACK_ENCRYPTION_KEY,
    }
  : {
      signingSecret: "pookie-not-configured",
      clientId: "pookie-not-configured",
      clientSecret: "pookie-not-configured",
    };

export const slackBot = new Chat({
  userName: env.SLACK_BOT_NAME || "pookie",
  adapters: {
    slack: createSlackAdapter(slackAdapterConfig),
  },
  state: lazyRedisState(),
  concurrency: "concurrent",
}).registerSingleton();
