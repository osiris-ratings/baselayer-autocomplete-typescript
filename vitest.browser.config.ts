import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

import { alias } from "./vitest.config";

// The tests that need a real layout engine: jsdom lays nothing out, so a row
// that overflows its menu passes there. Run with `pnpm test:browser`.
export default defineConfig({
  resolve: { alias },
  test: {
    name: "browser",
    include: ["tests/browser/**/*.test.{ts,tsx}"],
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      screenshotFailures: false,
      instances: [{ browser: "chromium" }],
    },
  },
});
