"use client";

import dynamic from "next/dynamic";
import { createPortal } from "react-dom";
import { useLocalStorage } from "react-use";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import animations from "./animations.module.css";
import { AudioIconButton } from "./audio-icon-button";
import { BorderedIconButton } from "./bordered-icon-button";
import { BellIcon, PeopleIcon, SmilePlusIcon } from "./icons";
import { Mention } from "./mention";
import { ReactionCountButton } from "./reaction-count-button";
import { cx, panelShadow } from "./styles";

import type { EmojiClickData, EmojiStyle, Theme } from "emoji-picker-react";

const EmojiPicker = dynamic(() => import("emoji-picker-react"), {
  ssr: false,
});

const EMOJI_PICKER_THEME_LIGHT = "light" as Theme;
const EMOJI_PICKER_STYLE_NATIVE = "native" as EmojiStyle;

const REVEAL_ANIMATION_DURATION_MS = 480;
const SCROLL_BUFFER_MS = 150;
const SKIP_HINT_DELAY_MS = 800;

const REVEAL_DELAYS_MS = [0, 500, 1700, 2100, 2400, 3400, 3800, 4100];
const LAST_REVEAL_DELAY_MS = REVEAL_DELAYS_MS[REVEAL_DELAYS_MS.length - 1]!;
const TOTAL_INTRO_DURATION_MS =
  LAST_REVEAL_DELAY_MS + REVEAL_ANIMATION_DURATION_MS;

const MESSAGE_BODY_INDENT_PX = 55;
const messageBodyIndentStyle = { paddingLeft: MESSAGE_BODY_INDENT_PX };

const HeaderActions = () => (
  <div className="relative mr-3 flex h-[41px] shrink-0 items-center gap-2 max-[520px]:translate-y-[-8px]">
    <BorderedIconButton label="View 7 members" variant="members">
      <span className="col-start-1 row-start-1 ml-[34px] h-6 self-center justify-self-start text-[17px] leading-6 font-medium tracking-[-0.03em] text-[#495058]">
        7
      </span>
      <PeopleIcon />
    </BorderedIconButton>
    <AudioIconButton />
    <BorderedIconButton label="Notification settings" variant="bell">
      <BellIcon />
      <span
        aria-hidden="true"
        className={cx(
          animations.notificationBadge,
          "pointer-events-none absolute top-2 right-2",
        )}
      >
        <span
          className={cx(
            animations.notificationBadgeDot,
            "block h-[7px] w-[7px] rounded-full bg-[#ff3b30] shadow-[0_0_0_2px_#ffffff]",
          )}
        />
      </span>
    </BorderedIconButton>
  </div>
);

const ChannelHeader = () => (
  <header className="mb-5 flex h-[41px] w-full shrink-0 items-start justify-between max-[520px]:h-auto max-[520px]:gap-4">
    <div className="flex h-[30px] min-w-0 items-center gap-1.5 text-[23px] leading-[30px] font-semibold tracking-[-0.03em] text-[#393939]">
      <span>#</span>
      <span>pookie</span>
    </div>
    <HeaderActions />
  </header>
);

const IntroMessage = ({
  sender,
  body,
  avatar = "default",
  showMention = true,
}: {
  sender: string;
  body: React.ReactNode;
  avatar?: "default" | "pookie";
  showMention?: boolean;
}) => (
  <div className="mb-3 flex min-h-[52px] shrink-0 items-start gap-3 pl-[3px]">
    <div
      aria-hidden="true"
      className={cx(
        "h-10 w-10 shrink-0 rounded-[10px] bg-cover bg-center",
        avatar === "pookie"
          ? "bg-[url(/pookie-avatar.png)]"
          : "bg-[url(/default-pookie-avatar.png)]",
      )}
    />
    <div className="flex min-w-0 flex-col gap-0.5 text-xl leading-[25px] max-[520px]:text-[19px] max-[520px]:leading-6">
      <div className="leading-[inherit] font-bold tracking-[-0.03em] text-[#1d1c1d]">
        {sender}
      </div>
      <div className="flex flex-wrap items-center gap-[7px] leading-[inherit] font-medium tracking-[-0.03em] text-[#4d4d4d]">
        {showMention && <Mention name="pookie" />}
        <span>{body}</span>
      </div>
    </div>
  </div>
);

