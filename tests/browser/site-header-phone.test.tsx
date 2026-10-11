import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { page } from "vitest/browser";

import { headerFontsReady } from "../../site/shared/fonts";

import "../../site/shared/brand.css";
import "../../site/home/home.css";

// The site's header and the home page's hero on a phone: nothing wider than
// the screen, so the page never scrolls sideways. The header's demo button
// says as much as fits: "Try the demo", then "Try", then nothing.

// The site build injects the SDK's version, which the header's links read.
(globalThis as Record<string, unknown>).__SDK_VERSION__ = "0.0.0";
let SiteHeader: typeof import("../../site/shared/SiteHeader").SiteHeader;
beforeAll(async () => {
  ({ SiteHeader } = await import("../../site/shared/SiteHeader"));
});

afterEach(async () => {
  await page.viewport(1280, 900);
});

async function drawHeader(width: number) {
  await page.viewport(width, 800);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  flushSync(() => root.render(<SiteHeader current="home" />));
  await headerFontsReady(2000);
  await document.fonts.ready;
  return {
    host,
    done() {
      root.unmount();
      host.remove();
    },
  };
}

/** Whether an ancestor of `element` inside `host` clips it, as a scroll box does. */
function clipped(element: HTMLElement, host: HTMLElement): boolean {
  for (let node = element.parentElement; node && node !== host;) {
    if (getComputedStyle(node).overflowX !== "visible") return true;
    node = node.parentElement;
  }
  return false;
}

/**
 * How far anything drawn in `host` reaches past the screen's right edge, or
 * how far short of it the furthest thing stops. What a scroll box clips
 * scrolls inside it, and widens nothing.
 */
function overflow(host: HTMLElement, width: number): number {
  let worst = -width;
  for (const element of host.querySelectorAll<HTMLElement>("*")) {
    const box = element.getBoundingClientRect();
    if (box.width > 0 && !clipped(element, host)) {
      worst = Math.max(worst, box.right - width);
    }
  }
  return worst;
}

const WIDTHS = [
  320, 360, 375, 390, 414, 420, 421, 430, 440, 480, 500, 501, 540, 560, 580,
  581, 600, 640, 641, 700, 900, 1240,
];

describe("the site's header", () => {
  for (const width of WIDTHS) {
    it(`fits a ${width}px screen, its demo button saying what fits`, async () => {
      const { host, done } = await drawHeader(width);
      try {
        expect(overflow(host, width)).toBeLessThanOrEqual(0);
        const demo = host.querySelector<HTMLAnchorElement>(
          ".header-actions .btn-primary",
        )!;
        const shown =
          getComputedStyle(demo).display === "none" ? null : demo.innerText;
        expect(shown).toBe(
          width <= 420 ? null : width <= 580 ? "TRY" : "TRY THE DEMO",
        );
        // Whatever it shows, it says where it goes.
        if (shown !== null) {
          expect(demo).toHaveAccessibleName("Try the demo");
        }
      } finally {
        done();
      }
    });
  }
});

// The home page's sections as Home.tsx draws them, each with a line of code
// that never wraps: the hero's install line, the styling section's snippet.
const SECTIONS = {
  hero: `
    <section class="hero">
      <div class="hero-copy"><h1 class="display">Pick the right business as you type</h1></div>
      <div class="hero-aside">
        <div class="install"><div class="code">
          <div class="code-head"><span class="code-title">Install</span><button class="copy">Copy</button></div>
          <pre><code>npm install @baselayer-sdk/autocomplete</code></pre>
        </div></div>
      </div>
    </section>`,
  styling: `
    <section class="panel"><div class="panel-body"><div class="styling">
      <div>
        <h2 class="display-sm">Ready out of the box. Restyles to look like you.</h2>
        <div class="code">
          <div class="code-head">
            <div class="code-tabs" role="tablist"><button class="code-tab">CSS variables</button><button class="code-tab">look</button></div>
            <button class="copy">Copy</button>
          </div>
          <pre><code>.bl-ac { --bl-ac-highlight-bg: #edf2f7; --bl-ac-underline: #38a169; }</code></pre>
        </div>
      </div>
      <figure class="styling-shot"><figcaption><code>matchEmphasisRegion: "token"</code></figcaption></figure>
    </div></div></section>`,
};

describe("the home page's sections", () => {
  for (const [name, html] of Object.entries(SECTIONS)) {
    for (const width of [320, 360, 390]) {
      it(`keep the ${name} within a ${width}px screen, its code scrolling in its own box`, async () => {
        await page.viewport(width, 800);
        const host = document.createElement("div");
        host.className = "wrap";
        document.body.append(host);
        host.innerHTML = html;
        await document.fonts.ready;
        try {
          expect(overflow(host, width)).toBeLessThanOrEqual(0);
        } finally {
          host.remove();
        }
      });
    }
  }
});
