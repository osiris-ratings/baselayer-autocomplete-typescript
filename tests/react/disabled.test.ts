import { describe, expect, it } from "vitest";

import { DEFAULT_LOOK, resolveLook } from "@baselayer-sdk/autocomplete";

import { PRESETS } from "../../site/demo/style-state";
import {
  DISABLED_NAME_FLOOR,
  DISABLED_ROLE_FLOOR,
  DISABLED_TEXT_FLOOR,
  DISABLED_TEXT_KEEPS,
  disabledInks,
  markTextColor,
} from "../../src/react/disabled";
import { lookVariables } from "../../src/react/viewParts";

type Rgb = [number, number, number];

function rgb(hex: string): Rgb {
  const digits = hex.slice(1, 7);
  return [0, 2, 4].map(at => parseInt(digits.slice(at, at + 2), 16)) as Rgb;
}

function luminance(color: Rgb): number {
  const [r, g, b] = color.map(channel => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(rgb(a)), luminance(rgb(b))].sort(
    (x, y) => y - x,
  );
  return (light! + 0.05) / (dark! + 0.05);
}

const LOOKS = [
  { name: "the default", look: DEFAULT_LOOK },
  ...PRESETS.map(preset => ({
    name: preset.name,
    look: resolveLook(preset.look),
  })),
];

// The letters on a background mark: on a fill of the host's, white or the
// title's color, whichever APCA (the WCAG 3 draft's perceptual contrast)
// reads better; the WCAG 2 ratio calls a mid-tone pink even, and leans dark.
describe("a background mark's letters", () => {
  const pick = (matchEmphasisColor: string) =>
    markTextColor({ ...DEFAULT_LOOK, matchEmphasisColor });

  it("are white on a saturated fill, dark on a light one", () => {
    for (const fill of [
      "#e63b7a",
      "#D53F8C",
      "#38a169",
      "#384ce3",
      "#94540f",
    ]) {
      expect(pick(fill), fill).toBe("#ffffff");
    }
    for (const fill of ["#fd971f", "#fb923c", "#f0abfc", "#fff3a3"]) {
      expect(pick(fill), fill).toBe(DEFAULT_LOOK.titleColor.toLowerCase());
    }
  });

  describe("on a dark menu", () => {
    // The title's color is light there, so white and the title are both light:
    // a light fill needs the menu's own dark for letters, or they sit at 1.8:1.
    const DARK = {
      ...DEFAULT_LOOK,
      backgroundColor: "#0f1424",
      titleColor: "#f4f5f7",
      subtitleColor: "#9aa0aa",
    };
    const onDark = (matchEmphasisColor: string) =>
      markTextColor({ ...DARK, matchEmphasisColor });

    it("are the menu's own dark on a light fill, where white and the title would not read", () => {
      for (const fill of ["#ffb5af", "#fd971f", "#fff3a3", "#c6f6d5"]) {
        const letters = onDark(fill)!;

        expect(letters, fill).toBe("#0f1424");
        expect(contrast(letters, fill), fill).toBeGreaterThanOrEqual(4.5);
      }
    });

    it("stay white on a dark fill", () => {
      for (const fill of ["#7c3aed", "#556b2f", "#e63b7a", "#384ce3"]) {
        expect(onDark(fill), fill).toBe("#ffffff");
      }
    });
  });

  it("read a translucent fill as it is drawn on the menu", () => {
    // Half the pink on white is a light pink: dark letters read better.
    expect(pick("#e63b7a80")).toBe(DEFAULT_LOOK.titleColor.toLowerCase());
  });

  it("are the look's own when it sets them, and left be on the default marker", () => {
    expect(
      markTextColor({
        ...DEFAULT_LOOK,
        matchEmphasisColor: "#e63b7a",
        matchEmphasisTextColor: "#fff3a3",
      }),
    ).toBe("#fff3a3");
    expect(markTextColor(DEFAULT_LOOK)).toBeNull();
  });

  it("reach the stylesheet as --bl-ac-mark-fg, only when there is one", () => {
    expect(
      lookVariables({ ...DEFAULT_LOOK, matchEmphasisColor: "#e63b7a" }),
    ).toMatchObject({ "--bl-ac-mark-fg": "#ffffff" });
    expect(lookVariables(DEFAULT_LOOK)).not.toHaveProperty("--bl-ac-mark-fg");
  });
});

