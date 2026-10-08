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

const channels = (hex: string) =>
  [1, 3, 5].map(start => parseInt(hex.slice(start, start + 2), 16));

/** How far `at` lies along the way from `from` to `to`, 0 to 1, by channel. */
function toward(from: string, to: string, at: string): number {
  const [a, b, c] = [channels(from), channels(to), channels(at)];
  const along = b.map((channel, i) => channel - a[i]!);
  return (
    along.reduce((sum, d, i) => sum + d * (c[i]! - a[i]!), 0) /
    along.reduce((sum, d) => sum + d * d, 0)
  );
}

/** WCAG's contrast between two colours, both laid over `card` at `opacity`. */
function dimmed(
  ink: string,
  on: string,
  card: string,
  opacity: number,
): number {
  const under = channels(card);
  const luminance = (hex: string) =>
    channels(hex)
      .map((channel, i) => under[i]! + (channel - under[i]!) * opacity)
      .map(value => {
        const v = value / 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      })
      .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i]!, 0);
  const [light, dark] = [luminance(ink), luminance(on)].sort((a, b) => b - a);
  return (light! + 0.05) / (dark! + 0.05);
}

/** A colour's chroma, 0 to 1: how far its channels spread. */
function chroma(hex: string): number {
  const rgb = channels(hex);
  return (Math.max(...rgb) - Math.min(...rgb)) / 255;
}

/** A colour's lightness, 0 to 1, as HSL measures it. */
function light(hex: string): number {
  const rgb = channels(hex);
  return (Math.max(...rgb) + Math.min(...rgb)) / 2 / 255;
}

/** A colour's saturation, 0 to 1, as HSL measures it. */
function saturation(hex: string): number {
  const spread = chroma(hex);
  return spread === 0 ? 0 : spread / (1 - Math.abs(2 * light(hex) - 1));
}

/** A colour's hue, in degrees. */
function hue(hex: string): number {
  const [r, g, b] = channels(hex).map(channel => channel / 255) as [
    number,
    number,
    number,
  ];
  const degrees =
    (Math.atan2(Math.sqrt(3) * (g - b), 2 * r - g - b) * 180) / Math.PI;
  return (degrees + 360) % 360;
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
      // Less by no more than it takes for its labels to keep 2:1 and its
      // badges 1.75:1 on the card, a step at a time.
      const { look } = state;
      const keeps = (opacity: number) =>
        dimmed(inks.ink, ground, ground, opacity) >= 2 &&
        dimmed(
          look.pillForegroundColor,
          look.pillBackgroundColor,
          ground,
          opacity,
        ) >= 1.75 &&
        dimmed(
          look.structurePillForegroundColor,
          look.structurePillBackgroundColor,
          ground,
          opacity,
        ) >= 1.75;
      expect(keeps(inks.dim.hidden)).toBe(true);
      if (inks.dim.hidden > 0.38) {
        expect(keeps(inks.dim.hidden - 0.01)).toBe(false);
      }
    });

    it(`rings what the map focuses in the demo's blue, raised where the card would lose it, in ${preset.name}`, () => {
      const state = applyPreset(DEFAULT_STYLE, preset);
      const ground = state.look.backgroundColor.toLowerCase();
      const title = state.look.titleColor.toLowerCase();
      const { ring } = mapInks(state);

      // WCAG's 3:1 for a focus indicator, on the card it is drawn on.
      expect(contrast(ring, ground)).toBeGreaterThanOrEqual(3);
      if (contrast(BLUE, ground) >= 3) {
        expect(ring).toBe(BLUE);
      } else {
        // Raised toward the look's title, and no further than it has to be.
        expect(toward(BLUE, title, ring)).toBeGreaterThan(0);
        expect(toward(BLUE, title, ring)).toBeLessThanOrEqual(1);
        expect(contrast(ring, ground)).toBeLessThan(3.2);
      }
    });

    it(`draws the Disabled column's checkbox quiet but seen in ${preset.name}`, () => {
      const state = applyPreset(DEFAULT_STYLE, preset);
      const ground = state.look.backgroundColor.toLowerCase();
      const { check, ring } = mapInks(state);

      // An empty box's edge is faint, about 2:1 on the card and never under
      // 1.8; under the pointer it is a step stronger, about 3:1.
      expect(contrast(check.edge, ground)).toBeGreaterThanOrEqual(1.8);
      expect(contrast(check.edge, ground)).toBeLessThan(2.2);
      expect(contrast(check.hover, ground)).toBeGreaterThanOrEqual(3);
      expect(contrast(check.hover, ground)).toBeLessThan(3.3);
      // A checked box is the ring's blue, calmer: its hue kept, its colour
      // halved or less and its light no greater, so a white mark reads on it
      // at 4:1 or more.
      expect(hue(check.fill)).toBeCloseTo(hue(ring), -1);
      expect(chroma(check.fill)).toBeLessThanOrEqual(0.6 * chroma(ring));
      expect(light(check.fill)).toBeLessThanOrEqual(light(ring));
      expect(contrast("#ffffff", check.fill)).toBeGreaterThanOrEqual(4);
    });
  }

  it("darkens a checked box's fill until its white mark reads, where the ring is raised far", () => {
    // A mid-grey card: the ring is raised a long way toward the white title,
    // and calmed as on any look, it would carry a white mark at under 3:1.
    const card = "#474747";
    const state = {
      ...DEFAULT_STYLE,
      look: {
        ...DEFAULT_STYLE.look,
        backgroundColor: card,
        titleColor: "#ffffff",
        subtitleColor: "#dddddd",
      },
      vars: { ...DEFAULT_STYLE.vars, "--bl-ac-highlight-bg": card },
    };
    const { check, ring } = mapInks(state);
    expect(contrast(ring, card)).toBeGreaterThanOrEqual(3);
    expect(contrast("#ffffff", check.fill)).toBeGreaterThanOrEqual(4);
    expect(contrast("#ffffff", check.fill)).toBeLessThan(4.2);
    expect(hue(check.fill)).toBeCloseTo(hue(ring), -1);
  });

  it("keeps a checked box's fill a calm colour, not a grey, on a card that raises the ring near white", () => {
    // A mid-grey card and a white title: the ring is raised to a pale tint.
    const card = "#777777";
    const state = {
      ...DEFAULT_STYLE,
      look: {
        ...DEFAULT_STYLE.look,
        backgroundColor: card,
        titleColor: "#ffffff",
      },
      vars: { ...DEFAULT_STYLE.vars, "--bl-ac-highlight-bg": card },
    };
    const { check, ring } = mapInks(state);
    expect(saturation(check.fill)).toBeGreaterThanOrEqual(0.3);
    expect(hue(check.fill)).toBeCloseTo(hue(ring), -1);
    expect(contrast("#ffffff", check.fill)).toBeGreaterThanOrEqual(4);
  });

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
    expect(mapInks(odd).check.fill).toMatch(/^#[0-9a-f]{6}$/);
  });
});
