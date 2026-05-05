import { notFound } from "next/navigation";

import type { ReactNode } from "react";

import { DOCS, isDocSlug } from "@/lib/docs";
import { extractToc, readDoc } from "@/lib/docs-content";

import type { DocSlug } from "@/lib/docs";

import { CopyAsMarkdownButton } from "@/components/copy-as-markdown-button";

import { ContentPanel, MockShell } from "../../(website)/_components/pookie-mock-app";
import type { SidebarSubItem } from "../../(website)/_components/pookie-mock-app";

interface DocSlugLayoutProps {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}

const DocSlugLayout = async ({ children, params }: DocSlugLayoutProps) => {
  const { slug } = await params;
  if (!isDocSlug(slug)) notFound();

  const toc = extractToc(readDoc(slug));

  const subItems: SidebarSubItem[] = (
    Object.entries(DOCS) as [DocSlug, (typeof DOCS)[DocSlug]][]
  ).map(([docSlug, entry]) => {
    const label = entry.title.replace(/^Quickstart\s*[—-]\s*/, "").toLowerCase();
    const isActive = docSlug === slug;
    return {
      label,
      href: `/docs/${docSlug}`,
      active: isActive,
      children: isActive
        ? toc.map((tocEntry) => ({
            label: tocEntry.title,
            href: `/docs/${docSlug}#${tocEntry.id}`,
          }))
        : undefined,
    };
  });

  return (
    <MockShell activeChannel="docs" subItems={subItems}>
      <ContentPanel channelName="docs" headerActions={<CopyAsMarkdownButton />}>
        {children}
      </ContentPanel>
    </MockShell>
  );
};

export default DocSlugLayout;
