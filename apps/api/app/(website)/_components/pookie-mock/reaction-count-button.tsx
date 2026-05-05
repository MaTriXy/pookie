"use client";

import { Calligraph } from "calligraph";

export const ReactionCountButton = ({
  emoji,
  count,
}: {
  emoji: string;
  count: number;
}) => (
  <div
    aria-label={`${emoji} reaction. Count ${count}`}
    className="flex h-[33px] w-fit shrink-0 items-center justify-center gap-[3px] rounded-full border border-[#d7d7d7] bg-transparent py-0 pr-3 pl-2 font-[inherit] text-base leading-[22px] font-medium text-[#595959]"
  >
    <span
      aria-hidden="true"
      className="flex h-[22px] w-5 shrink-0 items-center justify-center text-[18px] leading-[22px]"
    >
      {emoji}
    </span>
    <Calligraph
      animation="snappy"
      className="inline-flex h-[22px] min-w-[0.55em] items-center justify-center leading-[22px] tracking-normal [font-variant-numeric:tabular-nums]"
      variant="slots"
    >
      {count}
    </Calligraph>
  </div>
);
