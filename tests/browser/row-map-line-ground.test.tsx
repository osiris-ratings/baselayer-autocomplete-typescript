import type { Route } from "@baselayer-sdk/autocomplete";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import { RowMap } from "../../site/demo/RowMap";
import { INITIAL_STYLE, withListed } from "../../site/demo/style-state";

import "../../site/shared/brand.css";
import "../../site/shared/fonts";
import "../../site/demo/demo.css";

/** The demo's map, a line with places in Hidden on every search. */
const STATES: Record<Route, Parameters<typeof RowMap>[0]["state"]> = {
  businesses: INITIAL_STYLE,
  people: withListed(INITIAL_STYLE, "people", "businesses", false),
  addresses: withListed(INITIAL_STYLE, "addresses", "businesses", false),
};

function mount(route: Route, width: number) {
  const host = document.createElement("div");
  host.className = "demo";
  host.style.width = `${width}px`;
  document.body.append(host);
  const root = createRoot(host);
  flushSync(() =>
    root.render(
      <RowMap state={STATES[route]} onChange={() => {}} route={route} />,
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

/** How far a ring drawn as a box shadow spreads past its box. */
const ring = (element: Element) =>
  parseFloat(/(-?[\d.]+)px\s*$/.exec(getComputedStyle(element).boxShadow)![1]!);

/** The box its nearest scrolling or clipping ancestor shows it through. */
function clip(element: Element): DOMRect {
  for (let at = element.parentElement; at !== null; at = at.parentElement) {
    const style = getComputedStyle(at);
    if (style.overflowX !== "visible" || style.overflowY !== "visible") {
      return at.getBoundingClientRect();
    }
  }
  return document.documentElement.getBoundingClientRect();
}

/** A line's ground as drawn, its ring included, and what it holds. */
function drawn(kind: HTMLElement) {
  const ground = kind.querySelector(".row-map-kind-ground");
  const box = (
    ground ?? kind.querySelector(".row-map-kind-lines")!
  ).getBoundingClientRect();
  const spread = ground === null ? 0 : ring(ground);
  const shown = clip(kind);
  const lines = [...kind.querySelectorAll(".row-map-line")];
  const tops = [...lines[0]!.children].map(
    item => item.getBoundingClientRect().top,
  );
  const bottoms = [...lines.at(-1)!.children].map(
    item => item.getBoundingClientRect().bottom,
  );
  return {
    line: `${kind.closest("[data-drawer]")!.getAttribute("data-drawer")} ${kind.dataset.relation}`,
    above: Math.min(...tops) - Math.max(box.top - spread, shown.top),
    below: Math.min(box.bottom + spread, shown.bottom) - Math.max(...bottoms),
  };
}

describe("the row map's grounds", () => {
  for (const route of ["businesses", "people", "addresses"] as const) {
    for (const width of [560, 400, 320]) {
      it(`leave as much room below what a line holds as above, the same on every line in a drawer, for ${route} at ${width}px`, async () => {
        await document.fonts.ready;
        const { host, done } = mount(route, width);
        try {
          for (const drawer of ["shown", "hidden"]) {
            const rooms = [
              ...host.querySelectorAll<HTMLElement>(
                `[data-drawer="${drawer}"] .row-map-kind`,
              ),
            ]
              .filter(kind => kind.querySelector(".row-map-line") !== null)
              .map(drawn);
            expect(rooms.length, drawer).toBeGreaterThan(0);
            for (const room of rooms) {
              expect(
                Math.abs(room.above - room.below),
                JSON.stringify(room),
              ).toBeLessThanOrEqual(0.5);
            }
            const aboves = rooms.map(room => room.above);
            expect(
              Math.max(...aboves) - Math.min(...aboves),
              JSON.stringify(rooms),
            ).toBeLessThanOrEqual(0.5);
          }
        } finally {
          done();
        }
      });

      it(`draws every ring in Hidden whole, its scroller cutting none, for ${route} at ${width}px`, async () => {
        await document.fonts.ready;
        const { host, done } = mount(route, width);
        try {
          const ringed = [
            ...host.querySelectorAll<HTMLElement>(
              '[data-drawer="hidden"] :is(.row-map-kind-ground, .row-map-drawer-label, .row-map-chip)',
            ),
          ];
          expect(ringed.length).toBeGreaterThan(1);
          for (const element of ringed) {
            const box = element.getBoundingClientRect();
            const spread = ring(element);
            const shown = clip(element);
            const name = `${element.className} ${element.textContent}`;
            expect(box.top - spread, name).toBeGreaterThanOrEqual(
              shown.top - 0.01,
            );
            expect(box.bottom + spread, name).toBeLessThanOrEqual(
              shown.bottom + 0.01,
            );
          }
        } finally {
          done();
        }
      });
    }
  }
});
