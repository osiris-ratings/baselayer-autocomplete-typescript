import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import { PresetCarousel } from "../../site/demo/PresetCarousel";
import {
  DEFAULT_STYLE,
  INITIAL_STYLE,
  PRESETS,
  applyPreset,
  lineKinds,
  nameSegment,
} from "../../site/demo/style-state";

import "../../site/shared/brand.css";
import "../../site/demo/demo.css";

const ROUTES = ["businesses", "people", "addresses"] as const;

function swatches(route: (typeof ROUTES)[number]) {
  const host = document.createElement("div");
  host.className = "demo";
  host.style.width = "560px";
  document.body.append(host);
  const root = createRoot(host);
  flushSync(() =>
    root.render(
      <PresetCarousel
        state={INITIAL_STYLE}
        onChange={() => {}}
        route={route}
      />,
    ),
  );
  return {
    all: [...host.querySelectorAll<HTMLElement>(".preset-swatch")],
    done() {
      root.unmount();
      host.remove();
    },
  };
}

describe("a preset's swatch", () => {
  for (const route of ROUTES) {
    it(`draws a bar for each line the preset lists and a square for each iconed name, on ${route}`, () => {
      const { all, done } = swatches(route);
      try {
        PRESETS.forEach((preset, at) => {
          const swatch = all[at]!;
          const row = applyPreset(DEFAULT_STYLE, preset).rows[route];
          const drawn = [
            ...swatch.querySelectorAll<HTMLElement>(".preset-line"),
          ];
          const head = drawn.filter(line => line.dataset.relation === "head");
          const listed = drawn
            .filter(line => line.dataset.relation !== "head")
            .map(line => line.dataset.relation);
          expect(listed, preset.name).toEqual(
            row.list.slice(0, Math.max(0, 4 - head.length)),
          );
          // A square before each drawn name whose segment carries an icon.
          const kinds = lineKinds(route);
          const iconed = drawn.filter(line => {
            const relation =
              line.dataset.relation === "head" ? null : line.dataset.relation!;
            const kind = kinds.find(
              each => (each.relation ?? null) === relation,
            )!;
            const named = kind.lines.find(each => each.lead.field === null)!;
            const segment = nameSegment(route, kind.relation, named.line);
            // Only the line that draws the name carries its square.
            return (
              segment !== null &&
              (row.iconSegments as readonly string[]).includes(segment) &&
              (relation !== null || line === head[0])
            );
          });
          expect(
            swatch.querySelectorAll(".preset-icon").length,
            preset.name,
          ).toBe(iconed.length);
          for (const line of drawn) {
            expect(
              line.querySelectorAll(".preset-icon").length,
              `${preset.name} ${line.dataset.relation}`,
            ).toBe(iconed.includes(line) ? 1 : 0);
          }
        });
      } finally {
        done();
      }
    });
  }

  it("marks the match in every preset, never in a transparent ink, and keeps every swatch one height", () => {
    const { all, done } = swatches("businesses");
    try {
      const heights = new Set(
        all.map(swatch => swatch.getBoundingClientRect().height),
      );
      expect(heights.size).toBe(1);
      PRESETS.forEach((preset, at) => {
        const mark = all[at]!.querySelector<HTMLElement>(".preset-mark");
        expect(mark, preset.name).not.toBeNull();
        const style = getComputedStyle(mark!);
        expect(style.backgroundColor, preset.name).not.toBe("rgba(0, 0, 0, 0)");
        expect(
          mark!.getBoundingClientRect().width,
          preset.name,
        ).toBeGreaterThan(4);
      });
    } finally {
      done();
    }
  });
});
