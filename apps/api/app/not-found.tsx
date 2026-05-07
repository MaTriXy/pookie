import Link from "next/link";

const NotFound = () => (
  <main className="relative flex min-h-svh w-full flex-col items-center justify-center overflow-x-hidden overflow-y-auto bg-[linear-gradient(in_oklab_180deg,oklab(98.6%_0.0006_0.002)_0%,oklab(100%_0_0.0001)_100%)] px-5 py-12 font-sans [font-synthesis:none]">
    <div className="flex flex-col items-center gap-4 text-center">
      <span className="text-[64px] font-semibold text-[#e0e0e0]">404</span>
      <p className="text-[15px] text-[#999]">This page doesn&apos;t exist.</p>
      <Link
        href="/"
        className="inline-flex h-[38px] items-center gap-2 rounded-lg border border-[#d7d7d7] bg-white px-4 text-[14px] leading-none font-semibold text-[#393939] no-underline transition-colors hover:bg-[#f8f8f8]"
      >
        Go home
      </Link>
    </div>
  </main>
);

export default NotFound;
