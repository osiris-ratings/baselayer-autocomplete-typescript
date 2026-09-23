import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const alias = {
  "@baselayer/autocomplete": fileURLToPath(
    new URL("./src/index.ts", import.meta.url),
  ),
};

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
