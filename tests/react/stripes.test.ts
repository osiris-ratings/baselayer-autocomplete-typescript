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
// color and a tint or shade of it, in the same letter color the solid match
// background gives its text (`markTextColor`). With one letter color, both
// stripes have to read: WCAG AA, 4.5:1, for the normal-size text a name is.
// The ratios here are computed independently of the code under test.

const AA = 4.5;

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

const background = (color: string | null, over: Partial<Look> = {}): Look =>
  resolveLook({
    ...DEFAULT_LOOK,
    matchEmphasis: "background",
    matchEmphasisColor: color,
    ...over,
  });

/** The letters' color on the stripes: the solid mark's, else the name's own. */
const letterOf = (look: Look): string => markTextColor(look) ?? look.titleColor;

function expectReadable(look: Look, label: string) {
  const { solid, alt } = stripeColors(look);
  const letter = letterOf(look);

  expect(
    ratio(letter, solid),
    `${label}: ${letter} on ${solid}`,
  ).toBeGreaterThanOrEqual(AA);
  expect(
    ratio(letter, alt),
    `${label}: ${letter} on ${alt}`,
  ).toBeGreaterThanOrEqual(AA);
}

describe("the stripes of a corrected letter under the background emphasis", () => {
  describe("the three combinations Klemen found hard to read", () => {
    it("a saturated purple pill with white letters", () => {
      const look = background("#7c3aed");

      expect(letterOf(look)).toBe("#ffffff");
      expectReadable(look, "purple");
      // The match color is one stripe, where it reads on its own.
      expect(stripeColors(look).solid).toBe("#7c3aed");
      // The other is a shade of it, so that white still reads on it.
      expect(ratio("#ffffff", stripeColors(look).alt)).toBeGreaterThan(
        ratio("#ffffff", "#7c3aed"),
      );
    });

    it("a light green pill with dark letters", () => {
      const look = background("#c6f6d5");

      expect(letterOf(look)).toBe(look.titleColor.toLowerCase());
      expectReadable(look, "light green");
      expect(stripeColors(look).solid).toBe("#c6f6d5");
    });

    it("a dark olive green pill with white letters", () => {
      const look = background("#556b2f");

      expect(letterOf(look)).toBe("#ffffff");
      expectReadable(look, "olive");
      expect(stripeColors(look).solid).toBe("#556b2f");
    });
  });

  it("alternates two colors that can be told apart, wherever there is room", () => {
    for (const color of [
      "#7c3aed",
      "#c6f6d5",
      "#556b2f",
      "#e63b7a",
      "#fff3a3",
    ]) {
      const { solid, alt } = stripeColors(background(color));

      expect(solid, color).not.toBe(alt);
      expect(ratio(solid, alt), color).toBeGreaterThan(1.1);
    }
  });

  it("moves a match color the letters cannot read on to the nearest that they can, as a stripe", () => {
    // White on #e63b7a is 3.98:1: the solid mark lives with that, the stripes
    // are not allowed to.
    const look = background("#e63b7a");

    expect(letterOf(look)).toBe("#ffffff");
    expect(ratio("#ffffff", "#e63b7a")).toBeLessThan(AA);
    expectReadable(look, "pink");
    expect(stripeColors(look).solid).not.toBe("#e63b7a");
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
      expectReadable(background(color), color);
    });

    it.each(EXTREMES)("%s on a dark menu with light titles", color => {
      expectReadable(
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
      // Judged on whichever side of the fill the host's color falls: the
      // stripes move so it reads, as far as black reads at all.
      const { solid, alt } = stripeColors(look);

      expect(letterOf(look)).toBe("#101010");
      expect(ratio("#101010", solid)).toBeGreaterThanOrEqual(AA);
      expect(ratio("#101010", alt)).toBeGreaterThanOrEqual(AA);
    });

    it("a translucent match color, as it is drawn on the menu", () => {
      expectReadable(background("#7c3aed66"), "translucent purple");
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
        expectReadable(look, preset.name);
        return;
      }
      // No match color of its own: the preset's marker, which the stylesheet
      // stripes against the menu's ground, and the letters keep their ink.
      const marker = preset.vars["--bl-ac-marker"] ?? "#c6f6d5";
      const ground = look.backgroundColor;
      const half = (a: string, b: string) =>
        `#${[0, 2, 4]
          .map(at =>
            Math.round(
              (parseInt(a.slice(1 + at, 3 + at), 16) +
                parseInt(b.slice(1 + at, 3 + at), 16)) /
                2,
            )
              .toString(16)
              .padStart(2, "0"),
          )
          .join("")}`;

      expect(
        ratio(look.titleColor, marker),
        "the solid mark",
      ).toBeGreaterThanOrEqual(AA);
      expect(
        ratio(look.titleColor, half(marker, ground.slice(0, 7))),
      ).toBeGreaterThanOrEqual(AA);
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
