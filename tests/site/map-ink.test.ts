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
  });
});
