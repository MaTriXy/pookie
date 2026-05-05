import { notFound } from "next/navigation";

import { MarkdownContent } from "@/components/markdown-content";
import { DOCS, isDocSlug } from "@/lib/docs";
import { readDoc } from "@/lib/docs-content";

import type { Metadata } from "next";

interface DocPageProps {
  params: Promise<{ slug: string }>;
}

export const generateStaticParams = () =>
  Object.keys(DOCS).map((slug) => ({ slug }));

export const generateMetadata = async ({
  params,
}: DocPageProps): Promise<Metadata> => {
  const { slug } = await params;
  if (!isDocSlug(slug)) return {};
  const entry = DOCS[slug];
  return { title: entry.title, description: entry.description };
};

const DocPage = async ({ params }: DocPageProps) => {
  const { slug } = await params;
  if (!isDocSlug(slug)) notFound();

  const content = readDoc(slug);

  return (
    <article>
      <MarkdownContent content={content} />
    </article>
  );
};

export default DocPage;
