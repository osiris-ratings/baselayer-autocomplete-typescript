import { copyFile, mkdir } from "node:fs/promises";

import { defineConfig } from "tsup";

// Three builds, one per entry point, which tsup runs at once: none cleans,
// since a clean in one, its declarations' above all, can land after another
// has written and wipe it. `pnpm build` empties dist once, before them.
export default defineConfig([
  {
    entry: { index: "src/index.ts" },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    clean: false,
    target: "es2020",
    platform: "neutral",
  },
  {
    entry: { "react/index": "src/react/index.ts" },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    clean: false,
    target: "es2020",
    platform: "browser",
    // The optional peers are never bundled; neither is the core, which the
    // React entry imports through the package's own name at runtime.
    external: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "downshift",
      "@baselayer-sdk/autocomplete",
    ],
    // Next.js App Router: the hooks and the component are client code.
    banner: { js: '"use client";' },
    async onSuccess() {
      await mkdir("dist/react", { recursive: true });
      await copyFile("src/react/styles.css", "dist/react/styles.css");
    },
  },
  {
    entry: { "server/index": "src/server/index.ts" },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    clean: false,
    target: "node20",
    platform: "node",
  },
]);
