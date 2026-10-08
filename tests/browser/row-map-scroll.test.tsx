import type { Route } from "@baselayer-sdk/autocomplete";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";

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

function mount(state: StyleState, route: Route, width: number) {
  const host = document.createElement("div");
  host.className = "demo";
  host.style.width = `${width}px`;
  document.body.append(host);
  const root = createRoot(host);
  flushSync(() =>
    root.render(<RowMap state={state} onChange={() => {}} route={route} />),
  );
  const shown = host.querySelector<HTMLElement>(
    '[data-drawer="shown"] .row-map-scroll',
  )!;
  return {
    host,
    shown,
    done() {
      root.unmount();
      host.remove();
    },
  };
}

/** Lets a scroll's listeners run. */
const settle = () =>
  new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));

/** Lets a shadow finish fading in or out. */
const faded = () => new Promise(resolve => setTimeout(resolve, 200));

/**
 * The shade each line's box takes at an edge where its places are cut off:
 * at the grip's side, or at the Disabled column's.
 */
function shades(scroller: HTMLElement, edge: "before" | "after") {
  return [...scroller.querySelectorAll<HTMLElement>(".row-map-kind")].map(
    kind => {
      const cell = kind.querySelector<HTMLElement>(
        edge === "before" ? ".row-map-grip-cell" : ".row-map-check-cell",
      )!;
      const style = getComputedStyle(
        cell,
        edge === "before" ? "::after" : "::before",
      );
      const box = cell.getBoundingClientRect();
      const width = parseFloat(style.width);
      return {
        drawn: style.content !== "none" && Number(style.opacity) > 0.5,
        width,
        // Where the shade lies: beside its cell, as tall as the cell.
        top: box.top + parseFloat(style.top),
        bottom: box.bottom - parseFloat(style.bottom),
        line: kind
          .querySelector(".row-map-kind-lines")!
          .getBoundingClientRect(),
      };
    },
  );
}

/** Whether every line's shade at an edge is drawn. */
function shadow(scroller: HTMLElement, edge: "before" | "after"): boolean {
  const all = shades(scroller, edge);
  const drawn = all.filter(shade => shade.drawn).length;
  // Every line or none: a shade is the drawer's, not one line's.
  expect([0, all.length]).toContain(drawn);
  return drawn > 0;
}

