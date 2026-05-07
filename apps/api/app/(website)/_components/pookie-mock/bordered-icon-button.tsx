import { forwardRef } from "react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

import animations from "./animations.module.css";
import { cx, paperItemSurface } from "./styles";

type IconControlVariant = "members" | "audio" | "bell" | "close" | "icon";

const iconControlClasses = {
  members: {
    button: "h-[41px] w-[57px]",
    background: "h-full w-full rounded-[13px]",
  },
  audio: {
    button: cx(animations.audio, "h-[41px] w-[41px]"),
    background: "h-full w-full rounded-[13px]",
  },
  bell: {
    button: cx(animations.bell, "h-[41px] w-[41px]"),
    background: "h-full w-full rounded-[13px]",
  },
  icon: {
    button: "h-[41px] w-[41px]",
    background: "h-full w-full rounded-[13px]",
  },
  close: {
    button: "h-[41px] w-[41px] translate-x-1",
    background: "h-[41px] w-[41px] rounded-[13px]",
  },
} satisfies Record<
  IconControlVariant,
  {
    button: string;
    background: string;
  }
>;

type BorderedIconButtonProps = {
  variant: IconControlVariant;
  label: string;
  children: ReactNode;
  interactive?: boolean;
} & Omit<
  ComponentPropsWithoutRef<"button">,
  "aria-label" | "children" | "className"
>;

export const BorderedIconButton = forwardRef<
  HTMLButtonElement,
  BorderedIconButtonProps
>(
  (
    { variant, label, children, disabled, interactive = true, ...buttonProps },
    ref,
  ) => {
    const classes = iconControlClasses[variant];

    return (
      <button
        ref={ref}
        aria-label={label}
        className={cx(
          interactive && animations.actionButton,
          "relative grid shrink-0 grid-cols-1 grid-rows-1 appearance-none border-0 bg-transparent p-0 text-left text-inherit [font:inherit]",
          interactive ? "cursor-pointer" : "cursor-default",
          classes.button,
        )}
        disabled={disabled || !interactive}
        type="button"
        {...buttonProps}
      >
        <span
          aria-hidden="true"
          className={cx(
            paperItemSurface,
            "pointer-events-none col-start-1 row-start-1 self-center justify-self-center",
            classes.background,
          )}
        />
        {children}
      </button>
    );
  },
);

BorderedIconButton.displayName = "BorderedIconButton";
