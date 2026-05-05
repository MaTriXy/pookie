export interface DocEntry {
  title: string;
  sidebarLabel: string;
  description: string;
}

export const DOCS = {
  "quickstart-managed": {
    title: "Quickstart · Managed",
    sidebarLabel: "managed",
    description:
      "Install Pookie to your Slack workspace via OAuth in about thirty seconds.",
  },
  "quickstart-self-hosted": {
    title: "Quickstart · Self-hosted",
    sidebarLabel: "self-hosted",
    description:
      "Run Pookie on your own infra. Vercel, Railway, or Docker. About fifteen minutes.",
  },
} as const satisfies Record<string, DocEntry>;

export type DocSlug = keyof typeof DOCS;

export const isDocSlug = (slug: string): slug is DocSlug => slug in DOCS;

export interface TocEntry {
  id: string;
  title: string;
}

export const slugifyHeading = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[`*_~]/g, "")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
