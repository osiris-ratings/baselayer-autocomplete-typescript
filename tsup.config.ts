import { copyFile, mkdir } from "node:fs/promises";

import { defineConfig } from "tsup";

// Three builds, one per entry point. `clean` sits on the first only: a
// `clean` on a later config wipes the outputs of the earlier ones.
export default defineConfig([
  {
    entry: { index: "src/index.ts" },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    clean: true,
    target: "es2020",
    platform: "neutral",
  },
  {
    entry: { "react/index": "src/react/index.ts" },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    target: "es2020",
    platform: "browser",
    // The optional peers are never bundled; neither is the core, which the
    // React entry imports through the package's own name at runtime.
    external: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "downshift",
      "@baselayer/autocomplete",
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
    target: "node20",
    platform: "node",
  },
]);
