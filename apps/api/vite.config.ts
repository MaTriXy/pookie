import path from "node:path";

import { defineConfig } from "vitest/config";

// Vite-plus's `vp test` reads this config when running tests. The `@/*` ->
// `apps/api/*` alias is declared in tsconfig.json for the type-checker; vite
// needs the same mapping at runtime so test files can resolve imports like
// `import { env } from "@/env"`.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
});
