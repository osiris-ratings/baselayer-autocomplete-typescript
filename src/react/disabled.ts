// A disabled line's inks: its squares, flag and icons drained of colour, its
// text faded toward the menu's ground no further than it stays legible,
// whatever the look.

import type { Look } from "@baselayer-sdk/autocomplete";

type Rgb = readonly [number, number, number];

/**
 * The least contrast a disabled name keeps on the ground, a line's or a
 * head's, by the formula: drawn in the regular weight, about 2.3:1, faint but
 * never gone.
 */
export const DISABLED_NAME_FLOOR = 2.5;

/**
 * A disabled line's other text and its icon keep this share of their own
 * contrast, and never less than the floors below.
 */
export const DISABLED_TEXT_KEEPS = 0.25;

/**
 * The least its other text and its icon keep, by the formula: 1.5:1 or more
 * as drawn.
 */
export const DISABLED_TEXT_FLOOR = 1.7;

/**
 * The least its role keeps, by the formula: the smallest text loses the most
 * to antialiasing, so it needs more to draw at 1.5:1.
 */
export const DISABLED_ROLE_FLOOR = 1.8;

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
 * How readable `text` is on `ground`, as APCA (the WCAG 3 draft's perceptual
 * contrast, 0.0.98G-4g) measures it: the magnitude of Lc, 0 to about 106.
 * Unlike the WCAG 2 ratio, it weighs light text on a dark ground and dark
 * text on a light one differently, as the eye does, so it reads white on a
 * mid-tone pink (Lc 71) as plainly better than near-black (Lc 36), where the
 * ratio calls the two even.
 */
function apcaContrast(text: Rgb, ground: Rgb): number {
  const screen = (rgb: Rgb) => {
    const [r, g, b] = rgb.map(channel => (channel / 255) ** 2.4);
    const y = 0.2126729 * r! + 0.7151522 * g! + 0.072175 * b!;
    // Near-black is lifted a little, as a screen shows it.
    return y > 0.022 ? y : y + (0.022 - y) ** 1.414;
  };
  const [textY, groundY] = [screen(text), screen(ground)];
  if (Math.abs(groundY - textY) < 0.0005) return 0;
  const lc =
    groundY > textY
      ? (groundY ** 0.56 - textY ** 0.57) * 1.14
      : (groundY ** 0.65 - textY ** 0.62) * 1.14;
  return Math.abs(lc) < 0.1 ? 0 : (Math.abs(lc) - 0.027) * 100;
}

/**
 * The letters' color on a background mark: the look's own, or, under a mark
 * color of the host's, whichever of white and the title's color reads better
 * on it as drawn on the menu, by APCA; none on the default marker, whose
 * letters keep the color they have.
 */
export function markTextColor(look: Look): string | null {
  if (look.matchEmphasisTextColor !== null) {
    return look.matchEmphasisTextColor;
  }
  if (look.matchEmphasisColor === null) {
    return null;
  }
  const ground = drawnOn(look.backgroundColor, [255, 255, 255]);
  const fill = drawnOn(look.matchEmphasisColor, ground);
  const title = drawnOn(look.titleColor, fill);
  const white: Rgb = [255, 255, 255];
  return apcaContrast(white, fill) > apcaContrast(title, fill)
    ? "#ffffff"
    : hexOf(title);
}

/** The least contrast WCAG AA asks of the normal-size text a name is. */
const STRIPE_CONTRAST = 4.5;

/** The match fill's default: the stylesheet's `--bl-ac-marker`. */
const DEFAULT_MARKER = "#c6f6d5";

/**
 * How far the second stripe goes from the first, as a share of the way to an
 * extreme: enough to see two colors, little enough to keep the hue.
 */
const STRIPE_SPREAD = 0.4;

/**
 * The two colors a corrected letter's stripes alternate between under the
 * background emphasis, with the letters in the color the solid match
 * background gives its text (`markTextColor`; the name's own on the default
 * marker). The first is the match color, where the letters read on it, and else
 * the nearest shade or tint that they do; the second is a shade or tint of it
 * on the side the letters read better on, so that one letter color reads on
 * both stripes (WCAG AA, 4.5:1), and where there is no room that way (a fill
 * already at the extreme) as far the other way as they still read.
 */
