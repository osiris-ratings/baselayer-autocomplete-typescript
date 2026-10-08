import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { contrast, mapInks } from "../../site/demo/map-ink";
import {
  DEFAULT_STYLE,
  PRESETS,
  applyPreset,
} from "../../site/demo/style-state";

/** The demo's blue, as its stylesheet writes it. */
const BLUE = /--blue:\s*(#[0-9a-f]{6});/i
  .exec(
    readFileSync(
      new URL("../../site/shared/brand.css", import.meta.url),
      "utf8",
    ),
  )![1]!
  .toLowerCase();

/** How far `at` lies along the way from `from` to `to`, 0 to 1, by channel. */
function toward(from: string, to: string, at: string): number {
  const rgb = (hex: string) =>
    [1, 3, 5].map(start => parseInt(hex.slice(start, start + 2), 16));
  const [a, b, c] = [rgb(from), rgb(to), rgb(at)];
  const along = b.map((channel, i) => channel - a[i]!);
  return (
    along.reduce((sum, d, i) => sum + d * (c[i]! - a[i]!), 0) /
    along.reduce((sum, d) => sum + d * d, 0)
  );
}

describe("the row map's inks, from the look", () => {
  it("measures contrast as WCAG does", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrast("#718096", "#ffffff")).toBeCloseTo(4.0, 1);
    expect(contrast("#fff", "#ffffff")).toBe(1);
  });

  for (const preset of PRESETS) {
    it(`keeps every ink readable on its ground in ${preset.name}`, () => {
      const state = applyPreset(DEFAULT_STYLE, preset);
      const ground = state.look.backgroundColor;
      const tint = state.vars["--bl-ac-highlight-bg"];
      const inks = mapInks(state);

      // Labels and headings, on the card and on an enabled line's tint, at
      // the floors the inks are searched to, as the hex they are written in.
      for (const on of [ground, tint]) {
        expect(contrast(inks.ink, on)).toBeGreaterThanOrEqual(7);
        expect(contrast(inks.soft, on)).toBeGreaterThanOrEqual(4.5);
      }
      expect(contrast(inks.guide, ground)).toBeGreaterThanOrEqual(1.5);
      // A disabled line is dimmed at 0.48 and a hidden one at 0.38, or
      // less where a look would lose a hidden line altogether.
      expect(inks.dim.disabled).toBe(0.48);
      expect(inks.dim.hidden).toBeGreaterThanOrEqual(0.38);
      expect(inks.dim.hidden).toBeLessThan(inks.dim.disabled);
    });

    it(`draws the Disabled column's checkbox quiet but seen in ${preset.name}`, () => {
      const state = applyPreset(DEFAULT_STYLE, preset);
      const ground = state.look.backgroundColor.toLowerCase();

      const { check } = mapInks(state);

      // An empty box's edge is about WCAG's 3:1 for a control's boundary,
      // and never less; under the pointer it is a little stronger.
      expect(contrast(check.edge, ground)).toBeGreaterThanOrEqual(3);
      expect(contrast(check.edge, ground)).toBeLessThan(3.3);
      expect(contrast(check.hover, ground)).toBeGreaterThanOrEqual(
        contrast(check.edge, ground) + 0.5,
      );
      // A checked box is the demo's blue, as the native box was, taken
      // toward the card, its mark readable on it; focus rings it in the blue
      // itself.
      expect(toward(BLUE, ground, check.fill)).toBeGreaterThanOrEqual(0.35);
      expect(toward(BLUE, ground, check.fill)).toBeLessThanOrEqual(0.45);
      expect(contrast(check.mark, check.fill)).toBeGreaterThanOrEqual(3);
      expect(check.ring).toBe(BLUE);
    });
  }

  it("reads a colour with an alpha, laid over the card, and floors its inks as any other", () => {
    const state = {
      ...DEFAULT_STYLE,
      look: {
        ...DEFAULT_STYLE.look,
        backgroundColor: "#ffffffff",
        titleColor: "#1a202ccc",
        subtitleColor: "#718096b3",
      },
    };
    const inks = mapInks(state);
    expect(inks.ink).toMatch(/^#[0-9a-f]{6}$/);
    expect(contrast(inks.ink, "#ffffff")).toBeGreaterThanOrEqual(7);
    expect(contrast(inks.soft, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    // Four digits too.
    const short = mapInks({
      ...DEFAULT_STYLE,
      look: { ...DEFAULT_STYLE.look, titleColor: "#000c" },
    });
    expect(short.ink).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("takes a look's own colours in any case, and leaves one it cannot read to the stylesheet", () => {
    const state = {
      ...DEFAULT_STYLE,
      look: { ...DEFAULT_STYLE.look, titleColor: "#1A202C" },
    };
    expect(mapInks(state).ink).toMatch(/^#[0-9a-f]{6}$/);
    const odd = {
      ...DEFAULT_STYLE,
      look: { ...DEFAULT_STYLE.look, backgroundColor: "rebeccapurple" },
    };
    expect(mapInks(odd).ink).toContain("color-mix(");
    expect(mapInks(odd).check.edge).toContain("color-mix(");
    expect(mapInks(odd).check.fill).toContain("color-mix(");
  });
});
