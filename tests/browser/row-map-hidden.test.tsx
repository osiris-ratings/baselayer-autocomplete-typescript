import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import type { Route } from "@baselayer-sdk/autocomplete";

import { RowMap } from "../../site/demo/RowMap";
import { DEFAULT_STYLE } from "../../site/demo/style-state";

import "../../site/shared/brand.css";
import "../../site/demo/demo.css";

/** The default map of a search: on Person a line in each drawer. */
function mounted(route: Route) {
  const host = document.createElement("div");
  host.className = "demo";
  host.style.width = "560px";
  document.body.append(host);
  const root = createRoot(host);
  flushSync(() =>
    root.render(
      <RowMap state={DEFAULT_STYLE} onChange={() => {}} route={route} />,
    ),
  );
  return {
    drawer: (name: "shown" | "hidden") =>
      host.querySelector<HTMLElement>(`[data-drawer="${name}"]`)!,
    done() {
      root.unmount();
      host.remove();
    },
  };
}

const TRANSPARENT = "rgba(0, 0, 0, 0)";

/** Where the dots are drawn: the dots' box inside its padding. */
function glyph(dots: HTMLElement) {
  const box = dots.getBoundingClientRect();
  const style = getComputedStyle(dots);
  const left = box.left + parseFloat(style.paddingLeft);
  const right = box.right - parseFloat(style.paddingRight);
  const top = box.top + parseFloat(style.paddingTop);
  const bottom = box.bottom - parseFloat(style.paddingBottom);
  return { x: (left + right) / 2, y: (top + bottom) / 2 };
}

describe("the row map's Hidden drawer", () => {
  for (const route of ["businesses", "people"] as const) {
    it(`sets a hidden line's grip on a rounded ground centred on its dots, on ${route}`, () => {
      const { drawer, done } = mounted(route);
      try {
        const kinds = [
          ...drawer("hidden").querySelectorAll<HTMLElement>(".row-map-kind"),
        ];
        expect(kinds.length).toBeGreaterThan(0);
        for (const kind of kinds) {
          const label = kind.dataset.relation;
          // Nothing of the cell's own is drawn round the grip's ground.
          expect(
            getComputedStyle(kind.querySelector(".row-map-grip-cell")!)
              .backgroundColor,
            label,
          ).toBe(TRANSPARENT);
          const dots = kind.querySelector<HTMLElement>(".row-map-grip-dots")!;
          const style = getComputedStyle(dots);
          expect(style.backgroundColor, label).not.toBe(TRANSPARENT);
          expect(parseFloat(style.borderTopLeftRadius), label).toBeGreaterThan(
            0,
          );
          const pads = [
            style.paddingTop,
            style.paddingRight,
            style.paddingBottom,
            style.paddingLeft,
          ];
          expect(new Set(pads).size, `${label}: ${pads.join(" ")}`).toBe(1);
          expect(parseFloat(pads[0]!), label).toBeGreaterThan(0);
          const block = dots.getBoundingClientRect();
          const drawn = glyph(dots);
          expect(
            Math.abs(block.left + block.width / 2 - drawn.x),
            label,
          ).toBeLessThanOrEqual(0.5);
          expect(
            Math.abs(block.top + block.height / 2 - drawn.y),
            label,
          ).toBeLessThanOrEqual(0.5);
        }
      } finally {
        done();
      }
    });
  }

  it("keeps every grip's dots in one column, in Shown and in Hidden", () => {
    const { drawer, done } = mounted("people");
    try {
      const xs = (["shown", "hidden"] as const).map(name => {
        const dots = [
          ...drawer(name).querySelectorAll<HTMLElement>(".row-map-grip-dots"),
        ];
        expect(dots.length, name).toBeGreaterThan(0);
        return dots.map(each => glyph(each).x);
      });
      const all = xs.flat();
      expect(Math.max(...all) - Math.min(...all)).toBeLessThanOrEqual(0.5);
    } finally {
      done();
    }
  });

  for (const route of ["businesses", "people"] as const) {
    it(`ends a hidden line's ground with its fields, no Enabled gutter after it, and keeps a shown line's column, on ${route}`, () => {
      const { drawer, done } = mounted(route);
      try {
        for (const kind of drawer("hidden").querySelectorAll<HTMLElement>(
          ".row-map-kind",
        )) {
          const label = kind.dataset.relation;
          const check = kind.querySelector<HTMLElement>(".row-map-check-cell")!;
          expect(check.querySelector("input"), label).toBeNull();
          expect(getComputedStyle(check).backgroundColor, label).toBe(
            TRANSPARENT,
          );
          const places = [...kind.querySelectorAll(".row-map-place")];
          const fields = Math.max(
            ...places.map(place => place.getBoundingClientRect().right),
          );
          const ground = kind
            .querySelector(".row-map-kind-ground")!
            .getBoundingClientRect();
          // The line's own padding past its last field, as Shown's box has.
          const pad = parseFloat(
            getComputedStyle(kind.querySelector(".row-map-kind-lines")!)
              .paddingRight,
          );
          expect(ground.right - fields, label).toBeLessThanOrEqual(pad + 0.5);
        }
        for (const kind of drawer("shown").querySelectorAll<HTMLElement>(
          ".row-map-kind",
        )) {
          const label = kind.dataset.relation;
          const check = kind.querySelector<HTMLElement>(".row-map-check-cell")!;
          expect(check.querySelector("input"), label).not.toBeNull();
          expect(getComputedStyle(check).backgroundColor, label).not.toBe(
            TRANSPARENT,
          );
          const lines = kind
            .querySelector(".row-map-kind-lines")!
            .getBoundingClientRect();
          expect(
            Math.abs(check.getBoundingClientRect().left - lines.right),
            label,
          ).toBeLessThanOrEqual(0.5);
        }
      } finally {
        done();
      }
    });
  }
});
