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
// color and the menu's own ground showing through, never a darker or another
// color, in the letters the solid fill has (`markTextColor`): they are never
// picked again for the stripes. The first stripe is the match color itself, so
// the stripes join the pill; the second is the same color made transparent as
// far as those letters still read on it once it is over the ground: all the
// way (the bare ground) where they read on it, as dark letters on a light fill
// do, and as little as they need where they do not, as white letters on a dark
// fill over a white menu do. WCAG AA (4.5:1) where the match color has the room
// and the stripes can still be told apart, else 3:1, else down to 2:1, which a
// mid-tone fill under white letters (white on #ff6a00 is 2.9:1) needs to keep
// stripes at all. The ratios here are computed independently of the code under
// test.

const AA = 4.5;
const FLOOR = 3;
const LEGIBLE = 2;
const VISIBLE = 1.4;
// What is still a hatch rather than one color: the faintest the stripes get,
// by a pale pill under white letters that cannot go under 2:1 on the stripe.
const HATCH = 1.2;

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

/** A color of hue `h` (degrees), saturation `s` and lightness `l`, as `#rrggbb`. */
function hsl(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const channel = (n: number) => {
    const k = (n + h / 30) % 12;
    const value = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(value * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
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

const MENUS: [string, Partial<Look>][] = [
  ["white menu", {}],
  ["dark menu", DARK_MENU],
];

/** The letters on the stripes: the solid mark's, else the name's own. */
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

/** Every color of the wheel, light to dark, and every grey. */
const WHEEL: string[] = [];
for (const hue of [0, 25, 50, 90, 120, 160, 190, 210, 250, 280, 320]) {
  for (const saturation of [0.9, 0.5]) {
    for (let lightness = 0.1; lightness <= 0.951; lightness += 0.05) {
      WHEEL.push(hsl(hue, saturation, lightness));
    }
  }
}
for (let level = 0x10; level <= 0xf0; level += 0x08) {
  WHEEL.push(`#${level.toString(16).padStart(2, "0").repeat(3)}`);
}

describe("the stripes of a corrected letter under the background emphasis", () => {
  it.each(MENUS)(
    "are the match color and the same color over the %s, never another color",
    (_, menu) => {
      for (const color of WHEEL) {
        const look = background(color, menu);
        const d = drawn(look);

        expect(d.solid, color).toEqual(rgb(color));
        expect(d.channels, color).toEqual(rgb(color));
        expect(d.opacity, color).toBeGreaterThanOrEqual(0);
        expect(d.opacity, color).toBeLessThanOrEqual(1);
        // Never darker than the match color over a white menu, nor lighter over a dark one.
        const lighter = luminance(d.ground) >= luminance(d.solid);
        expect(
          lighter
            ? luminance(d.second) >= luminance(d.solid) - 1e-9
            : luminance(d.second) <= luminance(d.solid) + 1e-9,
          `${color}: ${d.second} against ${d.solid}`,
        ).toBe(true);
      }
    },
  );

  it("hands the stylesheet the two stripes and never a letter color of its own", () => {
    const look = background("#7c3aed");
    const vars = lookVariables(look) as Record<string, string>;

    expect(vars["--bl-ac-stripe"]).toBe("#7c3aed");
    expect(vars["--bl-ac-stripe-alt"]).toBe(stripeColors(look).alt);
    expect(vars["--bl-ac-stripe-alt"]).toMatch(
      /^rgba\(124, 58, 237, [\d.]+\)$/,
    );
    // The letters are the solid mark's own.
    expect(vars["--bl-ac-mark-fg"]).toBe("#ffffff");
    expect(vars).not.toHaveProperty("--bl-ac-stripe-fg");

    for (const other of [
      background(null),
      { ...background("#7c3aed"), matchEmphasis: "underline" as const },
      { ...background("#7c3aed"), matchEmphasis: "weight" as const },
    ]) {
      const set = lookVariables(other) as Record<string, string>;
      expect(set["--bl-ac-stripe"]).toBeUndefined();
      expect(set["--bl-ac-stripe-alt"]).toBeUndefined();
    }
    expect(Object.keys(lookVariables(DEFAULT_LOOK))).toEqual([]);
  });

  describe("where the letters read on the bare ground, it is all of it", () => {
    it.each([
      ["#c6f6d5", "a light green pill, dark letters"],
      ["#ff8647", "a light orange pill, dark letters"],
      ["#ffb5af", "a light pink pill, dark letters"],
    ])("%s (%s) over a white menu is the pill and the bare menu", color => {
      const d = drawn(background(color));

      expect(d.opacity).toBe(0);
      expect(d.second).toEqual([255, 255, 255]);
      expect(ratioOf(d.letters, d.second)).toBeGreaterThanOrEqual(AA);
    });

    it.each(["#7c3aed", "#556b2f", "#e63b7a", "#ff6a00", "#a52d16"])(
      "%s over a dark menu is the pill and the bare menu: white letters read on it",
      color => {
        const d = drawn(background(color, DARK_MENU));

        expect(d.opacity).toBe(0);
        expect(d.second).toEqual(d.ground);
        expect(ratioOf(d.letters, d.second)).toBeGreaterThanOrEqual(AA);
      },
    );
  });

  describe("where white letters cannot read on the bare ground, the second stripe is as transparent as they allow", () => {
    it.each(["#7c3aed", "#556b2f", "#a52d16"])(
      "%s over a white menu: fainter, the letters at 3:1 or more and the stripes clearly two",
      color => {
        const look = background(color);
        const d = drawn(look);

        expect(markTextColor(look)).toBe("#ffffff");
        expect(d.opacity).toBeGreaterThan(0);
        expect(d.opacity).toBeLessThan(1);
        expect(ratioOf(d.letters, d.second)).toBeGreaterThanOrEqual(FLOOR);
        expect(ratioOf(d.solid, d.second)).toBeGreaterThanOrEqual(VISIBLE);
        // As transparent as they allow: a hundredth more takes them under.
        const more = Math.round((d.opacity - 0.01) * 100) / 100;
        const floor = ratioOf(d.letters, d.second) >= AA ? AA : FLOOR;
        expect(
          ratioOf(d.letters, over(d.channels, more, d.ground)),
          `${color} at ${more}`,
        ).toBeLessThan(floor);
      },
    );

    it.each(["#ff6a00", "#929292", "#d95000"])(
      "%s, which white letters read 4.5:1 or less on, keeps stripes that are seen, the letters at 2:1 or more",
      color => {
        const d = drawn(background(color));

        expect(ratioOf(d.solid, d.second), color).toBeGreaterThanOrEqual(
          VISIBLE,
        );
        expect(ratioOf(d.letters, d.second), color).toBeGreaterThanOrEqual(
          LEGIBLE,
        );
        expect(d.opacity, color).toBeLessThan(1);
      },
    );
  });

  it.each(MENUS)(
    "never lose the stripes where the pill shows against the %s, and keep the letters legible on both",
    (_, menu) => {
      const faint: string[] = [];
      const dim: string[] = [];
      for (const color of WHEEL) {
        const look = background(color, menu);
        const d = drawn(look);

        // A pill that stands out from the menu by 2:1 or more has stripes that
        // can be told apart.
        if (
          ratioOf(d.solid, d.ground) >= 2 &&
          ratioOf(d.solid, d.second) < HATCH
        ) {
          faint.push(`${color} ${ratioOf(d.solid, d.second).toFixed(2)}`);
        }
        // The letters read on the second stripe at 2:1 or more, wherever the
        // pill gives them that much.
        if (
          ratioOf(d.letters, d.solid) >= LEGIBLE &&
          ratioOf(d.letters, d.second) < LEGIBLE
        ) {
          dim.push(`${color} ${ratioOf(d.letters, d.second).toFixed(2)}`);
        }
      }
      expect(faint, "colors whose stripes are faint").toEqual([]);
      expect(dim, "colors whose letters are lost on the second stripe").toEqual(
        [],
      );
    },
  );

  it("keep the letters of the solid mark on a dark menu, the menu's own dark on a light fill", () => {
    const look = background("#ffb5af", DARK_MENU);
    const d = drawn(look);

    expect(markTextColor(look)).toBe("#111418");
    expect(ratioOf(d.letters, d.solid)).toBeGreaterThanOrEqual(AA);
    expect(ratioOf(d.letters, d.second)).toBeGreaterThanOrEqual(FLOOR);
  });

  describe("the demo's presets, with the background emphasis on", () => {
    it.each(PRESETS.map(preset => [preset.name, preset] as const))(
      "%s",
      (_, preset) => {
        const look = resolveLook({
          ...preset.look,
          ...preset.highlight,
          matchEmphasis: "background",
        });
        if (look.matchEmphasisColor === null) {
          // The preset's marker, which the stylesheet stripes against the bare
          // ground, the letters keeping their ink.
          const marker = rgb(preset.vars["--bl-ac-marker"] ?? "#c6f6d5");
          const ink = rgb(look.titleColor);
          expect(ratioOf(ink, marker), "the solid mark").toBeGreaterThanOrEqual(
            AA,
          );
          expect(
            ratioOf(ink, rgb(look.backgroundColor)),
            "the bare ground",
          ).toBeGreaterThanOrEqual(AA);
          return;
        }
        const d = drawn(look);

        expect(d.channels).toEqual(rgb(look.matchEmphasisColor));
        expect(ratioOf(d.letters, d.second)).toBeGreaterThanOrEqual(LEGIBLE);
      },
    );
  });
});
