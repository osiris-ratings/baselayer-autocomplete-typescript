// The demo page's entry for the published-build test: App, with React, built
// the way the published site is built and run in a jsdom window of its own
// (tests/site/session-settings-build.test.ts). Not a page of the site.

import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

import { App } from "../../../site/demo/App";

/** Draws the demo page into `host`, and returns what takes it down. */
export function draw(host: HTMLElement): () => void {
  const root = createRoot(host);
  flushSync(() => root.render(createElement(App)));
  return () => root.unmount();
}

/** Runs `change` and has the page drawn as it leaves it, as a click does. */
export { flushSync };
