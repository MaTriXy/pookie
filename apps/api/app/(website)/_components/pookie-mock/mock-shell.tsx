import type { ReactNode } from "react";

import { Sidebar } from "./sidebar";
import { cx, panelShadow } from "./styles";

import type { SidebarSubItem } from "./sidebar";

export const MockShell = ({
  activeChannel,
  subItems,
  children,
}: {
  activeChannel: string;
  subItems?: SidebarSubItem[];
  children: ReactNode;
}) => (
  <main className="relative flex h-svh w-full items-start justify-center overflow-hidden bg-[linear-gradient(in_oklab_180deg,oklab(98.6%_0.0006_0.002)_0%,oklab(100%_0_0.0001)_100%)] px-[clamp(16px,4vw,64px)] py-[clamp(24px,5vh,56px)] font-sans text-xs leading-4 text-[#495058] [font-synthesis:none] max-[1040px]:py-6 max-[920px]:px-4 max-[920px]:py-4 max-[520px]:px-3">
    <div className="relative w-fit max-w-[1188px] min-w-0 shrink-0">
      <div className="relative flex w-full flex-col items-center p-0">
        <div className="flex min-h-0 w-fit max-w-full min-w-0 shrink-0 items-start justify-center gap-[clamp(24px,2.2vw,33px)] max-[1040px]:min-h-0 max-[1040px]:flex-col max-[1040px]:items-center">
          <Sidebar activeChannel={activeChannel} subItems={subItems} />
          <section className="flex min-h-0 w-[min(100%,720px)] max-w-full min-w-[min(100%,720px)] flex-[0_1_720px] shrink flex-col items-center gap-3 max-[1040px]:w-full max-[1040px]:max-w-[967px] max-[920px]:h-auto max-[920px]:w-full max-[920px]:flex-col">
            {children}
          </section>
        </div>
      </div>
    </div>
  </main>
);

export const ContentPanel = ({
  channelName,
  headerActions,
  children,
}: {
  channelName: string;
  headerActions?: ReactNode;
  children: ReactNode;
}) => (
  <div
    className={cx(
      panelShadow,
      "relative flex h-[calc(100svh-clamp(48px,10vh,112px))] w-[720px] max-w-full flex-[0_0_auto] shrink flex-col overflow-hidden rounded-[18px] bg-white max-[920px]:h-auto max-[920px]:w-full max-[920px]:min-w-0 max-[920px]:basis-auto",
    )}
  >
    <div className="shrink-0 bg-white pt-[25px] pr-[22px] pl-[22px] max-[520px]:px-5">
      <header className="mb-5 flex h-[30px] w-full shrink-0 items-center justify-between">
        <div className="flex h-[30px] min-w-0 items-center gap-1.5 text-[23px] leading-[30px] font-semibold tracking-[-0.03em] text-[#393939]">
          <span>#</span>
          <span>{channelName}</span>
        </div>
        {headerActions}
      </header>
    </div>

    <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-[22px] pb-6 [scrollbar-color:rgba(0,0,0,0.15)_transparent] [scrollbar-width:thin] max-[520px]:px-5">
      {children}
    </div>
  </div>
);
