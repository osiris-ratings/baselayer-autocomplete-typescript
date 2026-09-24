import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const src = (path: string) =>
  fileURLToPath(new URL(`./src/${path}`, import.meta.url));

// The package's two entry points, resolved to source. Exact matches, so the
// root does not take the react one as a path inside itself.
const alias = [
  {
    find: /^@baselayer\/autocomplete\/react$/,
    replacement: src("react/index.ts"),
  },
  { find: /^@baselayer\/autocomplete$/, replacement: src("index.ts") },
];

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "core",
          include: ["tests/core/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        resolve: { alias },
        test: {
          name: "server",
          include: ["tests/server/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        test: {
          name: "scripts",
          include: ["tests/scripts/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        resolve: { alias },
        test: {
          name: "site",
          include: ["tests/site/**/*.test.{ts,tsx}"],
          environment: "node",
        },
      },
      {
        resolve: { alias },
        test: {
          name: "react",
          include: ["tests/react/**/*.test.{ts,tsx}"],
          environment: "jsdom",
          setupFiles: ["tests/react/setup.ts"],
        },
      },
    ],
  },
});
