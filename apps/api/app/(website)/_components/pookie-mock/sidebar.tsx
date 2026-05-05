"use client";

import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import Link from "next/link";

import { useEffect, useState } from "react";

import { CHANNELS } from "./data";
import { cx, paperItemSurface, sidebarTextBase } from "./styles";

const CHANNEL_HREFS: Record<string, string> = {
  pookie: "/",
  install: "/install",
  docs: "/docs/quickstart-managed",
  github: "https://github.com/millionco/pookie",
};

export interface SidebarSubItem {
  label: string;
  href: string;
  active?: boolean;
  children?: Array<{ label: string; href: string }>;
}

const CHANNEL_ROW =
  "relative flex h-[36px] w-[188px] shrink-0 items-center gap-2 rounded-[11px] pl-[15px]";
const ACTIVE_CHANNEL_BACKGROUND_TRANSITION = {
  type: "spring",
  stiffness: 520,
  damping: 38,
  mass: 0.72,
} as const;

let shouldAnimateNextDocsSubitems = false;

const queueDocsSubitemAnimation = () => {
  shouldAnimateNextDocsSubitems = true;
};

const ChannelRow = ({
  label,
  active = false,
  subItems,
  animateSubItems = false,
  subItemsAnimationKey = 0,
  onSubItemsAnimationComplete,
  onSelect,
}: {
  label: string;
  active?: boolean;
  subItems?: SidebarSubItem[];
  animateSubItems?: boolean;
  subItemsAnimationKey?: number;
  onSubItemsAnimationComplete?: () => void;
  onSelect?: (label: string) => void;
}) => {
  const href = CHANNEL_HREFS[label];
  const isExternal = href?.startsWith("http");
  const prefersReducedMotion = useReducedMotion();
  const shouldAnimateSubItems = animateSubItems && !prefersReducedMotion;
  const activeBackgroundTransition = prefersReducedMotion
    ? { duration: 0 }
    : ACTIVE_CHANNEL_BACKGROUND_TRANSITION;

  const content = (
    <>
      <span
        className={cx(
          sidebarTextBase,
          "relative z-10 w-[13px]",
          active ? "text-[#495058]" : "text-[#888888]",
        )}
      >
        #
      </span>
      <span
        className={cx(
          sidebarTextBase,
          "relative z-10",
          active ? "text-[#495058]" : "text-[#495058]",
        )}
      >
        {label}
      </span>
      {isExternal && (
        <svg
          aria-hidden="true"
          className="relative z-10 -ml-1 h-[13px] w-[13px] shrink-0 text-[#7f858b]"
          fill="none"
          viewBox="0 0 16 16"
        >
          <path
            d="M6.25 3.75h6m0 0v6m0-6-7.5 7.5m2.25 1h-2.5a1.75 1.75 0 0 1-1.75-1.75v-6A1.75 1.75 0 0 1 4.5 2.75H7"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.45"
          />
        </svg>
      )}
    </>
  );

  if (active) {
    return (
      <div className="flex flex-col gap-[9px]">
        <div className={cx(CHANNEL_ROW, "overflow-hidden rounded-xl")}>
          <motion.div
            layoutId="sidebar-active-channel-background"
            className={cx("absolute inset-0 rounded-xl", paperItemSurface)}
            transition={activeBackgroundTransition}
          />
          {content}
        </div>
        {subItems && subItems.length > 0 && (
          <motion.div
            key={subItemsAnimationKey}
            initial={shouldAnimateSubItems ? { opacity: 0, y: -8 } : false}
            animate={shouldAnimateSubItems ? { opacity: 1, y: 0 } : undefined}
            transition={
              shouldAnimateSubItems
                ? { duration: 0.22, ease: [0.32, 0.72, 0, 1] }
                : undefined
            }
            onAnimationComplete={
              shouldAnimateSubItems ? onSubItemsAnimationComplete : undefined
            }
            className="mb-1 ml-[7px] flex flex-col"
          >
            {subItems.map((item) => {
              const hasTopMargin = item.label === "self-hosted";

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cx(
                    "flex h-[32px] items-center gap-1.5 rounded-[9px] pl-[12px] text-[15px] font-medium tracking-[-0.03em] no-underline transition-colors",
                    hasTopMargin && "mt-[3px]",
                    item.active
                      ? "bg-[#f0f0f0] text-[#495058]"
                      : "text-[#888] hover:bg-black/[0.035] hover:text-[#555]",
                  )}
                >
                  <span className="w-[11px] text-[#aaa]">#</span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </motion.div>
        )}
      </div>
    );
  }

  if (isExternal) {
    return (
      <a
        href={href ?? "#"}
        className={cx(
          CHANNEL_ROW,
          "cursor-pointer bg-transparent no-underline hover:bg-black/[0.035]",
        )}
        target="_blank"
        rel="noopener noreferrer"
      >
        {content}
      </a>
    );
  }

  return (
    <Link
      href={href ?? "#"}
      onClick={() => {
        if (label === "docs") queueDocsSubitemAnimation();
        onSelect?.(label);
      }}
      className={cx(
        CHANNEL_ROW,
        "cursor-pointer bg-transparent no-underline hover:bg-black/[0.035]",
      )}
    >
      {content}
    </Link>
  );
};

export const Sidebar = ({
  activeChannel = "pookie",
  subItems,
}: {
  activeChannel?: string;
  subItems?: SidebarSubItem[];
}) => {
  const [displayedActiveChannel, setDisplayedActiveChannel] =
    useState(activeChannel);
  const [subItemsAnimationKey, setSubItemsAnimationKey] = useState(0);
  const [shouldAnimateDocsSubitems, setShouldAnimateDocsSubitems] = useState(
    () => activeChannel === "docs" && shouldAnimateNextDocsSubitems,
  );

  useEffect(() => {
    setDisplayedActiveChannel(activeChannel);
  }, [activeChannel]);

  useEffect(() => {
    if (
      activeChannel === "docs" &&
      shouldAnimateNextDocsSubitems &&
      !shouldAnimateDocsSubitems
    ) {
      setShouldAnimateDocsSubitems(true);
      setSubItemsAnimationKey((key) => key + 1);
    }
  }, [activeChannel, shouldAnimateDocsSubitems]);

  const completeDocsSubitemsAnimation = () => {
    shouldAnimateNextDocsSubitems = false;
    setShouldAnimateDocsSubitems(false);
  };

  return (
    <aside className="flex h-[calc(100svh-clamp(48px,10vh,112px))] w-[188px] shrink-0 flex-col justify-between pb-[165px] max-[1040px]:h-auto max-[1040px]:w-[min(100%,967px)] max-[1040px]:flex-row max-[1040px]:justify-center max-[1040px]:gap-8 max-[1040px]:pb-0 max-[920px]:items-start max-[920px]:justify-start max-[920px]:gap-5 max-[920px]:overflow-x-auto max-[920px]:[scrollbar-width:none] max-[920px]:[-ms-overflow-style:none] max-[920px]:[&::-webkit-scrollbar]:hidden max-[520px]:hidden">
      <div className="mt-[30px] flex w-[188px] shrink-0 flex-col gap-1 max-[1040px]:py-0">
        <div className="mb-3 flex h-6 w-[188px] items-center pl-[7px] text-lg leading-6 font-semibold tracking-[-0.03em] text-[#495058]">
          channels
        </div>
        <LayoutGroup id="sidebar-channel-active">
          {CHANNELS.map((channel) => (
            <ChannelRow
              key={channel}
              label={channel}
              active={channel === displayedActiveChannel}
              subItems={
                channel === activeChannel && channel === displayedActiveChannel
                  ? subItems
                  : undefined
              }
              animateSubItems={
                channel === "docs" &&
                channel === activeChannel &&
                shouldAnimateDocsSubitems
              }
              subItemsAnimationKey={subItemsAnimationKey}
              onSubItemsAnimationComplete={completeDocsSubitemsAnimation}
              onSelect={setDisplayedActiveChannel}
            />
          ))}
        </LayoutGroup>
      </div>
    </aside>
  );
};
