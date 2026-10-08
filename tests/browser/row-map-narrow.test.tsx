import type { Route } from "@baselayer-sdk/autocomplete";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import { RowMap } from "../../site/demo/RowMap";
import {
  DEFAULT_STYLE,
  lineKinds,
  type StyleState,
} from "../../site/demo/style-state";

import "../../site/shared/brand.css";
import "../../site/demo/demo.css";

/** Every line kind listed, the longest a row gets. */
function everyLine(route: Route): StyleState {
  const list = lineKinds(route).flatMap(kind =>
    kind.relation === null ? [] : [kind.relation],
  );
  return {
    ...DEFAULT_STYLE,
    rows: {
      ...DEFAULT_STYLE.rows,
      [route]: { ...DEFAULT_STYLE.rows[route], list },
    },
  };
}

function mount(route: Route, width: number) {
  const host = document.createElement("div");
  host.className = "demo";
  host.style.width = `${width}px`;
  document.body.append(host);
  const root = createRoot(host);
  flushSync(() =>
    root.render(
      <RowMap state={everyLine(route)} onChange={() => {}} route={route} />,
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

/** How many rows a line's places sit on. */
function rows(line: HTMLElement): number {
  return new Set(
    [...line.children].map(child =>
      Math.round(child.getBoundingClientRect().top),
    ),
  ).size;
}

describe("the row map on a narrow screen", () => {
  for (const width of [400, 320]) {
    for (const route of ["businesses", "people", "addresses"] as const) {
      it(`keeps each ${route} line on one row in ${width}px, and scrolls it, not the page`, () => {
        const { host, done } = mount(route, width);
        try {
          for (const line of host.querySelectorAll<HTMLElement>(
            ".row-map-line",
          )) {
            expect(rows(line)).toBe(1);
          }
          const wrap = host.querySelector<HTMLElement>(".row-map-wrap")!;
          expect(wrap.scrollWidth).toBeLessThanOrEqual(wrap.clientWidth);
        } finally {
          done();
        }
      });

      it(`keeps the grips at the left and the Disabled column at the right of a ${route} row in ${width}px, scrolled or not`, () => {
        const { host, done } = mount(route, width);
        try {
          for (const scroller of host.querySelectorAll<HTMLElement>(
            ".row-map-scroll",
          )) {
            for (const end of [0, scroller.scrollWidth]) {
              scroller.scrollLeft = end;
              const view = scroller.getBoundingClientRect();
              const at = `at scrollLeft ${end}`;
              for (const grip of scroller.querySelectorAll<HTMLElement>(
                ".row-map-grip:not([data-spacer])",
              )) {
                expect(
                  Math.abs(grip.getBoundingClientRect().left - view.left),
                  `grip ${at}`,
                ).toBeLessThanOrEqual(1);
              }
              for (const column of scroller.querySelectorAll<HTMLElement>(
                ".row-map-check-cell, .row-map-check-head",
              )) {
                expect(
                  Math.abs(column.getBoundingClientRect().right - view.right),
                  `${column.className} ${at}`,
                ).toBeLessThanOrEqual(1);
                // On a ground of its own, over what scrolls under it.
                expect(getComputedStyle(column).backgroundColor).not.toBe(
                  "rgba(0, 0, 0, 0)",
                );
              }
              const grip =
                scroller.querySelector<HTMLElement>(".row-map-grip-cell");
              if (grip !== null) {
                expect(getComputedStyle(grip).backgroundColor).not.toBe(
                  "rgba(0, 0, 0, 0)",
                );
              }
            }
            // Scrolled to its end, every place is clear of the Disabled
            // column: nothing is left under it.
            scroller.scrollLeft = scroller.scrollWidth;
            for (const kind of scroller.querySelectorAll<HTMLElement>(
              ".row-map-kind",
            )) {
              // A hidden line has no checkbox, but keeps its column.
              const column = kind
                .querySelector(".row-map-kind-lines")!
                .getBoundingClientRect().right;
              const check = kind.querySelector(".row-map-check-cell");
              if (check !== null) {
                expect(column).toBeLessThanOrEqual(
                  check.getBoundingClientRect().left + 0.5,
                );
              }
              for (const place of kind.querySelectorAll<HTMLElement>(
                ".row-map-place:not([data-closed]), .row-map-name",
              )) {
                expect(
                  place.getBoundingClientRect().right,
                  `${place.dataset.drop ?? "name"} of ${kind.dataset.relation}`,
                ).toBeLessThanOrEqual(column + 0.5);
              }
            }
          }
        } finally {
          done();
        }
      });
    }
  }

  for (const width of [560, 400, 320]) {
    it(`centres each grip on its line, whole, in ${width}px`, () => {
      const { host, done } = mount("people", width);
      try {
        for (const grip of host.querySelectorAll<HTMLElement>(
          ".row-map-grip:not([data-spacer])",
        )) {
          const box = grip.getBoundingClientRect();
          const line = grip
            .closest(".row-map-kind")!
            .querySelector(".row-map-kind-lines")!
            .getBoundingClientRect();
          expect(
            Math.abs((box.top + box.bottom) / 2 - (line.top + line.bottom) / 2),
          ).toBeLessThanOrEqual(1);
          const card = grip.closest(".row-map")!.getBoundingClientRect();
          expect(box.left).toBeGreaterThanOrEqual(card.left);
          expect(box.right).toBeLessThanOrEqual(card.right);
          // Every dot whole: the dots are a whole number of tiles, centred
          // on the line.
          const dots = grip
            .querySelector(".row-map-grip-dots")!
            .getBoundingClientRect();
          expect(dots.width % 6).toBe(0);
          expect(dots.height % 6).toBe(0);
          expect(
            Math.abs(
              (dots.top + dots.bottom) / 2 - (line.top + line.bottom) / 2,
            ),
          ).toBeLessThanOrEqual(1);
          // The whole of the grip's cell takes a press, top to bottom.
          const cell = grip
            .closest(".row-map-grip-cell")!
            .getBoundingClientRect();
          for (const y of [cell.top + 1, cell.bottom - 1]) {
            const top = document.elementFromPoint(
              (cell.left + cell.right) / 2,
              y,
            )!;
            expect(grip.contains(top), `at ${y}`).toBe(true);
          }
        }
      } finally {
        done();
      }
    });

    it(`keeps the Disabled column to the checkbox, its heading at the drawer's right, in ${width}px`, () => {
      const { host, done } = mount("people", width);
      try {
        const scroller = host.querySelector<HTMLElement>(
          '[data-drawer="shown"] .row-map-scroll',
        )!;
        const view = scroller.getBoundingClientRect();
        for (const cell of scroller.querySelectorAll(".row-map-check-cell")) {
          expect(cell.getBoundingClientRect().width).toBeLessThanOrEqual(36);
        }
        const heading = scroller.querySelector<HTMLElement>(
          ".row-map-check-head",
        )!;
        expect(heading.textContent).toBe("Disabled");
        expect(
          Math.abs(heading.getBoundingClientRect().right - view.right),
        ).toBeLessThanOrEqual(1);
        expect(heading.scrollWidth).toBeLessThanOrEqual(heading.clientWidth);
      } finally {
        done();
      }
    });
  }
});
