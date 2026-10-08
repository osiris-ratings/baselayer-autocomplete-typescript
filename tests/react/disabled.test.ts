import { describe, expect, it } from "vitest";

import { DEFAULT_LOOK, resolveLook } from "@baselayer-sdk/autocomplete";

import { PRESETS } from "../../site/demo/style-state";
import {
  DISABLED_HEAD_FLOOR,
  DISABLED_NAME_FLOOR,
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
    it(`keep their floors as the hex they are drawn in, on ${name}`, () => {
      const inks = disabledInks(look);
      const ground = look.backgroundColor;
      expect(contrast(inks.name, ground)).toBeGreaterThanOrEqual(
        DISABLED_NAME_FLOOR,
      );
      expect(contrast(inks.text, ground)).toBeGreaterThanOrEqual(
        Math.max(
          DISABLED_TEXT_FLOOR,
          contrast(look.subtitleColor, ground) * DISABLED_TEXT_KEEPS,
        ),
      );
      // A head's name fades well past a line's, to its own floor: it may go
      // twice as far, so on a dark ground too the floor is what stops it.
      expect(contrast(inks.headName, ground)).toBeGreaterThanOrEqual(
        DISABLED_HEAD_FLOOR,
      );
      expect(contrast(inks.headName, ground)).toBeLessThan(
        DISABLED_HEAD_FLOOR + 0.05,
      );
      expect(contrast(inks.headName, ground)).toBeLessThan(
        contrast(inks.name, ground),
      );
    });
  }

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
