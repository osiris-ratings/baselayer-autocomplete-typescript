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
// color and a lighter tint of it, in the same letter color the solid match
// background gives its text (`markTextColor`). The first stripe is the match
// color itself, so the stripes join the pill they sit in; the second is as light
// as the letters still read on: WCAG AA (4.5:1) where the match color has the
// room, else 3:1, which is all a pill that falls short of AA itself leaves.
// The ratios here are computed independently of the code under test.

const AA = 4.5;
const FLOOR = 3;

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

function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(rgb(a)), luminance(rgb(b))].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const lightness = (hex: string) => luminance(rgb(hex));

const background = (color: string | null, over: Partial<Look> = {}): Look =>
  resolveLook({
    ...DEFAULT_LOOK,
    matchEmphasis: "background",
    matchEmphasisColor: color,
    ...over,
  });

/** The letters' color on the stripes: the solid mark's, else the name's own. */
const letterOf = (look: Look): string => markTextColor(look) ?? look.titleColor;

/**
 * The first stripe is the match color, the second a lighter tint (a little
 * darker only where the fill is already white) that the letters read on as the
 * pill allows, and the two can be told apart.
 */
function expectLighter(look: Look, label: string) {
  const { solid, alt } = stripeColors(look);
  const letter = letterOf(look);
  const own = ratio(letter, solid);

  expect(solid, `${label}: the first stripe is the match color`).toBe(
    (look.matchEmphasisColor ?? "#c6f6d5").toLowerCase().slice(0, 7),
  );
  expect(alt, `${label}: two colors`).not.toBe(solid);
  // Where the pill itself reads at least 3:1 under the letters, the second
  // stripe is lighter (unless the fill is white already) and keeps that, at AA
  // wherever the pill has AA to give. Where the pill is unreadable under the
  // letters (bright cyan under a light title) the solid mark has the same
  // fault, and there is no room to lighten: the stripe goes a little darker.
  if (own >= FLOOR) {
    if (lightness(solid) < 0.9) {
      expect(
        lightness(alt),
        `${label}: ${alt} is lighter than ${solid}`,
      ).toBeGreaterThan(lightness(solid));
    }
    const floor = own >= AA && ratio(letter, alt) >= AA ? AA : FLOOR;
    expect(
      ratio(letter, alt),
      `${label}: ${letter} on ${alt}`,
    ).toBeGreaterThanOrEqual(floor);
  }
}