describe("a disabled line's inks", () => {
  for (const { name, look } of LOOKS) {
    it(`keep their floors as the hex they are drawn in, and reach them, on ${name}`, () => {
      const inks = disabledInks(look);
      const ground = look.backgroundColor;
      const kept = contrast(look.subtitleColor, ground) * DISABLED_TEXT_KEEPS;
      // Each may go twice the dim of the way, so by default its floor is what
      // stops it: a name's, a head's or a line's alike.
      for (const [part, ink, floor] of [
        ["name", inks.name, DISABLED_NAME_FLOOR],
        ["text", inks.text, Math.max(DISABLED_TEXT_FLOOR, kept)],
        ["role", inks.role, Math.max(DISABLED_ROLE_FLOOR, kept)],
      ] as const) {
        expect(contrast(ink, ground), part).toBeGreaterThanOrEqual(floor);
        expect(contrast(ink, ground), part).toBeLessThan(floor + 0.05);
      }
    });
  }

  it("keep a quarter of a strong subtitle's contrast, above the floors", () => {
    // Black on white is 21:1, and a quarter of it is past every floor.
    const inks = disabledInks({ ...DEFAULT_LOOK, subtitleColor: "#000000" });
    for (const [part, ink] of [
      ["text", inks.text],
      ["role", inks.role],
    ] as const) {
      expect(contrast(ink, "#ffffff"), part).toBeGreaterThanOrEqual(5.25);
      expect(contrast(ink, "#ffffff"), part).toBeLessThan(5.3);
      expect(ink, part).toBe("#6c6c6c");
    }
  });

  for (const { name, look } of LOOKS) {
    it(`draw a real colour on the ground's side at disabledDim 1, every share a share, on ${name}`, () => {
      const at = { ...look, disabledDim: 1 };
      const inks = disabledInks(at);
      const ground = look.backgroundColor;
      const kept = contrast(look.subtitleColor, ground) * DISABLED_TEXT_KEEPS;
      for (const [part, ink, floor] of [
        ["name", inks.name, DISABLED_NAME_FLOOR],
        ["text", inks.text, Math.max(DISABLED_TEXT_FLOOR, kept)],
        ["role", inks.role, Math.max(DISABLED_ROLE_FLOOR, kept)],
      ] as const) {
        expect(ink, part).toMatch(/^#[0-9a-f]{6}$/);
        expect(contrast(ink, ground), part).toBeGreaterThanOrEqual(floor);
      }
      for (const share of [
        inks.nameShare,
        inks.textShare,
        inks.roleShare,
        inks.markShare,
      ]) {
        expect(share).toBeGreaterThanOrEqual(0);
        expect(share).toBeLessThanOrEqual(100);
      }
    });
  }

  it("move every text twice the dim of the way, short of its floor", () => {
    const light = PRESETS.find(preset => preset.name === "Light")!;
    const inks = disabledInks({ ...resolveLook(light.look), disabledDim: 0.2 });
    // 0.4 of the way leaves each above its floor, so the dim decides.
    expect(inks.nameShare).toBe(60);
    expect(inks.textShare).toBe(60);
    expect(inks.roleShare).toBe(60);
  });

  it("fade a translucent title as it is drawn, over the ground", () => {
    // #1a202c at half alpha over white is drawn as this.
    const composite = `#${[0x1a, 0x20, 0x2c]
      .map(channel =>
        Math.round(channel * (128 / 255) + 255 * (1 - 128 / 255))
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")}`;

    expect(
      disabledInks({ ...DEFAULT_LOOK, titleColor: "#1a202c80" }).name,
    ).toBe(disabledInks({ ...DEFAULT_LOOK, titleColor: composite }).name);
    expect(
      disabledInks({ ...DEFAULT_LOOK, titleColor: "#1a202cff" }).name,
    ).toBe(disabledInks({ ...DEFAULT_LOOK, titleColor: "#1a202c" }).name);
    // A title with no alpha at all is the ground: nothing to fade.
    expect(
      disabledInks({ ...DEFAULT_LOOK, titleColor: "#1a202c00" }).name,
    ).toBe("#ffffff");
  });

  it("fade a translucent subtitle as it is drawn, over the ground", () => {
    expect(
      disabledInks({ ...DEFAULT_LOOK, subtitleColor: "#71809600" }).text,
    ).toBe("#ffffff");
  });
});
