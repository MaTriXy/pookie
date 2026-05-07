import { describe, expect, it } from "vitest";

import {
  isValidSlackEmojiShortcode,
  resolveSlackEmojiShortcode,
} from "../server/utils/slack-emoji-shortcode";

describe("resolveSlackEmojiShortcode", () => {
  it("converts unicode emoji characters to their canonical Slack shortcode", () => {
    expect(resolveSlackEmojiShortcode("🚩")).toBe("triangular_flag_on_post");
    expect(resolveSlackEmojiShortcode("👍")).toBe("+1");
    expect(resolveSlackEmojiShortcode("❤️")).toBe("heart");
    expect(resolveSlackEmojiShortcode("👌")).toBe("ok_hand");
    expect(resolveSlackEmojiShortcode("😺")).toBe("smiley_cat");
  });

  it("strips surrounding colons from shortcode input", () => {
    expect(resolveSlackEmojiShortcode(":cat:")).toBe("cat");
    expect(resolveSlackEmojiShortcode(":+1:")).toBe("+1");
  });

  it("passes through ASCII shortcodes unchanged", () => {
    expect(resolveSlackEmojiShortcode("ok")).toBe("ok");
    expect(resolveSlackEmojiShortcode("white_check_mark")).toBe(
      "white_check_mark",
    );
    expect(resolveSlackEmojiShortcode("+1")).toBe("+1");
  });

  it("passes through unknown shortcodes unchanged so workspace-custom emojis still flow to Slack", () => {
    expect(resolveSlackEmojiShortcode("partyparrot")).toBe("partyparrot");
    expect(resolveSlackEmojiShortcode(":company_logo:")).toBe("company_logo");
  });

  it("trims whitespace from input before resolving", () => {
    expect(resolveSlackEmojiShortcode("  🚩  ")).toBe(
      "triangular_flag_on_post",
    );
    expect(resolveSlackEmojiShortcode("  ok  ")).toBe("ok");
  });
});

describe("isValidSlackEmojiShortcode", () => {
  it("accepts canonical Slack shortcodes", () => {
    expect(isValidSlackEmojiShortcode("ok")).toBe(true);
    expect(isValidSlackEmojiShortcode("white_check_mark")).toBe(true);
    expect(isValidSlackEmojiShortcode("+1")).toBe(true);
    expect(isValidSlackEmojiShortcode("-1")).toBe(true);
    expect(isValidSlackEmojiShortcode("triangular_flag_on_post")).toBe(true);
  });

  it("rejects empty input, whitespace, and unicode emoji chars", () => {
    expect(isValidSlackEmojiShortcode("")).toBe(false);
    expect(isValidSlackEmojiShortcode(" ")).toBe(false);
    expect(isValidSlackEmojiShortcode("🚩")).toBe(false);
  });

  it("rejects shortcodes with uppercase or invalid characters", () => {
    expect(isValidSlackEmojiShortcode("OK")).toBe(false);
    expect(isValidSlackEmojiShortcode("white check mark")).toBe(false);
    expect(isValidSlackEmojiShortcode("emoji.name")).toBe(false);
  });
});
