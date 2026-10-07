// A disabled line's inks: drained of colour, its text faded toward the menu's
// ground no further than it stays readable, whatever the look.

import type { Look } from "@baselayer-sdk/autocomplete";

type Rgb = readonly [number, number, number];

/**
 * The least contrast a disabled line's name keeps on the ground, by the
 * formula: 3:1 or more once antialiasing a thin stroke has had its share.
 */
export const DISABLED_NAME_FLOOR = 4.6;

/**
 * Its other text and its icon keep this share of their own contrast, so they
 * read as dimmed on any ground, and never less than the floor below.
 */
export const DISABLED_TEXT_KEEPS = 0.4;

/** The least its other text and its icon keep, by the formula. */
export const DISABLED_TEXT_FLOOR = 1.8;

/** A look's `#rgb`, `#rrggbb` or `#rrggbbaa`, its alpha left out. */
function rgbOf(hex: string): Rgb {
  const digits = hex.slice(1);
  const full =
    digits.length === 3
      ? [...digits].map(digit => digit + digit).join("")
      : digits.slice(0, 6);
  return [0, 2, 4].map(at => parseInt(full.slice(at, at + 2), 16)) as [
    number,
    number,
    number,
  ];
}

function hexOf(rgb: Rgb): string {
  return `#${rgb.map(channel => Math.round(channel).toString(16).padStart(2, "0")).join("")}`;
}

/** `from` moved `toward` of the way to `to`, as `color-mix` in sRGB does. */
function mix(from: Rgb, to: Rgb, toward: number): Rgb {
  return from.map(
    (channel, at) => channel + (to[at]! - channel) * toward,
  ) as unknown as Rgb;
}

function luminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map(channel => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: Rgb, b: Rgb): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light! + 0.05) / (dark! + 0.05);
}

/**
 * How far `ink` moves toward `ground`, up to `most` of the way, and keeps
 * `floor`; none when it is at or under the floor already.
 */
function fadeShare(ink: Rgb, ground: Rgb, most: number, floor: number) {
  const holds = (toward: number) =>
    contrast(mix(ink, ground, toward), ground) >= floor;
  if (!holds(0)) return 0;
  if (holds(most)) return most;
  let [low, high] = [0, most];
  for (let step = 0; step < 24; step++) {
    const middle = (low + high) / 2;
    if (holds(middle)) low = middle;
    else high = middle;
  }
  return low;
}

/** A disabled line as the stylesheet's variables draw it. */
export interface DisabledInks {
  /** The whole line's filter: its colour drained (`--bl-ac-disabled-filter`). */
  filter: string;
  /** Its state squares' opacity (`--bl-ac-disabled-opacity`). */
  opacity: string;
  /** Its names' colour (`--bl-ac-disabled-name`). */
  name: string;
  /** Its other text's and its icon's colour (`--bl-ac-disabled-text`). */
  text: string;
  /** How much of the title's colour `name` keeps against the ground, in percent. */
  nameShare: number;
  /** How much of the subtitle's colour `text` keeps, in percent. */
  textShare: number;
}

/**
 * A disabled line under `look`: at `disabledDim` d, drained of colour by 2d,
 * its text moved up to d of the way toward the ground, its names no further
 * than 4.6:1 and the rest than 40% of its contrast (1.8:1 at least), and its
 * squares' opacity 1 - 0.8d. At 0, nothing changes.
 */
export function disabledInks(look: Look): DisabledInks {
  const dim = look.disabledDim;
  const ground = rgbOf(look.backgroundColor);
  const round = (value: number) => Math.round(value * 1000) / 1000;
  const faded = (color: string, floor: number) => {
    const ink = rgbOf(color);
    const share = fadeShare(ink, ground, dim, floor);
    return {
      hex: hexOf(mix(ink, ground, share)),
      kept: Math.round((1 - share) * 1000) / 10,
    };
  };
  const name = faded(look.titleColor, DISABLED_NAME_FLOOR);
  const text = faded(
    look.subtitleColor,
    Math.max(
      DISABLED_TEXT_FLOOR,
      contrast(rgbOf(look.subtitleColor), ground) * DISABLED_TEXT_KEEPS,
    ),
  );
  return {
    filter: dim === 0 ? "none" : `saturate(${round(Math.max(0, 1 - 2 * dim))})`,
    opacity: String(round(1 - 0.8 * dim)),
    name: name.hex,
    text: text.hex,
    nameShare: name.kept,
    textShare: text.kept,
  };
}
