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

import { distance, ground, rgb } from "./support/colour";

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

/**
 * The lines a preset's row draws below its title on a search: the head's
 * other lines that have something in their places, then every listed line.
 */
function linesBelow(
  preset: (typeof PRESETS)[number],
  route: (typeof ROUTES)[number],
): number {
  const row = applyPreset(DEFAULT_STYLE, preset).rows[route];
  const layout: Readonly<Record<string, string | null>> = row.layout;
  const kinds = lineKinds(route);
  const head = kinds
    .filter(kind => kind.relation === null)
    .flatMap(kind => kind.lines)
    .filter(
      line =>
        line.lead.field !== null &&
        [
          line.lead.field,
          line.lead.badge,
          line.trailing.badge,
          line.trailing.field,
        ].some(place => layout[place] != null),
    );
  const listed = row.list.flatMap(
    relation => kinds.find(kind => kind.relation === relation)!.lines,
  );
  return head.length + listed.length;
}

describe("a preset's swatch", () => {
  it("draws Light as it always has: a title, its mark, a flag and one subtitle", () => {
    const { all, done } = swatches("businesses");
    try {
      const light = all[PRESETS.findIndex(preset => preset.name === "Light")]!;
      expect([...light.children].map(child => child.className)).toEqual([
        "preset-title",
        "preset-mark",
        "preset-pill",
        "preset-sub",
      ]);
      expect(light.querySelector(".preset-pill")!.textContent).toBe("PA");
      const width = light.clientWidth;
      const at = (name: string) => {
        const bone = light.querySelector<HTMLElement>(`.${name}`)!;
        return {
          left: bone.offsetLeft,
          top: bone.offsetTop,
          width: Math.round(bone.offsetWidth),
          height: bone.offsetHeight,
        };
      };
      expect(at("preset-title")).toEqual({
        left: 9,
        top: 13,
        width: Math.round(width * 0.52),
        height: 5,
      });
      expect(at("preset-mark")).toEqual({
        left: 9,
        top: 20,
        width: Math.round(width * 0.26),
        height: 2,
      });
      expect(at("preset-sub")).toEqual({
        left: 9,
        top: 34,
        width: Math.round(width * 0.4),
        height: 4,
      });
      const flag = light.querySelector<HTMLElement>(".preset-pill")!;
      expect(flag.offsetTop).toBe(9);
      expect(width - flag.offsetLeft - flag.offsetWidth).toBe(8);
    } finally {
      done();
    }
  });

  for (const route of ROUTES) {
    it(`draws a subtitle bar for each line the row draws below its title, at most three, on ${route}`, () => {
      const { all, done } = swatches(route);
      try {
        PRESETS.forEach((preset, at) => {
          const swatch = all[at]!;
          const subs = [...swatch.querySelectorAll<HTMLElement>(".preset-sub")];
          expect(subs.length, preset.name).toBe(
            Math.min(3, linesBelow(preset, route)),
          );
          // Evenly spaced, inside the swatch, and not all one length.
          const tops = subs.map(sub => sub.offsetTop);
          for (let next = 2; next < tops.length; next++) {
            expect(tops[next]! - tops[next - 1]!, preset.name).toBe(
              tops[1]! - tops[0]!,
            );
          }
          const last = subs.at(-1);
          if (last !== undefined) {
            expect(
              last.offsetTop + last.offsetHeight,
              preset.name,
            ).toBeLessThanOrEqual(swatch.clientHeight - 6);
          }
          if (subs.length > 1) {
            expect(
              new Set(subs.map(sub => sub.offsetWidth)).size,
              preset.name,
            ).toBe(subs.length);
          }
        });
      } finally {
        done();
      }
    });

    it(`puts a square in the title's ink before the title only where the name carries an icon, on ${route}`, () => {
      const { all, done } = swatches(route);
      try {
        const head = lineKinds(route).find(kind => kind.relation === null)!;
        const named = head.lines.find(line => line.lead.field === null)!;
        const segment = nameSegment(route, null, named.line);
        PRESETS.forEach((preset, at) => {
          const swatch = all[at]!;
          const icons: readonly string[] = applyPreset(DEFAULT_STYLE, preset)
            .rows[route].iconSegments;
          const squares = [
            ...swatch.querySelectorAll<HTMLElement>(".preset-icon"),
          ];
          const iconed = segment !== null && icons.includes(segment);
          expect(squares.length, preset.name).toBe(iconed ? 1 : 0);
          const title = swatch.querySelector<HTMLElement>(".preset-title")!;
          const flag = swatch.querySelector<HTMLElement>(".preset-pill")!;
          // The title never runs under the flag.
          expect(
            title.getBoundingClientRect().right,
            preset.name,
          ).toBeLessThanOrEqual(flag.getBoundingClientRect().left - 2);
          if (!iconed) return;
          const square = squares[0]!.getBoundingClientRect();
          const bar = title.getBoundingClientRect();
          expect(square.width, preset.name).toBe(square.height);
          expect(
            Math.abs(square.height - bar.height),
            preset.name,
          ).toBeLessThanOrEqual(2);
          expect(square.right, preset.name).toBeLessThanOrEqual(bar.left - 2);
          expect(bar.left - square.right, preset.name).toBeLessThanOrEqual(4);
          expect(
            Math.abs(
              square.top + square.height / 2 - (bar.top + bar.height / 2),
            ),
            preset.name,
          ).toBeLessThanOrEqual(0.5);
          expect(
            getComputedStyle(squares[0]!).backgroundColor,
            preset.name,
          ).toBe(getComputedStyle(title).backgroundColor);
        });
      } finally {
        done();
      }
    });
  }

  it("varies how many bars the presets draw, none for a head-only row", () => {
    const counts = ROUTES.flatMap(route =>
      PRESETS.map(preset => Math.min(3, linesBelow(preset, route))),
    );
    expect(new Set(counts)).toEqual(new Set([0, 1, 2, 3]));
  });

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
        // Plain to see on its card, held to the menu's floor for a fill.
        const swatch = all[at]!;
        expect(
          distance(rgb(style.backgroundColor), ground(swatch)),
          preset.name,
        ).toBeGreaterThanOrEqual(10);
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
