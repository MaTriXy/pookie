"use client";

import { Drawer } from "vaul";

import { useState } from "react";

import { BorderedIconButton } from "./bordered-icon-button";
import { Sidebar } from "./sidebar";

import type { SidebarSubItem } from "./sidebar";

export const MobileSidebarDrawer = ({
  activeChannel,
  subItems,
}: {
  activeChannel: string;
  subItems?: SidebarSubItem[];
}) => {
  const [open, setOpen] = useState(false);

  return (
    <span className="hidden shrink-0 max-[1040px]:block">
      <Drawer.Root direction="left" open={open} onOpenChange={setOpen}>
        <Drawer.Trigger asChild>
          <BorderedIconButton variant="icon" label="Open navigation">
            <svg
              aria-hidden="true"
              className="pointer-events-none relative col-start-1 row-start-1 h-[22px] w-[22px] self-center justify-self-center text-[#454447]"
              fill="none"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                clipRule="evenodd"
                d="M3 5C2.44772 5 2 5.44772 2 6C2 6.55228 2.44772 7 3 7H21C21.5523 7 22 6.55228 22 6C22 5.44772 21.5523 5 21 5H3ZM2 12C2 11.4477 2.44772 11 3 11H21C21.5523 11 22 11.4477 22 12C22 12.5523 21.5523 13 21 13H3C2.44772 13 2 12.5523 2 12ZM2 18C2 17.4477 2.44772 17 3 17H21C21.5523 17 22 17.4477 22 18C22 18.5523 21.5523 19 21 19H3C2.44772 19 2 18.5523 2 18Z"
                fill="currentColor"
                fillRule="evenodd"
              />
            </svg>
          </BorderedIconButton>
        </Drawer.Trigger>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-50 bg-black/20 backdrop-blur-[1px]" />
          <Drawer.Content className="fixed inset-y-0 left-0 z-50 flex w-[min(82vw,296px)] flex-col rounded-r-[20px] bg-white px-6 pt-6 pb-8 shadow-[18px_0_50px_rgba(15,15,15,0.16)] outline-none">
            <Drawer.Title className="sr-only">Navigation</Drawer.Title>
            <Drawer.Description className="sr-only">
              Navigate between Pookie pages.
            </Drawer.Description>
            <Sidebar
              activeChannel={activeChannel}
              subItems={subItems}
              variant="drawer"
              onNavigate={() => setOpen(false)}
            />
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </span>
  );
};
