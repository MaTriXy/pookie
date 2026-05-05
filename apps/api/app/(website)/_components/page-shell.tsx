import type { ReactNode } from "react";

export const PageShell = ({
  children,
  wide = false,
}: {
  children: ReactNode;
  wide?: boolean;
}) => (
  <main className="relative flex min-h-svh w-full flex-col items-center overflow-x-hidden overflow-y-auto bg-[linear-gradient(in_oklab_180deg,oklab(98.6%_0.0006_0.002)_0%,oklab(100%_0_0.0001)_100%)] px-5 py-12 font-sans text-[14px] leading-[21px] text-[#495058] [font-synthesis:none]">
    <div className={wide ? "w-full max-w-5xl" : "w-full max-w-2xl"}>
      {children}
    </div>
  </main>
);

export const PageHeading = ({ children }: { children: ReactNode }) => (
  <h1 className="text-[26px] leading-[32px] font-semibold tracking-[-0.03em] text-[#393939]">
    {children}
  </h1>
);

export const PageSubheading = ({ children }: { children: ReactNode }) => (
  <h2 className="text-[19px] leading-[25px] font-semibold tracking-[-0.03em] text-[#393939]">
    {children}
  </h2>
);

export const PageText = ({ children }: { children: ReactNode }) => (
  <p className="text-[14px] leading-[21px] tracking-[-0.01em] text-[#666]">
    {children}
  </p>
);

export const PagePanel = ({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) => (
  <div
    className={`rounded-xl border border-[#e8e8e8] bg-white px-5 py-4 ${className}`}
  >
    {children}
  </div>
);

export const PageDivider = () => <hr className="border-t border-[#e8e8e8]" />;

export const PrimaryLink = ({
  href,
  children,
  external = false,
}: {
  href: string;
  children: ReactNode;
  external?: boolean;
}) => (
  <a
    href={href}
    className="inline-flex h-[38px] items-center gap-2 rounded-lg bg-[#007a5a] px-4 text-[14px] leading-none font-semibold text-white no-underline transition-colors hover:bg-[#005e45]"
    {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
  >
    {children}
  </a>
);

export const SecondaryLink = ({
  href,
  children,
  external = false,
}: {
  href: string;
  children: ReactNode;
  external?: boolean;
}) => (
  <a
    href={href}
    className="inline-flex h-[38px] items-center gap-2 rounded-lg border border-[#d7d7d7] bg-white px-4 text-[14px] leading-none font-semibold text-[#393939] no-underline transition-colors hover:bg-[#f8f8f8]"
    {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
  >
    {children}
  </a>
);

export const Badge = ({
  children,
  variant = "default",
}: {
  children: ReactNode;
  variant?: "default" | "outline" | "muted";
}) => {
  const styles = {
    default: "bg-[#393939] text-white",
    outline: "border border-[#d7d7d7] bg-white text-[#666]",
    muted: "bg-[#f0f0f0] text-[#666]",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[12px] font-medium ${styles[variant]}`}
    >
      {children}
    </span>
  );
};

export const AlertPanel = ({ children }: { children: ReactNode }) => (
  <div className="flex gap-3 rounded-xl border border-[#e8e8e8] bg-[#fafafa] px-5 py-4 text-[14px] leading-[21px] text-[#666]">
    {children}
  </div>
);

export const CodeBlock = ({ children }: { children: string }) => (
  <pre className="overflow-x-auto rounded-xl border border-[#e8e8e8] bg-white px-4 py-3 font-mono text-[13px] leading-[20px] text-[#555]">
    {children}
  </pre>
);

export const InlineCode = ({ children }: { children: ReactNode }) => (
  <code className="rounded bg-[#f0f0f0] px-1 py-0.5 text-[13px] text-[#393939]">
    {children}
  </code>
);
