import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { slugifyHeading } from "./docs";

import type { DocSlug, TocEntry } from "./docs";

export const readDoc = (slug: DocSlug): string =>
  readFileSync(join(process.cwd(), "docs", `${slug}.md`), "utf-8");

export const extractToc = (markdown: string): TocEntry[] => {
  const lines = markdown.split("\n");
  const entries: TocEntry[] = [];
  let inCodeFence = false;

  for (const line of lines) {
    if (line.startsWith("```")) {
      inCodeFence = !inCodeFence;
      continue;
    }
    if (inCodeFence) continue;

    const match = line.match(/^##\s+(.+)$/);
    if (!match) continue;

    const raw = match[1].trim();
    const cleanTitle = raw.replace(/[`*_~]/g, "");
    entries.push({ id: slugifyHeading(raw), title: cleanTitle });
  }

  return entries;
};
