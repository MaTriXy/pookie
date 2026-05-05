"use client";

import type { ReactNode } from "react";

import animations from "./animations.module.css";
import { AudioIconButton } from "./audio-icon-button";
import { BorderedIconButton } from "./bordered-icon-button";
import { BellIcon, PeopleIcon } from "./icons";
import { cx } from "./styles";

export const HeaderActions = ({ children }: { children?: ReactNode }) => (
  <div className="relative mr-3 flex h-[41px] shrink-0 items-center gap-2 max-[520px]:mr-0 max-[520px]:gap-1.5">
    {children ?? (
      <>
        <BorderedIconButton
          interactive={false}
          label="View 2 members"
          variant="members"
        >
          <span className="col-start-1 row-start-1 ml-[34px] h-6 self-center justify-self-start text-[17px] leading-6 font-medium text-[#495058]">
            2
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
      </>
    )}
  </div>
);
