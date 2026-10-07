import type { Route } from "@baselayer-sdk/autocomplete";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import { mapInks } from "../../site/demo/map-ink";
import { RowMap } from "../../site/demo/RowMap";
import {
  DEFAULT_STYLE,
  PRESETS,
  applyPreset,
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

/** `#4a5568` as the page computes it. */
function rgb(hex: string): string {
  const [r, g, b] = [1, 3, 5].map(at => parseInt(hex.slice(at, at + 2), 16));
  return `rgb(${r}, ${g}, ${b})`;
}

const MIDNIGHT = applyPreset(
  DEFAULT_STYLE,
  PRESETS.find(preset => preset.name === "Midnight")!,
);

describe("the Disabled column's guide", () => {
  for (const [look, base] of [
    ["Light", DEFAULT_STYLE],
    ["Midnight", MIDNIGHT],
  ] as const) {
    for (const width of [560, 400, 320]) {
      it(`runs down the column from its heading, clear of every checkbox, in ${look} at ${width}px`, () => {
        const state = withListed(base, "people", "addresses", true);
        const { host, done } = mount(state, "people", width);
        try {
          const shown = host.querySelector('[data-drawer="shown"]')!;
          const heading = shown
            .querySelector(".row-map-check-head")!
            .getBoundingClientRect();
          const cells = [
            ...shown.querySelectorAll<HTMLElement>(
              ".row-map-kind .row-map-check-cell",
            ),
          ];
          expect(cells.length).toBe(3);
          const segments: DOMRect[] = [];
          cells.forEach((cell, at) => {
            const column = cell.getBoundingClientRect();
            const box = cell
              .querySelector(".row-map-check")!
              .getBoundingClientRect();
            const middle = (box.left + box.right) / 2;
            const parts = [
              ...cell.querySelectorAll<HTMLElement>(".row-map-guide"),
            ].filter(part => getComputedStyle(part).display !== "none");
            // Above every box; below every box but the last.
            expect(parts.length, `row ${at}`).toBe(
              at === cells.length - 1 ? 1 : 2,
            );
            for (const part of parts) {
              const line = part.getBoundingClientRect();
              segments.push(line);
              expect(getComputedStyle(part).backgroundColor).toBe(
                rgb(mapInks(state).soft),
              );
              expect(line.width).toBeCloseTo(1, 0);
              // On the checkbox's centre, within the column.
              expect(
                Math.abs((line.left + line.right) / 2 - middle),
              ).toBeLessThanOrEqual(1);
              expect(line.left).toBeGreaterThanOrEqual(column.left);
              expect(line.right).toBeLessThanOrEqual(column.right);
              // Never touching a box: a clear gap of at least 3px.
              for (const other of cells) {
                const each = other
                  .querySelector(".row-map-check")!
                  .getBoundingClientRect();
                expect(
                  line.bottom <= each.top - 3 || line.top >= each.bottom + 3,
                  `row ${at} against a box`,
                ).toBe(true);
              }
            }
          });
          // It starts just under the heading.
          const first = segments[0]!;
          expect(first.top).toBeGreaterThanOrEqual(heading.bottom - 0.5);
          expect(first.top - heading.bottom).toBeLessThanOrEqual(1);
          // The Hidden drawer has none.
          expect(
            host.querySelectorAll('[data-drawer="hidden"] .row-map-guide')
              .length,
          ).toBe(0);
        } finally {
          done();
        }
      });
    }
  }
});