const QuotedSearchResult = ({
  quote,
  source,
}: {
  quote: string;
  source: string;
}) => (
  <div className="mt-1.5" style={messageBodyIndentStyle}>
    <blockquote className="border-l-[3px] border-[#dddddd] py-0.5 pl-3 text-xl leading-[25px] font-medium tracking-[-0.03em] text-[#4d4d4d] max-[520px]:text-[19px] max-[520px]:leading-6">
      <span className="block">{quote}</span>
      <span className="mt-0.5 block text-base font-normal text-[#717274] max-[520px]:text-[15px]">
        {source}
      </span>
    </blockquote>
  </div>
);

const EMOJI_PICKER_HEIGHT_PX = 350;
const EMOJI_PICKER_WIDTH_PX = 320;
const PICKER_GAP_PX = 8;

const ReactionPills = () => {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [reactions, setReactions] = useLocalStorage<string[]>(
    "pookie-reactions",
    [],
  );
  const buttonRef = useRef<HTMLButtonElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const [pickerPosition, setPickerPosition] = useState({ top: 0, left: 0 });

  const updatePickerPosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setPickerPosition({
      top: rect.bottom + PICKER_GAP_PX + window.scrollY,
      left: rect.left + window.scrollX,
    });
  }, []);

  useLayoutEffect(() => {
    if (!isPickerOpen) return;
    updatePickerPosition();
  }, [isPickerOpen, updatePickerPosition]);

  const handleEmojiClick = useCallback(
    (emojiData: EmojiClickData) => {
      setReactions((previous = []) => {
        if (previous.includes(emojiData.emoji)) return previous;
        return [...previous, emojiData.emoji];
      });
      setIsPickerOpen(false);
    },
    [setReactions],
  );

  useEffect(() => {
    if (!isPickerOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        buttonRef.current?.contains(target) ||
        pickerRef.current?.contains(target)
      ) {
        return;
      }
      setIsPickerOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isPickerOpen]);

  return (
    <div
      suppressHydrationWarning
      className="relative mt-2 mb-0 flex min-h-[33px] shrink-0 flex-wrap items-center gap-[9px]"
      style={messageBodyIndentStyle}
    >
      {reactions?.map((emoji) => (
        <ReactionCountButton key={emoji} emoji={emoji} count={1} />
      ))}
      <button
        ref={buttonRef}
        aria-label="Add reaction"
        className="group relative flex h-[33px] w-11 shrink-0 cursor-pointer items-center justify-center rounded-full border border-transparent bg-[#ededed] hover:border-black/[0.09] hover:bg-white"
        onClick={() => setIsPickerOpen((wasOpen) => !wasOpen)}
        type="button"
      >
        <SmilePlusIcon />
      </button>
      {isPickerOpen &&
        createPortal(
          <div
            ref={pickerRef}
            className="fixed z-[9999] [&_.EmojiPickerReact]:rounded-xl! [&_.EmojiPickerReact]:border-[#e8e8e8]! [&_.EmojiPickerReact]:text-base! [&_.EmojiPickerReact]:[box-shadow:#00000008_0px_2px_24px,#00000006_0px_4px_4px,#0000000a_0px_2px_2px]! [&_.EmojiPickerReact]:[--epr-category-label-height:28px]! [&_.EmojiPickerReact]:[--epr-category-navigation-button-size:22px]! [&_.EmojiPickerReact]:[--epr-header-padding:8px_10px_4px]! [&_.EmojiPickerReact_input]:text-base!"
            style={{
              top: pickerPosition.top,
              left: pickerPosition.left,
            }}
          >
            <EmojiPicker
              theme={EMOJI_PICKER_THEME_LIGHT}
              emojiStyle={EMOJI_PICKER_STYLE_NATIVE}
              height={EMOJI_PICKER_HEIGHT_PX}
              width={EMOJI_PICKER_WIDTH_PX}
              onEmojiClick={handleEmojiClick}
              searchPlaceHolder="Search emoji..."
              skinTonesDisabled
              previewConfig={{ showPreview: false }}
              lazyLoadEmojis
            />
          </div>,
          document.body,
        )}
    </div>
  );
};

