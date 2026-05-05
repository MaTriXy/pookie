export const cx = (...classes: Array<string | false | null | undefined>) =>
  classes.filter(Boolean).join(" ");

export const paperItemSurface =
  "bg-[color(display-p3_1_1_1)] [box-shadow:#BEBEBE4C_0px_0px_0px_1px,#0000000D_0px_0px_0px_0.5px,#00000006_0px_1px_1px,#0000000D_0px_2px_1px_-1px,#0000000D_0px_1px_3px]";

export const panelShadow =
  "[box-shadow:#00000008_0px_2px_24px,#00000003_0px_4px_4px,#00000003_0px_2px_2px]";

export const composerShadow =
  "[box-shadow:#F0F0F0_0px_0px_0px_1px,#00000008_0px_2px_24px,#00000003_0px_4px_4px,#00000003_0px_2px_2px]";

export const channelRowBase =
  "flex h-[39px] w-[188px] shrink-0 items-center gap-2 rounded-[11px] pl-[15px] max-[520px]:w-full";

export const sidebarTextBase =
  "h-6 shrink-0 whitespace-pre-wrap text-lg font-medium leading-6 tracking-[-0.03em]";
