import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import { ROUTE_NAMES, type Route } from "@baselayer-sdk/autocomplete";

import { SearchTitle } from "../../site/demo/SearchTitle";

import "../../site/shared/brand.css";
import "../../site/demo/demo.css";

/** The card widths the head must hold at: a wide pane, a phone, a small one. */
const WIDTHS = [560, 400, 320] as const;

/** The test form's head as the demo draws it: the title, the filters toggle. */
function draw(width: number, route: Route) {
  const host = document.createElement("div");
  host.className = "demo";
  host.style.width = `${width}px`;
  document.body.append(host);
  const root = createRoot(host);
  flushSync(() =>
    root.render(
      <section className="demo-card">
        <div className="demo-card-head">
          <SearchTitle
            id="title"
            panelId="panel"
            routes={ROUTE_NAMES}
            route={route}
            onRoute={() => {}}
          />
          <button type="button" className="link-toggle">
            + Add filters
          </button>
        </div>
        <div id="panel" />
      </section>,
    ),
  );
  return {
    host,
    done() {
      root.unmount();
      host.remove();
    },
  };
}

function box(element: Element) {
  return element.getBoundingClientRect();
}

/** How many lines an element's text runs over, by the tops of its boxes. */
function linesOf(element: Element): number {
  const range = document.createRange();
  range.selectNodeContents(element);
  const tops = new Set(
    [...range.getClientRects()].map(rect => Math.round(rect.top)),
  );
  return tops.size;
}

/** What is wrong with the head as drawn, one entry a fault. */
function faults(host: HTMLElement): string[] {
  const found: string[] = [];
  const head = host.querySelector<HTMLElement>(".demo-card-head")!;
  const card = box(host.querySelector(".demo-card")!);
  if (head.scrollWidth > head.clientWidth) {
    found.push(
      `the head scrolls sideways by ${head.scrollWidth - head.clientWidth}px`,
    );
  }
  for (const word of host.querySelectorAll<HTMLElement>(".search-by-word")) {
    const at = box(word);
    if (at.right > card.right + 0.5 || at.left < card.left - 0.5) {
      found.push(`"${word.textContent}" leaves the card`);
    }
    if (linesOf(word) > 1) {
      found.push(`"${word.textContent}" breaks across lines`);
    }
  }
  const title = box(host.querySelector(".demo-card-title")!);
  const toggle = box(host.querySelector(".link-toggle")!);
  const overlap =
    title.left < toggle.right &&
    toggle.left < title.right &&
    title.top < toggle.bottom &&
    toggle.top < title.bottom;
  if (overlap) {
    found.push("the title runs under the filters toggle");
  }
  if (toggle.right > card.right + 0.5) {
    found.push("the filters toggle leaves the card");
  }
  return found;
}

describe("the test form's title", () => {
  for (const width of WIDTHS) {
    for (const route of ["businesses", "addresses"] as const) {
      it(`wraps between words, never under the toggle, at ${width}px on ${route}`, () => {
        const { host, done } = draw(width, route);
        try {
          expect(host.querySelectorAll(".search-by-word")).toHaveLength(3);
          expect(faults(host)).toEqual([]);
        } finally {
          done();
        }
      });
    }
  }
});
