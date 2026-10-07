import type { Route } from "@baselayer-sdk/autocomplete";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import { RowMap } from "../../site/demo/RowMap";
import {
  DEFAULT_STYLE,
  withListed,
  type StyleState,
} from "../../site/demo/style-state";

import "../../site/shared/brand.css";
import "../../site/demo/demo.css";

function mount(state: StyleState, route: Route, width: number) {
  const host = document.createElement("div");
  host.className = "demo";
  host.style.width = `${width}px`;
  document.body.append(host);
  const root = createRoot(host);
  flushSync(() =>
    root.render(<RowMap state={state} onChange={() => {}} route={route} />),
  );
  return {
    host,
    done() {
      root.unmount();
      host.remove();
    },
  };
}

/** Where the text of an element starts. */
function textLeft(element: Element): number {
  const range = document.createRange();
  range.selectNodeContents(element);
  return range.getBoundingClientRect().left;
}

/** Where a drawer's first line's first chip starts. */
function firstChip(drawer: Element): number {
  return drawer
    .querySelector(".row-map-kind .row-map-line > :first-child")!
    .getBoundingClientRect().left;
}

describe("the row map's drawers, lined up", () => {
  for (const width of [560, 400]) {
    it(`starts each drawer's title where its lines' chips start, in ${width}px`, () => {
      // A person's row shows their businesses and hides their addresses.
      const { host, done } = mount(DEFAULT_STYLE, "people", width);
      try {
        for (const drawer of host.querySelectorAll("[data-drawer]")) {
          const title = drawer.querySelector(".row-map-drawer-label")!;
          expect(
            Math.abs(textLeft(title) - firstChip(drawer)),
            `${drawer.getAttribute("data-drawer")} title`,
          ).toBeLessThanOrEqual(1);
        }
      } finally {
        done();
      }
    });

    it(`starts the empty Hidden drawer's note where the chips start, in ${width}px`, () => {
      const { host, done } = mount(
        withListed(DEFAULT_STYLE, "people", "addresses", true),
        "people",
        width,
      );
      try {
        const shown = host.querySelector('[data-drawer="shown"]')!;
        const hidden = host.querySelector('[data-drawer="hidden"]')!;
        const note = hidden.querySelector(".row-map-drawer-hint")!;
        expect(note.textContent).toContain("grip");
        expect(Math.abs(textLeft(note) - firstChip(shown))).toBeLessThanOrEqual(
          1,
        );
        expect(
          Math.abs(
            textLeft(hidden.querySelector(".row-map-drawer-label")!) -
              firstChip(shown),
          ),
        ).toBeLessThanOrEqual(1);
      } finally {
        done();
      }
    });
  }
});

describe("the Hidden drawer's fields", () => {
  for (const width of [560, 400]) {
    it(`start where the lines' chips do, ruled off from the hidden lines, in ${width}px`, () => {
      const { host, done } = mount(
        {
          ...DEFAULT_STYLE,
          rows: {
            ...DEFAULT_STYLE.rows,
            people: {
              ...DEFAULT_STYLE.rows.people,
              layout: {
                ...DEFAULT_STYLE.rows.people.layout,
                businessTrailing: null,
              },
            },
          },
        },
        "people",
        width,
      );
      try {
        const hidden = host.querySelector('[data-drawer="hidden"]')!;
        const tray = hidden.querySelector<HTMLElement>(".row-map-tray")!;
        const chip = tray.querySelector(".row-map-chip")!;
        expect(
          Math.abs(chip.getBoundingClientRect().left - firstChip(hidden)),
        ).toBeLessThanOrEqual(1);
        // A rule between the hidden lines and the fields.
        const rule = getComputedStyle(tray);
        expect(rule.borderTopStyle).toBe("solid");
        expect(parseFloat(rule.borderTopWidth)).toBeGreaterThan(0);
        expect(tray.getBoundingClientRect().top).toBeGreaterThanOrEqual(
          hidden.querySelector(".row-map-kind")!.getBoundingClientRect().bottom,
        );
      } finally {
        done();
      }
    });
  }
});
