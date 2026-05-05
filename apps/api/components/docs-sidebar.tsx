import Link from "next/link";

import { DOCS } from "@/lib/docs";

import type { DocSlug, TocEntry } from "@/lib/docs";

interface DocsSidebarProps {
  activeSlug: DocSlug;
  toc: TocEntry[];
}

export const DocsSidebar = ({ activeSlug, toc }: DocsSidebarProps) => (
  <aside className="flex flex-col gap-0.5 md:sticky md:top-12 md:h-fit md:w-56 md:shrink-0">
    <span className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-[#999]">
      Quickstart
    </span>
    {(Object.entries(DOCS) as [DocSlug, (typeof DOCS)[DocSlug]][]).map(
      ([slug, entry]) => {
        const href = `/docs/${slug}`;
        const isActive = slug === activeSlug;
        const label = entry.title.replace(/^Quickstart\s*[—-]\s*/, "");

        return (
          <div key={slug} className="flex flex-col gap-0.5">
            <Link
              href={href}
              className={
                isActive
                  ? "rounded-lg bg-white px-3 py-1.5 text-[13px] font-medium text-[#393939] no-underline shadow-[0_0_0_1px_#e8e8e8]"
                  : "rounded-lg px-3 py-1.5 text-[13px] text-[#888] no-underline transition-colors hover:bg-white/60 hover:text-[#555]"
              }
            >
              {label}
            </Link>
            {isActive && toc.length > 0 ? (
              <ul className="ml-3 flex flex-col gap-0.5 border-l border-[#e8e8e8] pl-3">
                {toc.map((tocEntry) => (
                  <li key={tocEntry.id}>
                    <a
                      href={`#${tocEntry.id}`}
                      className="block rounded-lg py-1 pr-2 pl-2 text-[13px] text-[#999] no-underline transition-colors hover:text-[#555]"
                    >
                      {tocEntry.title}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        );
      },
    )}
  </aside>
);