const MessageBlock = ({
  sender,
  body,
  avatar,
  showMention,
  showReactions = true,
  withBottomGap = true,
  groupedWithPrevious = false,
  revealDelayMs,
  children,
}: {
  sender: string;
  body: React.ReactNode;
  avatar?: "default" | "pookie";
  showMention?: boolean;
  showReactions?: boolean;
  withBottomGap?: boolean;
  groupedWithPrevious?: boolean;
  revealDelayMs?: number;
  children?: React.ReactNode;
}) => (
  <div
    className={cx(
      "-ml-[22px] flex w-[calc(100%+30px)] shrink-0 flex-col pr-2 pl-[22px] hover:bg-black/[0.02] max-[520px]:-ml-5 max-[520px]:w-[calc(100%+40px)] max-[520px]:pr-5 max-[520px]:pl-5",
      groupedWithPrevious ? "py-[2px]" : "py-[10px]",
      withBottomGap && "mb-[6px]",
      revealDelayMs !== undefined && animations.messageReveal,
    )}
    style={
      revealDelayMs !== undefined
        ? { animationDelay: `${revealDelayMs}ms` }
        : undefined
    }
  >
    {groupedWithPrevious ? (
      <div
        className="flex flex-wrap items-center gap-[7px] text-xl leading-[25px] font-medium tracking-[-0.03em] text-[#4d4d4d] max-[520px]:text-[19px] max-[520px]:leading-6"
        style={messageBodyIndentStyle}
      >
        <span>{body}</span>
      </div>
    ) : (
      <IntroMessage
        sender={sender}
        body={body}
        avatar={avatar}
        showMention={showMention}
      />
    )}
    {children}
    {showReactions && <ReactionPills />}
  </div>
);

const SLACK_ICON_PATH =
  "M27.255 80.719c0 7.33-5.978 13.317-13.309 13.317S.63 88.049.63 80.719s5.987-13.317 13.317-13.317h13.309zm6.709 0c0-7.33 5.987-13.317 13.317-13.317s13.317 5.986 13.317 13.317v33.335c0 7.33-5.986 13.317-13.317 13.317c-7.33 0-13.317-5.987-13.317-13.317zm0 0M47.281 27.255c-7.33 0-13.317-5.978-13.317-13.309S39.951.63 47.281.63s13.317 5.987 13.317 13.317v13.309zm0 6.709c7.33 0 13.317 5.987 13.317 13.317s-5.986 13.317-13.317 13.317H13.946C6.616 60.598.63 54.612.63 47.281c0-7.33 5.987-13.317 13.317-13.317zm0 0M100.745 47.281c0-7.33 5.978-13.317 13.309-13.317s13.317 5.987 13.317 13.317s-5.987 13.317-13.317 13.317h-13.309zm-6.709 0c0 7.33-5.987 13.317-13.317 13.317s-13.317-5.986-13.317-13.317V13.946C67.402 6.616 73.388.63 80.719.63c7.33 0 13.317 5.987 13.317 13.317zm0 0M80.719 100.745c7.33 0 13.317 5.978 13.317 13.309s-5.987 13.317-13.317 13.317s-13.317-5.987-13.317-13.317v-13.309zm0-6.709c-7.33 0-13.317-5.987-13.317-13.317s5.986-13.317 13.317-13.317h33.335c7.33 0 13.317 5.986 13.317 13.317c0 7.33-5.987 13.317-13.317 13.317zm0 0";

const GITHUB_ICON_PATH =
  "M64 5.103c-33.347 0-60.388 27.035-60.388 60.388c0 26.682 17.303 49.317 41.297 57.303c3.017.56 4.125-1.31 4.125-2.905c0-1.44-.056-6.197-.082-11.243c-16.8 3.653-20.345-7.125-20.345-7.125c-2.747-6.98-6.705-8.836-6.705-8.836c-5.48-3.748.413-3.67.413-3.67c6.063.425 9.257 6.223 9.257 6.223c5.386 9.23 14.127 6.562 17.573 5.02c.542-3.903 2.107-6.568 3.834-8.076c-13.413-1.525-27.514-6.704-27.514-29.843c0-6.593 2.36-11.98 6.223-16.21c-.628-1.52-2.695-7.662.584-15.98c0 0 5.07-1.623 16.61 6.19C53.7 35 58.867 34.327 64 34.304c5.13.023 10.3.694 15.127 2.033c11.526-7.813 16.59-6.19 16.59-6.19c3.287 8.317 1.22 14.46.593 15.98c3.872 4.23 6.215 9.617 6.215 16.21c0 23.194-14.127 28.3-27.574 29.796c2.167 1.874 4.097 5.55 4.097 11.183c0 8.08-.07 14.583-.07 16.572c0 1.607 1.088 3.49 4.148 2.897c23.98-7.994 41.263-30.622 41.263-57.294C124.388 32.14 97.35 5.104 64 5.104z";

