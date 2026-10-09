import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";
import type { BrowserCommand } from "vitest/node";

import { alias } from "./vitest.config";

/** Emulates a forced-colors display, or lifts it, for the page under test. */
const forcedColors: BrowserCommand<[active: boolean]> = async (
  context,
  active,
) => {
  await context.page.emulateMedia({
    forcedColors: active ? "active" : "none",
  });
};

/** Emulates a wish for reduced motion, or lifts it, for the page under test. */
const reducedMotion: BrowserCommand<[active: boolean]> = async (
  context,
  active,
) => {
  await context.page.emulateMedia({
    reducedMotion: active ? "reduce" : "no-preference",
  });
};

// The tests that need a real layout engine: jsdom lays nothing out, so a row
// that overflows its menu passes there. Run with `pnpm test:browser`.
export default defineConfig({
  resolve: { alias },
  // Pre-bundled up front: found mid-run, it reloads the page and loads a
  // second React beside the one already running.
  optimizeDeps: { include: ["react-dom/server"] },
  test: {
    name: "browser",
    include: ["tests/browser/**/*.test.{ts,tsx}"],
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      screenshotFailures: false,
      // Wider than the widest menu: the menu is never wider than the viewport
      // allows (`100vw - 2rem`), and the default iframe is a phone's width.
      viewport: { width: 1280, height: 900 },
      instances: [{ browser: "chromium" }],
      commands: { forcedColors, reducedMotion },
    },
  },
});