describe("a drawer that scrolls sideways", () => {
  it("shadows the edge there is more beyond, by where it is scrolled", async () => {
    const { shown, done } = mount(everyLine("people"), "people", 320);
    try {
      expect(shown.scrollWidth).toBeGreaterThan(shown.clientWidth + 20);
      const at = async (left: number) => {
        shown.scrollLeft = left;
        shown.dispatchEvent(new Event("scroll"));
        await faded();
        return [shadow(shown, "before"), shadow(shown, "after")];
      };
      expect(await at(0)).toEqual([false, true]);
      expect(await at((shown.scrollWidth - shown.clientWidth) / 2)).toEqual([
        true,
        true,
      ]);
      expect(await at(shown.scrollWidth)).toEqual([true, false]);
    } finally {
      done();
    }
  });

  it("shades each line's box softly, within it, and nothing above or between the lines", async () => {
    const { shown, done } = mount(everyLine("people"), "people", 320);
    try {
      shown.scrollLeft = (shown.scrollWidth - shown.clientWidth) / 2;
      shown.dispatchEvent(new Event("scroll"));
      await faded();
      for (const edge of ["before", "after"] as const) {
        for (const shade of shades(shown, edge)) {
          expect(shade.drawn).toBe(true);
          expect(shade.width).toBeGreaterThanOrEqual(10);
          expect(shade.width).toBeLessThanOrEqual(14);
          expect(shade.top).toBeGreaterThanOrEqual(shade.line.top - 0.5);
          expect(shade.bottom).toBeLessThanOrEqual(shade.line.bottom + 0.5);
        }
      }
      // The headings carry no shade, at either edge.
      for (const heading of shown.querySelectorAll(
        ".row-map-head, .row-map-head *",
      )) {
        for (const pseudo of ["::before", "::after"]) {
          const style = getComputedStyle(heading, pseudo);
          expect(
            style.content === "none" || Number(style.opacity) === 0,
            `${heading.className}${pseudo}`,
          ).toBe(true);
        }
      }
      // The drawer's frame carries none either.
      const frame = shown.closest(".row-map-scroll-frame")!;
      for (const pseudo of ["::before", "::after"]) {
        expect(getComputedStyle(frame, pseudo).content).toBe("none");
      }
    } finally {
      done();
    }
  });

  it("shadows neither edge when its lines fit", async () => {
    const { shown, done } = mount(DEFAULT_STYLE, "businesses", 560);
    try {
      await faded();
      expect(shown.scrollWidth).toBeLessThanOrEqual(shown.clientWidth);
      expect([shadow(shown, "before"), shadow(shown, "after")]).toEqual([
        false,
        false,
      ]);
    } finally {
      done();
    }
  });

  for (const width of [400, 320]) {
    it(`never shows a line's places under its grip, scrolled or not, in ${width}px`, async () => {
      const { shown, done } = mount(everyLine("addresses"), "addresses", width);
      try {
        for (const left of [0, 40, shown.scrollWidth]) {
          shown.scrollLeft = left;
          await settle();
          for (const cell of shown.querySelectorAll<HTMLElement>(
            ".row-map-grip-cell",
          )) {
            const box = cell.getBoundingClientRect();
            expect(getComputedStyle(cell).backgroundColor).not.toBe(
              "rgba(0, 0, 0, 0)",
            );
            for (const x of [box.left + 1, box.right - 1]) {
              for (const y of [
                box.top + 2,
                (box.top + box.bottom) / 2,
                box.bottom - 2,
              ]) {
                const top = document.elementFromPoint(x, y)!;
                expect(
                  cell.contains(top),
                  `at scrollLeft ${left}, (${x}, ${y}) is ${top.className}`,
                ).toBe(true);
              }
            }
          }
        }
      } finally {
        done();
      }
    });
  }

  for (const width of [400, 320]) {
    for (const route of ["businesses", "people", "addresses"] as const) {
      it(`keeps a place the keyboard reaches clear of the sticky columns, ${route} in ${width}px`, async () => {
        const { host, done } = mount(everyLine(route), route, width);
        try {
          const places = host.querySelectorAll(
            '[data-drawer="shown"] .row-map-place:not([data-closed]) select',
          );
          const reached = new Set<Element>();
          const visit = () => {
            const focused = document.activeElement;
            if (focused === null || !focused.matches(".row-map-place select")) {
              return;
            }
            if (focused.closest('[data-drawer="shown"]') === null) return;
            reached.add(focused);
            const place = focused.closest<HTMLElement>(".row-map-place")!;
            const face = place
              .querySelector(".row-map-face")!
              .getBoundingClientRect();
            for (const x of [(face.left + face.right) / 2, face.right - 2]) {
              const top = document.elementFromPoint(
                x,
                (face.top + face.bottom) / 2,
              )!;
              expect(
                top.closest(".row-map-place"),
                `${place.dataset.drop} at ${x}`,
              ).toBe(place);
            }
            // Its ring, just outside the face, is clear of the grip's cell.
            const beside = document.elementFromPoint(
              face.left - 1,
              (face.top + face.bottom) / 2,
            )!;
            expect(
              beside.closest(".row-map-grip-cell"),
              `${place.dataset.drop}'s ring`,
            ).toBeNull();
          };
          document.body.focus();
          for (let stops = 0; stops < 80; stops++) {
            await userEvent.tab();
            await settle();
            visit();
          }
          for (let stops = 0; stops < 80; stops++) {
            await userEvent.tab({ shift: true });
            await settle();
            visit();
          }
          expect(reached.size).toBe(places.length);
        } finally {
          done();
        }
      });
    }
  }
});