describe("the stripes of a corrected letter under the background emphasis", () => {
  describe("the three combinations Klemen found hard to read, now with a lighter stripe", () => {
    it("a saturated purple pill with white letters", () => {
      const look = background("#7c3aed");
      const { solid, alt } = stripeColors(look);

      expect(letterOf(look)).toBe("#ffffff");
      expectLighter(look, "purple");
      expect(solid).toBe("#7c3aed");
      // Lighter, and white still reads on it at AA.
      expect(lightness(alt)).toBeGreaterThan(lightness("#7c3aed"));
      expect(ratio("#ffffff", alt)).toBeGreaterThanOrEqual(AA);
    });

    it("a light green pill with dark letters", () => {
      const look = background("#c6f6d5");
      const { solid, alt } = stripeColors(look);

      expect(letterOf(look)).toBe(look.titleColor.toLowerCase());
      expectLighter(look, "light green");
      expect(solid).toBe("#c6f6d5");
      expect(lightness(alt)).toBeGreaterThan(lightness(solid));
    });

    it("a dark olive green pill with white letters", () => {
      const look = background("#556b2f");
      const { solid, alt } = stripeColors(look);

      expect(letterOf(look)).toBe("#ffffff");
      expectLighter(look, "olive");
      expect(solid).toBe("#556b2f");
      expect(lightness(alt)).toBeGreaterThan(lightness(solid));
      expect(ratio("#ffffff", alt)).toBeGreaterThanOrEqual(AA);
    });
  });

  it("keeps the match color as the first stripe even where white letters fall short of AA on it, and lightens from there", () => {
    // White on #e63b7a is 3.98:1: the solid mark lives with that, and so do the
    // stripes, which are not made darker for it; the lighter one keeps 3:1.
    const look = background("#e63b7a");
    const { solid, alt } = stripeColors(look);

    expect(letterOf(look)).toBe("#ffffff");
    expect(ratio("#ffffff", "#e63b7a")).toBeLessThan(AA);
    expect(solid).toBe("#e63b7a");
    expect(lightness(alt)).toBeGreaterThan(lightness(solid));
    expect(ratio("#ffffff", alt)).toBeGreaterThanOrEqual(FLOOR);
    expectLighter(look, "pink");
  });

  it("alternates two colors that can be told apart", () => {
    for (const color of [
      "#7c3aed",
      "#c6f6d5",
      "#556b2f",
      "#e63b7a",
      "#fff3a3",
      "#fd971f",
    ]) {
      const { solid, alt } = stripeColors(background(color));

      expect(solid, color).not.toBe(alt);
      expect(ratio(solid, alt), color).toBeGreaterThanOrEqual(1.05);
    }
  });

  it("goes a little darker only where the fill has no room to be lighter", () => {
    for (const color of ["#ffffff", "#fafafa"]) {
      const { solid, alt } = stripeColors(background(color));

      expect(lightness(alt), color).toBeLessThan(lightness(solid));
      expect(
        ratio(letterOf(background(color)), alt),
        color,
      ).toBeGreaterThanOrEqual(AA);
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
      expectLighter(background(color), color);
    });

    it.each(EXTREMES)("%s on a dark menu with light titles", color => {
      expectLighter(
        background(color, {
          backgroundColor: "#111418",
          titleColor: "#f4f5f7",
          subtitleColor: "#9aa0aa",
        }),
        `${color} (dark)`,
      );
    });

    it.each(EXTREMES)("%s with a text color of the host's own", color => {
      const look = background(color, { matchEmphasisTextColor: "#101010" });
      const { solid, alt } = stripeColors(look);

      expect(letterOf(look)).toBe("#101010");
      expect(solid).toBe(color);
      expect(alt).not.toBe(solid);
      // The host's letter color judged as the pill allows, like any other.
      const own = ratio("#101010", solid);
      if (own >= FLOOR) {
        expect(ratio("#101010", alt)).toBeGreaterThanOrEqual(FLOOR);
      }
    });

    it("a translucent match color, as it is drawn on the menu", () => {
      const look = background("#7c3aed66");
      const { solid, alt } = stripeColors(look);

      expect(alt).not.toBe(solid);
      expect(lightness(alt)).toBeGreaterThan(lightness(solid));
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
        expectLighter(look, preset.name);
        return;
      }
      // No match color of its own: the preset's marker, which the stylesheet
      // stripes against the marker lightened by a third, the letters keeping
      // their ink.
      const marker = preset.vars["--bl-ac-marker"] ?? "#c6f6d5";
      const lightened = `#${[0, 2, 4]
        .map(at =>
          Math.round(
            parseInt(marker.slice(1 + at, 3 + at), 16) * 0.65 + 255 * 0.35,
          )
            .toString(16)
            .padStart(2, "0"),
        )
        .join("")}`;

      expect(
        ratio(look.titleColor, marker),
        "the solid mark",
      ).toBeGreaterThanOrEqual(AA);
      expect(lightness(lightened)).toBeGreaterThan(lightness(marker));
      expect(ratio(look.titleColor, lightened)).toBeGreaterThanOrEqual(FLOOR);
    });
  });

  describe("as the component hands them to the stylesheet", () => {
    it("sets both stripes, only under the background emphasis with a color of its own", () => {
      const vars = lookVariables(background("#7c3aed")) as Record<
        string,
        string
      >;

      expect(vars["--bl-ac-stripe"]).toBe("#7c3aed");
      expect(vars["--bl-ac-stripe-alt"]).toBe(
        stripeColors(background("#7c3aed")).alt,
      );
      // The letters' color is the solid mark's own.
      expect(vars["--bl-ac-mark-fg"]).toBe("#ffffff");

      for (const look of [
        background(null),
        { ...background("#7c3aed"), matchEmphasis: "underline" as const },
        { ...background("#7c3aed"), matchEmphasis: "weight" as const },
      ]) {
        const set = lookVariables(look) as Record<string, string>;
        expect(set["--bl-ac-stripe"]).toBeUndefined();
        expect(set["--bl-ac-stripe-alt"]).toBeUndefined();
      }
    });

    it("leaves the default look's variables as they were", () => {
      expect(Object.keys(lookVariables(DEFAULT_LOOK))).toEqual([]);
    });
  });
});
