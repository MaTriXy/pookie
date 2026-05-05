"use client";

import { motion, useReducedMotion } from "motion/react";
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
  "flex h-[36px] w-[188px] shrink-0 items-center gap-2 rounded-[11px] pl-[15px]";

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
          isExternal && "flex items-center gap-1.5",
          "font-semibold",
          active ? "text-[#495058]" : "text-[#495058]",
        )}
      >
        {label}
        {isExternal && (
          <svg
            aria-hidden="true"
            className="block h-[0.9em] w-[0.9em] shrink-0 translate-y-px self-center text-[#858b91]"
            fill="none"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              clipRule="evenodd"
              d="M12 3.00009C11.4477 3.0001 11 3.44782 11 4.0001C11 4.55239 11.4477 5.0001 12 5.00009L17.5858 5.00003L10.2929 12.293C9.90237 12.6835 9.90237 13.3167 10.2929 13.7072C10.6834 14.0977 11.3166 14.0977 11.7071 13.7072L19 6.41423L19 12C19 12.5523 19.4477 13 20 13C20.5523 13 21 12.5523 21 12V4C21 3.73478 20.8946 3.48043 20.7071 3.29289C20.5196 3.10535 20.2652 3 20 3L12 3.00009ZM5 7.00009C5 5.89552 5.89543 5.00009 7 5.00009H8C8.55228 5.00009 9 4.55237 9 4.00009C9 3.44781 8.55228 3.00009 8 3.00009H7C4.79086 3.00009 3 4.79095 3 7.00009V17.0001C3 19.2092 4.79086 21.0001 7 21.0001H17C19.2091 21.0001 21 19.2092 21 17.0001V16.0001C21 15.4478 20.5523 15.0001 20 15.0001C19.4477 15.0001 19 15.4478 19 16.0001V17.0001C19 18.1047 18.1046 19.0001 17 19.0001H7C5.89543 19.0001 5 18.1047 5 17.0001V7.00009Z"
              fill="currentColor"
              fillRule="evenodd"
            />
          </svg>
        )}
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
                    "flex h-[32px] items-center gap-1.5 rounded-[9px] pl-[12px] text-[15px] font-medium no-underline transition-colors",
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
    <aside className="flex h-[calc(100svh-clamp(48px,10vh,112px))] w-[188px] shrink-0 flex-col justify-between pb-[165px] max-[1040px]:h-auto max-[1040px]:w-[min(100%,967px)] max-[1040px]:flex-row max-[1040px]:justify-center max-[1040px]:gap-8 max-[1040px]:pb-0 max-[920px]:items-start max-[920px]:justify-start max-[920px]:gap-5 max-[920px]:overflow-x-auto max-[920px]:[scrollbar-width:none] max-[920px]:[-ms-overflow-style:none] max-[920px]:[&::-webkit-scrollbar]:hidden max-[520px]:hidden">
      <div className="mt-[30px] flex w-[188px] shrink-0 flex-col gap-1 max-[1040px]:py-0">
        <div className="mb-3 flex h-6 w-[188px] items-center pl-[7px] text-lg leading-6 font-semibold text-[#495058]">
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
    </aside>
  );
};
