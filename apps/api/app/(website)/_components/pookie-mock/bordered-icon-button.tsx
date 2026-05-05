import type { ComponentPropsWithoutRef, ReactNode } from "react";
import animations from "./animations.module.css";
import { cx, paperItemSurface } from "./styles";

type IconControlVariant = "members" | "audio" | "bell" | "close";

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

export const BorderedIconButton = ({
  variant,
  label,
  children,
  ...buttonProps
}: {
  variant: IconControlVariant;
  label: string;
  children: ReactNode;
} & Omit<ComponentPropsWithoutRef<"button">, "aria-label" | "children" | "className">) => {
  const classes = iconControlClasses[variant];

  return (
    <button
      aria-label={label}
      className={cx(
        animations.actionButton,
        "relative grid shrink-0 grid-cols-1 grid-rows-1 appearance-none border-0 bg-transparent p-0 text-left text-inherit [font:inherit]",
        "cursor-pointer",
        classes.button,
      )}
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
};
