import { describe, expect, it } from "vitest";

import {
  DEFAULT_LOOK,
  resolveLook,
  type Look,
} from "@baselayer-sdk/autocomplete";

import { PRESETS } from "../../site/demo/style-state";
import { markTextColor, stripeColors } from "../../src/react/disabled";
import { lookVariables } from "../../src/react/viewParts";

// A corrected letter under the background emphasis sits on stripes of the match
// color and the same color more transparent, in the letter color the solid
// match background gives its text (`markTextColor`). The first stripe is the
// match color itself, so the stripes join the pill they sit in; the second lets
// the menu's ground show through, light or dark, as far as the letters still
// read on it: WCAG AA (4.5:1) where the match color has the room, else 3:1,
// which is all a pill that falls short of AA itself leaves. The ratios here are
// computed independently of the code under test.

const AA = 4.5;
const FLOOR = 3;
const MOST_TRANSPARENT = 0.35;

type Rgb = [number, number, number];

function rgb(hex: string): Rgb {
  const full =
    hex.length === 4
      ? [...hex.slice(1)].map(d => d + d).join("")
      : hex.slice(1, 7);
  return [0, 2, 4].map(at => parseInt(full.slice(at, at + 2), 16)) as Rgb;
}

function luminance(color: Rgb): number {
  const [r, g, b] = color.map(channel => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function ratioOf(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

/** An `rgba(r, g, b, a)` as its channels and its opacity. */
function rgba(color: string): { channels: Rgb; opacity: number } {
  const [r, g, b, a] = color.match(/[\d.]+/g)!.map(Number);
  return { channels: [r!, g!, b!], opacity: a ?? 1 };
}

/** `color` at `opacity` over `ground`, as it is drawn. */
function over(color: Rgb, opacity: number, ground: Rgb): Rgb {
  return color.map((channel, at) =>
    Math.round(ground[at]! + (channel - ground[at]!) * opacity),
  ) as Rgb;
}

const background = (color: string | null, extra: Partial<Look> = {}): Look =>
  resolveLook({
    ...DEFAULT_LOOK,
    matchEmphasis: "background",
    matchEmphasisColor: color,
    ...extra,
  });

const DARK_MENU: Partial<Look> = {
  backgroundColor: "#111418",
  titleColor: "#f4f5f7",
  subtitleColor: "#9aa0aa",
};

/** The letters' color on the stripes: the solid mark's, else the name's own. */
const letterOf = (look: Look): Rgb =>
  rgb(markTextColor(look) ?? look.titleColor);

/** What the stripes are, as drawn: the first, and the second over the ground. */
function drawn(look: Look) {
  const { solid, alt } = stripeColors(look);
  const { channels, opacity } = rgba(alt);
  const ground = rgb(look.backgroundColor);
  return {
    solid: rgb(solid),
    second: over(channels, opacity, ground),
    opacity,
    channels,
    ground,
    letters: letterOf(look),
  };
}

/**
 * The first stripe is the match color, the second the same color at some
 * opacity, no more transparent than the minimum, and the letters read on it as
 * the pill allows.
 */
function expectTransparent(look: Look, label: string) {
  const d = drawn(look);
  const color = (look.matchEmphasisColor ?? "#c6f6d5").toLowerCase();

  expect(d.solid, `${label}: the first stripe is the match color`).toEqual(
    rgb(color),
  );
  expect(d.channels, `${label}: the second is the same color`).toEqual(
    rgb(color),
  );
  expect(d.opacity, label).toBeGreaterThanOrEqual(MOST_TRANSPARENT);
  expect(d.opacity, label).toBeLessThanOrEqual(1);
  // Where the pill itself reads at least 3:1 under the letters, so does the
  // second stripe over the ground.
  if (ratioOf(d.letters, d.solid) >= FLOOR) {
    expect(
      ratioOf(d.letters, d.second),
      `${label}: letters on ${d.second}`,
    ).toBeGreaterThanOrEqual(FLOOR);
  }
}

describe("the stripes of a corrected letter under the background emphasis", () => {
  describe("the three combinations Klemen found hard to read, on a white menu", () => {
    it("a saturated purple pill with white letters", () => {
      const look = background("#7c3aed");
      const d = drawn(look);

      expect(markTextColor(look)).toBe("#ffffff");
      expectTransparent(look, "purple");
      // White letters over a white menu cannot have AA and a stripe that can be
      // seen at once: AA would leave it at about 1.2:1. The stripe is as
      // transparent as 3:1 lets it be, a clear 1.4:1 or more from the pill.
      expect(ratioOf(d.letters, d.second)).toBeGreaterThanOrEqual(FLOOR);
      expect(ratioOf(d.solid, d.second)).toBeGreaterThanOrEqual(1.4);
      const more = Math.round((d.opacity - 0.01) * 100) / 100;
      expect(ratioOf(d.letters, over(d.channels, more, d.ground))).toBeLessThan(
        FLOOR,
      );
      // More transparent than the match color: lighter, over white.
      expect(luminance(d.second)).toBeGreaterThan(luminance(d.solid));
    });

    it("a light green pill with dark letters, at the most transparent", () => {
      const look = background("#c6f6d5");
      const d = drawn(look);

      expect(markTextColor(look)).toBe(look.titleColor.toLowerCase());
      expectTransparent(look, "light green");
      expect(d.opacity).toBe(MOST_TRANSPARENT);
      expect(ratioOf(d.letters, d.second)).toBeGreaterThanOrEqual(AA);
    });

    it("a dark olive green pill with white letters", () => {
      const look = background("#556b2f");
      const d = drawn(look);

      expect(markTextColor(look)).toBe("#ffffff");
      expectTransparent(look, "olive");
      expect(ratioOf(d.letters, d.second)).toBeGreaterThanOrEqual(FLOOR);
      expect(ratioOf(d.solid, d.second)).toBeGreaterThanOrEqual(1.4);
      expect(luminance(d.second)).toBeGreaterThan(luminance(d.solid));
    });
  });

  it("keeps the match color as the first stripe even where white letters fall short of AA on it, and goes transparent from there", () => {
    // White on #e63b7a is 3.98:1: the solid mark lives with that, and so do the
    // stripes, whose second keeps 3:1.
    const look = background("#e63b7a");
    const d = drawn(look);

    expect(markTextColor(look)).toBe("#ffffff");
    expect(ratioOf(d.letters, d.solid)).toBeLessThan(AA);
    expectTransparent(look, "pink");
    expect(d.opacity).toBeLessThan(1);
  });

  describe("on a dark menu, where a lighter stripe would fight the background", () => {
    it.each(["#7c3aed", "#556b2f", "#e63b7a", "#c6f6d5", "#fd971f"])(
      "%s: the second stripe is the most transparent, and darker than the first",
      color => {
        const look = background(color, DARK_MENU);
        const d = drawn(look);

        expectTransparent(look, `${color} (dark)`);
        // The menu's dark ground shows through, so it is darker, not lighter.
        expect(d.opacity).toBe(MOST_TRANSPARENT);
        expect(luminance(d.second)).toBeLessThan(luminance(d.solid));
        // And over a dark menu the letters lose nothing: AA wherever the pill has it.
        if (ratioOf(d.letters, d.solid) >= AA) {
          expect(ratioOf(d.letters, d.second)).toBeGreaterThanOrEqual(AA);
        }
      },
    );

    it("the same color goes lighter over a light menu and darker over a dark one", () => {
      const light = drawn(background("#7c3aed"));
      const dark = drawn(background("#7c3aed", DARK_MENU));

      expect(luminance(light.second)).toBeGreaterThan(luminance(light.solid));
      expect(luminance(dark.second)).toBeLessThan(luminance(dark.solid));
    });
  });

  it("alternates two colors that can be told apart where the ground is not the match color", () => {
    for (const color of [
      "#7c3aed",
      "#556b2f",
      "#e63b7a",
      "#fd971f",
      "#000000",
    ]) {
      const d = drawn(background(color));

      expect(ratioOf(d.solid, d.second), color).toBeGreaterThanOrEqual(1.05);
    }
  });

  describe("custom colors at the light and dark extremes", () => {
    const EXTREMES = [
      "#000000",
      "#ffffff",
      "#fafafa",
      "#050505",
      "#7f7f7f",
      "#767676",
      "#777777",
      "#808080",
      "#ffff00",
      "#00ffff",
      "#0000ff",
      "#ff0000",
      "#00ff00",
      "#800000",
    ];

    it.each(EXTREMES)("%s on a white menu", color => {
      expectTransparent(background(color), color);
    });

    it.each(EXTREMES)("%s on a dark menu with light titles", color => {
      expectTransparent(background(color, DARK_MENU), `${color} (dark)`);
    });

    it.each(EXTREMES)("%s with a text color of the host's own", color => {
      const look = background(color, { matchEmphasisTextColor: "#101010" });
      const d = drawn(look);

      expect(markTextColor(look)).toBe("#101010");
      expect(d.solid).toEqual(rgb(color));
      if (ratioOf(d.letters, d.solid) >= FLOOR) {
        expect(ratioOf(d.letters, d.second)).toBeGreaterThanOrEqual(FLOOR);
      }
    });

    it("a translucent match color, as it is drawn on the menu", () => {
      const look = background("#7c3aed66");
      const d = drawn(look);

      expect(d.opacity).toBeGreaterThanOrEqual(MOST_TRANSPARENT);
      expect(ratioOf(d.letters, d.second)).toBeGreaterThanOrEqual(FLOOR);
    });
  });

  describe("the demo's presets, with the background emphasis on", () => {
    const named = PRESETS.map(preset => [preset.name, preset] as const);

    it.each(named)("%s", (_, preset) => {
      const look = resolveLook({
        ...preset.look,
        ...preset.highlight,
        matchEmphasis: "background",
      });

      if (look.matchEmphasisColor !== null) {
        expectTransparent(look, preset.name);
        return;
      }
      // No match color of its own: the preset's marker, which the stylesheet
      // stripes against the marker at 40%, the letters keeping their ink.
      const marker = rgb(preset.vars["--bl-ac-marker"] ?? "#c6f6d5");
      const ground = rgb(look.backgroundColor);
      const second = over(marker, 0.4, ground);
      const ink = rgb(look.titleColor);

      expect(ratioOf(ink, marker), "the solid mark").toBeGreaterThanOrEqual(AA);
      expect(ratioOf(ink, second)).toBeGreaterThanOrEqual(FLOOR);
    });
  });

  describe("as the component hands them to the stylesheet", () => {
    it("sets both stripes, only under the background emphasis with a color of its own", () => {
      const look = background("#7c3aed");
      const vars = lookVariables(look) as Record<string, string>;

      expect(vars["--bl-ac-stripe"]).toBe("#7c3aed");
      expect(vars["--bl-ac-stripe-alt"]).toBe(stripeColors(look).alt);
      expect(vars["--bl-ac-stripe-alt"]).toMatch(
        /^rgba\(124, 58, 237, 0\.\d+\)$/,
      );
      // The letters' color is the solid mark's own.
      expect(vars["--bl-ac-mark-fg"]).toBe("#ffffff");

      for (const other of [
        background(null),
        { ...background("#7c3aed"), matchEmphasis: "underline" as const },
        { ...background("#7c3aed"), matchEmphasis: "weight" as const },
      ]) {
        const set = lookVariables(other) as Record<string, string>;
        expect(set["--bl-ac-stripe"]).toBeUndefined();
        expect(set["--bl-ac-stripe-alt"]).toBeUndefined();
      }
    });

    it("leaves the default look's variables as they were", () => {
      expect(Object.keys(lookVariables(DEFAULT_LOOK))).toEqual([]);
    });
  });
});
