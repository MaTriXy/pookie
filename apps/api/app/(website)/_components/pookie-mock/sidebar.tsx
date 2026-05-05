"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";

import { CHANNELS, DIRECT_MESSAGES } from "./data";
import { ActiveIcon } from "./icons";
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
  "flex h-[36px] w-[188px] shrink-0 items-center gap-2 rounded-[11px] pl-[15px] max-[520px]:w-full";

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
}: {
  label: string;
  active?: boolean;
  subItems?: SidebarSubItem[];
  animateSubItems?: boolean;
  subItemsAnimationKey?: number;
  onSubItemsAnimationComplete?: () => void;
}) => {
  const href = CHANNEL_HREFS[label];
  const isExternal = href?.startsWith("http");
  const prefersReducedMotion = useReducedMotion();
  const shouldAnimateSubItems = animateSubItems && !prefersReducedMotion;

  const content = (
    <>
      <span
        className={cx(
          sidebarTextBase,
          "w-[13px]",
          active ? "text-[#495058]" : "text-[#888888]",
        )}
      >
        #
      </span>
      <span
        className={cx(
          sidebarTextBase,
          active ? "text-[#495058]" : "text-[#495058]",
        )}
      >
        {label}
      </span>
    </>
  );

  if (active) {
    return (
      <div className="flex flex-col gap-[9px]">
        <div className={cx(CHANNEL_ROW, paperItemSurface, "rounded-xl")}>
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
      onClick={label === "docs" ? queueDocsSubitemAnimation : undefined}
      className={cx(
        CHANNEL_ROW,
        "cursor-pointer bg-transparent no-underline hover:bg-black/[0.035]",
      )}
    >
      {content}
    </Link>
  );
};

const DmRow = ({ label }: { label: string }) => (
  <div className="flex h-[36px] w-[188px] shrink-0 cursor-pointer items-center gap-0.5 rounded-[11px] bg-transparent pl-[15px] hover:bg-black/[0.035] max-[520px]:w-full">
    <ActiveIcon />
    <span className={cx(sidebarTextBase, "min-w-[81px] text-[#495058]")}>
      {label}
    </span>
  </div>
);

export const Sidebar = ({
  activeChannel = "pookie",
  subItems,
}: {
  activeChannel?: string;
  subItems?: SidebarSubItem[];
}) => {
  const [subItemsAnimationKey, setSubItemsAnimationKey] = useState(0);
  const [shouldAnimateDocsSubitems, setShouldAnimateDocsSubitems] = useState(
    () => activeChannel === "docs" && shouldAnimateNextDocsSubitems,
  );

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
    <aside className="flex h-[calc(100svh-clamp(48px,10vh,112px))] w-[188px] shrink-0 flex-col justify-between pb-[165px] max-[1040px]:h-auto max-[1040px]:w-[min(100%,967px)] max-[1040px]:flex-row max-[1040px]:justify-center max-[1040px]:gap-8 max-[920px]:items-start max-[920px]:justify-start max-[920px]:gap-5 max-[920px]:overflow-x-auto max-[520px]:w-full max-[520px]:flex-col">
      <div className="mt-[30px] flex w-[188px] flex-col gap-1 max-[1040px]:py-0 max-[520px]:w-full">
        <div className="mb-3 flex h-6 w-[188px] items-center pl-[7px] text-lg font-semibold leading-6 tracking-[-0.03em] text-[#495058] max-[520px]:w-full">
          channels
        </div>
        {CHANNELS.map((channel) => (
          <ChannelRow
            key={channel}
            label={channel}
            active={channel === activeChannel}
            subItems={channel === activeChannel ? subItems : undefined}
            animateSubItems={channel === "docs" && shouldAnimateDocsSubitems}
            subItemsAnimationKey={subItemsAnimationKey}
            onSubItemsAnimationComplete={completeDocsSubitemsAnimation}
          />
        ))}
      </div>

      <div className="flex w-[188px] flex-col gap-1 max-[1040px]:justify-end max-[1040px]:py-0 max-[520px]:w-full">
        {DIRECT_MESSAGES.map((directMessage) => (
          <DmRow key={directMessage} label={directMessage} />
        ))}
      </div>
    </aside>
  );
};

