import Link from "next/link";

const PROSE_CLASS = [
  "flex flex-col gap-4 text-[14px] leading-[21px] text-[#555]",
  "[&_h1]:text-[26px] [&_h1]:font-semibold [&_h1]:leading-[32px] [&_h1]:text-[#393939]",
  "[&_h2]:mt-8 [&_h2]:mb-1 [&_h2]:text-[17px] [&_h2]:font-semibold [&_h2]:text-[#393939]",
  "[&_h3]:mt-4 [&_h3]:text-[15px] [&_h3]:font-semibold [&_h3]:text-[#393939]",
  "[&_p]:text-[#666]",
  "[&_ul]:flex [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-2 [&_ul]:pl-5 [&_ul]:text-[#666]",
  "[&_strong]:font-medium [&_strong]:text-[#393939]",
  "[&_a]:text-[#393939] [&_a]:underline [&_a]:underline-offset-2",
  "[&_code]:rounded [&_code]:bg-[#f0f0f0] [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[13px] [&_code]:text-[#393939]",
].join(" ");

const LegalLayout = ({ children }: { children: React.ReactNode }) => (
  <main className="relative flex min-h-svh w-full flex-col items-center overflow-x-hidden overflow-y-auto bg-[linear-gradient(in_oklab_180deg,oklab(98.6%_0.0006_0.002)_0%,oklab(100%_0_0.0001)_100%)] px-5 py-12 font-sans [font-synthesis:none]">
    <div className="w-full max-w-2xl">
      <article className={PROSE_CLASS}>{children}</article>
      <footer className="mt-8 flex items-center justify-between text-[12px] text-[#999]">
        <span>© {new Date().getFullYear()} Million Software, Inc.</span>
        <Link
          href="/"
          className="text-[#999] underline underline-offset-2 transition-colors hover:text-[#666]"
        >
          Home
        </Link>
      </footer>
    </div>
  </main>
);

export default LegalLayout;
