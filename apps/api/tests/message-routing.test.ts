import { describe, expect, it } from "vitest";

import {
  hasBotParticipatedInThread,
  hasSlackBotMention,
  isTopLevelSlackMessage,
} from "../server/slack/message-routing";

describe("hasSlackBotMention", () => {
  it("detects Slack bot user mentions", () => {
    expect(hasSlackBotMention("<@UBOT> what do you think", "UBOT")).toBe(true);
  });

  it("ignores messages without the bot mention", () => {
    expect(hasSlackBotMention("<@UOTHER> what do you think", "UBOT")).toBe(
      false,
    );
  });

  it("requires a complete Slack mention token", () => {
    expect(hasSlackBotMention("<@UBOTEXTRA> hi", "UBOT")).toBe(false);
  });
});

describe("isTopLevelSlackMessage", () => {
  it("treats messages without thread_ts as top-level", () => {
    expect(isTopLevelSlackMessage({ ts: "100.000", text: "hello" })).toBe(true);
  });

  it("treats root thread messages as top-level", () => {
    expect(
      isTopLevelSlackMessage({ thread_ts: "100.000", ts: "100.000" }),
    ).toBe(true);
  });

  it("detects replies inside existing threads", () => {
    expect(
      isTopLevelSlackMessage({ thread_ts: "100.000", ts: "101.000" }),
    ).toBe(false);
  });
});

describe("hasBotParticipatedInThread", () => {
  it("detects messages authored by this bot via author.isMe", () => {
    expect(hasBotParticipatedInThread([{ author: { isMe: true } }])).toBe(true);
  });

  it("detects this bot's messages via raw user field matching botUserId", () => {
    expect(
      hasBotParticipatedInThread(
        [{ raw: { user: "UBOT", bot_id: "BBOT" } }],
        "UBOT",
      ),
    ).toBe(true);
  });

  it("ignores another bot's messages even with bot_id/app_id present", () => {
    expect(
      hasBotParticipatedInThread(
        [
          {
            author: { isMe: false, isBot: true },
            raw: { bot_id: "B_OTHER", app_id: "A_OTHER", user: "U_OTHER_BOT" },
          },
        ],
        "UBOT",
      ),
    ).toBe(false);
  });

  it("ignores user-only threads", () => {
    expect(
      hasBotParticipatedInThread(
        [{ author: { isMe: false, isBot: false }, raw: { user: "U123" } }],
        "UBOT",
      ),
    ).toBe(false);
  });

  it("works without botUserId (falls back to author.isMe only)", () => {
    expect(
      hasBotParticipatedInThread([{ raw: { bot_id: "B123" } }]),
    ).toBe(false);
    expect(
      hasBotParticipatedInThread([{ author: { isMe: true } }]),
    ).toBe(true);
  });
});

describe("thread mention routing", () => {
  it("recognizes a bot mention inside a thread without prior bot participation", () => {
    const raw = {
      thread_ts: "100.000",
      ts: "101.000",
      text: "<@UBOT> what do you think",
    };

    expect(isTopLevelSlackMessage(raw)).toBe(false);
    expect(hasSlackBotMention(raw.text, "UBOT")).toBe(true);
    expect(
      hasBotParticipatedInThread([{ raw: { user: "U123" } }], "UBOT"),
    ).toBe(false);
  });

  // Regression for "no reply on thread follow-up @-mention". The slack
  // adapter only sets message.isMention=true for events whose literal type
  // is "app_mention". Slack fans out both `app_mention` and `message` for
  // every @-mention; the SDK dedupes by ts, and when the `message` event
  // wins the race isMention stays falsy. onSubscribedMessage must rely on
  // the text-scan fallback so subscribed-thread mentions still trigger.
  it("recovers a subscribed-thread @-mention when the SDK isMention flag is missing", () => {
    const raw = {
      thread_ts: "100.000",
      ts: "102.000",
      text: "<@UBOT> what tools did u call",
    };
    const messageWithoutFlag = { isMention: undefined as boolean | undefined };

    expect(isTopLevelSlackMessage(raw)).toBe(false);
    expect(messageWithoutFlag.isMention).toBeFalsy();
    expect(hasSlackBotMention(raw.text, "UBOT")).toBe(true);
  });
});
