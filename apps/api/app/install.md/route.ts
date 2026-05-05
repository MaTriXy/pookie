import { readFileSync } from "node:fs";
import { join } from "node:path";

const CONTENT = readFileSync(
  join(process.cwd(), "docs", "install.md"),
  "utf-8",
);

export const GET = () =>
  new Response(CONTENT, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
