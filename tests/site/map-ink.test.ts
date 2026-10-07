import { describe, expect, it } from "vitest";

import { contrast, mapInks } from "../../site/demo/map-ink";
import {
  DEFAULT_STYLE,
  PRESETS,
  applyPreset,
} from "../../site/demo/style-state";

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

      // Labels and headings, on the card and on an enabled line's tint.
      for (const on of [ground, tint]) {
        expect(contrast(inks.ink, on)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(inks.soft, on)).toBeGreaterThanOrEqual(3);
      }
      // A disabled line is dimmed at 0.58 and a hidden one at 0.45, or
      // less where a look would lose a hidden line altogether.
      expect(inks.dim.disabled).toBe(0.58);
      expect(inks.dim.hidden).toBeGreaterThanOrEqual(0.45);
      expect(inks.dim.hidden).toBeLessThan(inks.dim.disabled);
    });
  }

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
  });
});