export function stripeColors(look: Look): { solid: string; alt: string } {
  const white: Rgb = [255, 255, 255];
  const black: Rgb = [0, 0, 0];
  const ground = drawnOn(look.backgroundColor, white);
  const fill = drawnOn(look.matchEmphasisColor ?? DEFAULT_MARKER, ground);
  const ink = drawnOn(markTextColor(look) ?? look.titleColor, fill);
  const reads = (color: Rgb) =>
    contrast(ink, rounded(color)) >= STRIPE_CONTRAST;
  // The extreme the letters read better against, which a fill moves toward to
  // read better, and the one they read worse.
  const toward = contrast(ink, white) >= contrast(ink, black) ? white : black;
  const away = toward === black ? white : black;

  let first = fill;
  if (!reads(fill)) {
    let [low, high] = [0, 1];
    for (let step = 0; step < 24; step++) {
      const middle = (low + high) / 2;
      if (reads(mix(fill, toward, middle))) high = middle;
      else low = middle;
    }
    first = mix(fill, toward, high);
  }
  first = rounded(first);

  let second = rounded(mix(first, toward, STRIPE_SPREAD));
  if (contrast(first, second) < 1.15) {
    // The fill is as far toward as it goes: the other way, as far as it reads.
    let [low, high] = [0, STRIPE_SPREAD];
    for (let step = 0; step < 24; step++) {
      const middle = (low + high) / 2;
      if (reads(mix(first, away, middle))) low = middle;
      else high = middle;
    }
    second = rounded(mix(first, away, low));
  }
  return { solid: hexOf(first), alt: hexOf(second) };
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
  /** A disabled line's or head's name's colour (`--bl-ac-disabled-name`). */
  name: string;
  /** Its other text's and its icon's colour (`--bl-ac-disabled-text`). */
  text: string;
  /** Its role's colour (`--bl-ac-disabled-role`). */
  role: string;
  /** How much of the title's colour `name` keeps against the ground, in percent. */
  nameShare: number;
  /** How much of the subtitle's colour `text` keeps, in percent. */
  textShare: number;
  /** How much of the subtitle's colour `role` keeps, in percent. */
  roleShare: number;
  /**
   * How much of its own colour a match mark keeps, in percent: its hue, a
   * little faded toward the ground (`--bl-ac-disabled-mark`).
   */
  markShare: number;
}

/**
 * A disabled line or head under `look`: at `disabledDim` d, its squares, flag
 * and icons drained of colour by 2d, its text moved up to 2d of the way toward
 * the ground, its names no further than 2.5:1 and the rest than 25% of its
 * contrast (1.7:1 at least, a role 1.8:1), and its squares' opacity 1 - 0.8d.
 * At 0, nothing changes.
 */
export function disabledInks(look: Look): DisabledInks {
  const dim = look.disabledDim;
  // A translucent ground shows whatever is under the menu, which is not known
  // here: its own colour stands in, and the floors hold only on that.
  const ground = parse(look.backgroundColor).rgb;
  const round = (value: number) => Math.round(value * 1000) / 1000;
  // Twice the dim, so the floors are what stop the fade, on a dark ground too.
  const most = Math.min(1, 2 * dim);
  const faded = (color: string, floor: number) => {
    const ink = drawnOn(color, ground);
    const share = fadeShare(ink, ground, most, floor);
    return {
      hex: hexOf(mix(ink, ground, share)),
      kept: Math.round((1 - share) * 1000) / 10,
    };
  };
  const name = faded(look.titleColor, DISABLED_NAME_FLOOR);
  const kept =
    contrast(drawnOn(look.subtitleColor, ground), ground) * DISABLED_TEXT_KEEPS;
  const text = faded(look.subtitleColor, Math.max(DISABLED_TEXT_FLOOR, kept));
  const role = faded(look.subtitleColor, Math.max(DISABLED_ROLE_FLOOR, kept));
  return {
    filter: dim === 0 ? "none" : `saturate(${round(Math.max(0, 1 - 2 * dim))})`,
    opacity: String(round(1 - 0.8 * dim)),
    name: name.hex,
    text: text.hex,
    role: role.hex,
    nameShare: name.kept,
    textShare: text.kept,
    roleShare: role.kept,
    markShare: Math.round((1 - DISABLED_MARK_FADE * dim) * 1000) / 10,
  };
}