export const ChannelPanel = () => {
  const [hasSeenIntro, setHasSeenIntro] = useLocalStorage(
    "pookie-intro-seen",
    false,
  );
  const [didSkip, setDidSkip] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);
  const messageEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  const isIntroComplete = didSkip || (hasMounted && Boolean(hasSeenIntro));

  const scrollToBottom = useCallback(() => {
    messageEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, []);

  const skipIntro = useCallback(() => {
    setDidSkip(true);
    setHasSeenIntro(true);
    requestAnimationFrame(() => {
      messageEndRef.current?.scrollIntoView({ block: "end" });
    });
  }, [setHasSeenIntro]);

  useEffect(() => {
    if (isIntroComplete || !hasMounted) return;
    const timeout = setTimeout(() => {
      setHasSeenIntro(true);
    }, TOTAL_INTRO_DURATION_MS);
    return () => clearTimeout(timeout);
  }, [isIntroComplete, hasMounted, setHasSeenIntro]);

  useEffect(() => {
    if (isIntroComplete || !hasMounted) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Enter") {
        skipIntro();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isIntroComplete, hasMounted, skipIntro]);

  useEffect(() => {
    if (isIntroComplete || !hasMounted) return;
    const timeouts = REVEAL_DELAYS_MS.map((delay) =>
      setTimeout(scrollToBottom, delay + SCROLL_BUFFER_MS),
    );
    return () => timeouts.forEach(clearTimeout);
  }, [isIntroComplete, hasMounted, scrollToBottom]);

  const revealDelay = (delayMs: number) =>
    isIntroComplete ? undefined : delayMs;

  return (
    <div
      className={cx(
        panelShadow,
        "relative flex h-[calc(100svh-clamp(48px,10vh,112px)-165px)] w-[720px] max-w-full flex-[0_0_auto] shrink flex-col overflow-hidden rounded-[18px] bg-white max-[920px]:h-auto max-[920px]:w-full max-[920px]:min-w-0 max-[920px]:basis-auto",
      )}
    >
      <div className="shrink-0 bg-white pt-[25px] pr-2 pl-[22px] max-[520px]:px-5">
        <ChannelHeader />
      </div>

      <div className="relative min-h-0 flex-1">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 z-10 h-10 bg-gradient-to-b from-white to-white/0"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-12 bg-gradient-to-t from-white to-white/0"
        />

        <div className="h-full overflow-x-hidden overflow-y-auto pr-2 pl-[22px] [scrollbar-color:rgba(0,0,0,0.15)_transparent] [scrollbar-width:thin] max-[520px]:px-5">
          <MessageBlock
            sender="you"
            body="what'd we ship this week?"
            showReactions={false}
            withBottomGap={false}
          />
          <MessageBlock
            sender="pookie"
            body={
              <>
                looks like <Mention name="nisarg" /> shipped the dashboard
                refresh on Tuesday:
              </>
            }
            avatar="pookie"
            showMention={false}
            showReactions
            withBottomGap={false}
            revealDelayMs={revealDelay(REVEAL_DELAYS_MS[1]!)}
          >
            <QuotedSearchResult
              quote="dashboard v2 just shipped 🚢 huge thanks to everyone who reviewed"
              source="@nisarg in #ship-it · 2 days ago"
            />
          </MessageBlock>
          <MessageBlock
            sender="you"
            body="wait who are you"
            showMention={false}
            showReactions={false}
            withBottomGap={false}
            revealDelayMs={revealDelay(REVEAL_DELAYS_MS[2]!)}
          />
          <MessageBlock
            sender="pookie"
            body="i'm pookie 💖"
            avatar="pookie"
            showMention={false}
            showReactions={false}
            withBottomGap={false}
            revealDelayMs={revealDelay(REVEAL_DELAYS_MS[3]!)}
          />
          <MessageBlock
            sender="pookie"
            body="i can search your Slack, generate memes, run code, and connect to your tools (Linear, GitHub, Stripe, anything that speaks MCP)"
            avatar="pookie"
            groupedWithPrevious
            showMention={false}
            showReactions={false}
            withBottomGap={false}
            revealDelayMs={revealDelay(REVEAL_DELAYS_MS[4]!)}
          />
          <MessageBlock
            sender="you"
            body="what do you have access to?"
            showMention={false}
            showReactions={false}
            withBottomGap={false}
            revealDelayMs={revealDelay(REVEAL_DELAYS_MS[5]!)}
          />
          <MessageBlock
            sender="pookie"
            body="fair q. only what you let me see, plus i'm fully open source and self-hostable 🔓 your server, your keys, your data"
            avatar="pookie"
            showMention={false}
            showReactions={false}
            withBottomGap={false}
            revealDelayMs={revealDelay(REVEAL_DELAYS_MS[6]!)}
          />
          <MessageBlock
            sender="pookie"
            body="super easy to set up. the team behind me is tiny, so say hi if you get stuck 👇"
            avatar="pookie"
            groupedWithPrevious
            showMention={false}
            showReactions={false}
            withBottomGap={false}
            revealDelayMs={revealDelay(REVEAL_DELAYS_MS[7]!)}
          >
            <div
              className="mt-3 flex flex-wrap items-center gap-2"
              style={messageBodyIndentStyle}
            >
              <a
                className="inline-flex h-[33px] items-center gap-1.5 rounded-[6px] bg-[#007a5a] px-3 text-[14px] leading-none font-semibold text-white no-underline transition-colors hover:bg-[#005e45]"
                href="/api/slack/install"
                rel="noopener noreferrer"
              >
                Install Pookie to Slack
                <svg
                  aria-hidden="true"
                  className="h-[15px] w-[15px] shrink-0"
                  viewBox="0 0 128 128"
                >
                  <path fill="#fff" d={SLACK_ICON_PATH} />
                </svg>
              </a>
              <a
                className="inline-flex h-[33px] items-center gap-1.5 rounded-[6px] border border-[#d7d7d7] bg-white px-3 text-[14px] leading-none font-semibold text-[#1d1c1d] no-underline transition-colors hover:bg-[#f8f8f8]"
                href="mailto:founders@million.dev?subject=hi%20pookie"
              >
                Say hi 💌
              </a>
              <a
                className="inline-flex h-[33px] items-center gap-1.5 rounded-[6px] border border-[#d7d7d7] bg-white px-3 text-[14px] leading-none font-semibold text-[#1d1c1d] no-underline transition-colors hover:bg-[#f8f8f8]"
                href="https://github.com/millionco/pookie"
                rel="noopener noreferrer"
                target="_blank"
              >
                View on GitHub
                <svg
                  aria-hidden="true"
                  className="h-[15px] w-[15px] shrink-0"
                  viewBox="0 0 128 128"
                >
                  <path
                    fill="#1d1c1d"
                    fillRule="evenodd"
                    d={GITHUB_ICON_PATH}
                    clipRule="evenodd"
                  />
                </svg>
              </a>
              <a
                className="inline-flex h-[33px] items-center gap-1.5 rounded-[6px] border border-[#d7d7d7] bg-white px-3 text-[14px] leading-none font-semibold text-[#1d1c1d] no-underline transition-colors hover:bg-[#f8f8f8]"
                href="/docs/quickstart-managed"
              >
                Read the docs
              </a>
            </div>
          </MessageBlock>

          <div ref={messageEndRef} className="h-4 shrink-0" />
        </div>
      </div>

      {!isIntroComplete && (
        <div className="absolute inset-x-0 bottom-0 flex justify-center pb-4">
          <button
            className={cx(
              animations.messageReveal,
              "cursor-pointer rounded-full border-0 bg-white/90 px-3 py-1.5 text-[13px] font-medium tracking-[-0.01em] text-[#8d8d8d] shadow-sm backdrop-blur-sm transition-colors font-[inherit] hover:bg-white hover:text-[#696969]",
            )}
            onClick={skipIntro}
            style={{ animationDelay: `${SKIP_HINT_DELAY_MS}ms` }}
            type="button"
          >
            press ↵ to skip
          </button>
        </div>
      )}
    </div>
  );
};
