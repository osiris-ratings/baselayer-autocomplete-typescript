// A disabled line's inks: its squares, flag and icons drained of colour, its
// text faded toward the menu's ground no further than it stays readable,
// whatever the look.

import type { Look } from "@baselayer-sdk/autocomplete";

type Rgb = readonly [number, number, number];

/**
 * The least contrast a disabled line's name keeps on the ground, by the
 * formula: 3:1 or more once antialiasing a thin stroke has had its share.
 */
export const DISABLED_NAME_FLOOR = 4.6;

/**
 * The least a disabled head's name keeps: drawn at the lines' weight, it
 * fades a step further than a line's name and still draws at 3:1 or more.
 */
export const DISABLED_HEAD_FLOOR = 3.5;

/**
 * Its other text and its icon keep this share of their own contrast, so they
 * read as dimmed on any ground, and never less than the floor below.
 */
export const DISABLED_TEXT_KEEPS = 0.4;

/** The least its other text and its icon keep, by the formula. */
export const DISABLED_TEXT_FLOOR = 1.8;

/**
 * How far a match mark's colour moves toward the ground per unit of
 * `disabledDim`: a third of the way by default, so it keeps its hue.
 */
export const DISABLED_MARK_FADE = 0.55;

/** A look's `#rgb`, `#rrggbb` or `#rrggbbaa`: its colour, and its alpha. */
function parse(hex: string): { rgb: Rgb; alpha: number } {
  const digits = hex.slice(1);
  const full =
    digits.length === 3
      ? [...digits].map(digit => digit + digit).join("")
      : digits;
  const channel = (at: number) => parseInt(full.slice(at, at + 2), 16);
  return {
    rgb: [channel(0), channel(2), channel(4)],
    alpha: full.length === 8 ? channel(6) / 255 : 1,
  };
}

/** A colour as it is drawn on `ground`: a translucent one shows the ground. */
function drawnOn(hex: string, ground: Rgb): Rgb {
  const { rgb, alpha } = parse(hex);
  return rounded(mix(ground, rgb, alpha));
}

/** A colour's channels as whole numbers, as a hex colour holds them. */
function rounded(rgb: Rgb): Rgb {
  return rgb.map(channel => Math.round(channel)) as unknown as Rgb;
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
  // Judged as drawn: the hex a share rounds to must keep the floor.
  const holds = (toward: number) =>
    contrast(rounded(mix(ink, ground, toward)), ground) >= floor;
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
  /** The squares', the flag's and the icons' filter (`--bl-ac-disabled-filter`). */
  filter: string;
  /** Its state squares' opacity (`--bl-ac-disabled-opacity`). */
  opacity: string;
  /** Its names' colour (`--bl-ac-disabled-name`). */
  name: string;
  /** A disabled head's name's colour (`--bl-ac-disabled-head-name`). */
  headName: string;
  /** Its other text's and its icon's colour (`--bl-ac-disabled-text`). */
  text: string;
  /** How much of the title's colour `name` keeps against the ground, in percent. */
  nameShare: number;
  /** How much of the title's colour `headName` keeps, in percent. */
  headNameShare: number;
  /** How much of the subtitle's colour `text` keeps, in percent. */
  textShare: number;
  /**
   * How much of its own colour a match mark keeps, in percent: its hue, a
   * little faded toward the ground (`--bl-ac-disabled-mark`).
   */
  markShare: number;
}

/**
 * A disabled line under `look`: at `disabledDim` d, its squares, flag and
 * icons drained of colour by 2d, its text moved up to d of the way toward the
 * ground, its names no further than 4.6:1 (a head's 3.5:1) and the rest than
 * 40% of its contrast (1.8:1 at least), and its squares' opacity 1 - 0.8d. At
 * 0, nothing changes.
 */
export function disabledInks(look: Look): DisabledInks {
  const dim = look.disabledDim;
  // A translucent ground shows whatever is under the menu, which is not known
  // here: its own colour stands in, and the floors hold only on that.
  const ground = parse(look.backgroundColor).rgb;
  const round = (value: number) => Math.round(value * 1000) / 1000;
  const faded = (color: string, floor: number) => {
    const ink = drawnOn(color, ground);
    const share = fadeShare(ink, ground, dim, floor);
    return {
      hex: hexOf(mix(ink, ground, share)),
      kept: Math.round((1 - share) * 1000) / 10,
    };
  };
  const name = faded(look.titleColor, DISABLED_NAME_FLOOR);
  const headName = faded(look.titleColor, DISABLED_HEAD_FLOOR);
  const text = faded(
    look.subtitleColor,
    Math.max(
      DISABLED_TEXT_FLOOR,
      contrast(drawnOn(look.subtitleColor, ground), ground) *
        DISABLED_TEXT_KEEPS,
    ),
  );
  return {
    filter: dim === 0 ? "none" : `saturate(${round(Math.max(0, 1 - 2 * dim))})`,
    opacity: String(round(1 - 0.8 * dim)),
    name: name.hex,
    headName: headName.hex,
    text: text.hex,
    nameShare: name.kept,
    headNameShare: headName.kept,
    textShare: text.kept,
    markShare: Math.round((1 - DISABLED_MARK_FADE * dim) * 1000) / 10,
  };
}
