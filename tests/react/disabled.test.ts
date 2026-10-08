import { describe, expect, it } from "vitest";

import { DEFAULT_LOOK, resolveLook } from "@baselayer-sdk/autocomplete";

import { PRESETS } from "../../site/demo/style-state";
import {
  DISABLED_NAME_FLOOR,
  DISABLED_ROLE_FLOOR,
  DISABLED_TEXT_FLOOR,
  DISABLED_TEXT_KEEPS,
  disabledInks,
} from "../../src/react/disabled";

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
