// The row map's inks, from the look being styled: each faded toward the card's
// ground as far as it may go and still be read on it, whatever the preset.

import type { StyleState } from "./style-state";

/** An sRGB colour, each channel 0 to 255. */
type Rgb = readonly [number, number, number];

/** `#rgb` or `#rrggbb`, or null for anything else (a name, `rgb()`). */
function parse(color: string): Rgb | null {
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(color);
  if (short !== null) {
    const [, r, g, b] = short;
    return [r!, g!, b!].map(digit => parseInt(digit + digit, 16)) as [
      number,
      number,
      number,
    ];
  }
  const long = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
  if (long === null) return null;
  const [, r, g, b] = long;
  return [r!, g!, b!].map(pair => parseInt(pair, 16)) as [
    number,
    number,
    number,
  ];
}

function hex(rgb: Rgb): string {
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

function ratio(a: Rgb, b: Rgb): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light! + 0.05) / (dark! + 0.05);
}

/** WCAG's contrast ratio between two `#rgb` or `#rrggbb` colours. */
export function contrast(a: string, b: string): number {
  return ratio(parse(a)!, parse(b)!);
}

/** The least contrast `ink` has on any of `grounds`. */
function weakest(ink: Rgb, grounds: readonly Rgb[]): number {
  return Math.min(...grounds.map(ground => ratio(ink, ground)));
}

/**
 * The furthest `ink` moves toward `to`, up to `most` of the way, and still
 * `holds`; `ink` itself when no move does.
 */
function furthest(
  ink: Rgb,
  to: Rgb,
  most: number,
  holds: (rgb: Rgb) => boolean,
): Rgb {
  if (holds(mix(ink, to, most))) return mix(ink, to, most);
  let [low, high] = [0, most];
  for (let step = 0; step < 24; step++) {
    const middle = (low + high) / 2;
    if (holds(mix(ink, to, middle))) low = middle;
    else high = middle;
  }
  return mix(ink, to, low);
}

/** The least `ink` moves toward `to` to hold; `to` itself when none does. */
function nearest(ink: Rgb, to: Rgb, holds: (rgb: Rgb) => boolean): Rgb {
  if (holds(ink)) return ink;
  let [low, high] = [0, 1];
  for (let step = 0; step < 24; step++) {
    const middle = (low + high) / 2;
    if (holds(mix(ink, to, middle))) high = middle;
    else low = middle;
  }
  return mix(ink, to, high);
}

/** The inks the row map draws in. */
export interface MapInks {
  /** A label or a heading. */
  ink: string;
  /** What only has to be seen: a grip, an empty place, an icon left off. */
  soft: string;
  /** A disabled line's labels. */
  disabled: string;
  /** A hidden line's labels. */
  hidden: string;
}

/**
 * The row map's inks for the look: labels from the subtitle's colour, darkened
 * toward the title's until they read as text on the card and on an enabled
 * line's tint; the rest faded toward the card no further than a floor.
 */
export function mapInks(state: StyleState): MapInks {
  const { look, vars } = state;
  const ground = parse(look.backgroundColor);
  const tint = parse(vars["--bl-ac-highlight-bg"]);
  const title = parse(look.titleColor);
  const subtitle = parse(look.subtitleColor);
  if (ground === null || tint === null || title === null || subtitle === null) {
    // A colour this cannot read: the stylesheet mixes, with no floor.
    const mixed = (share: number) =>
      `color-mix(in srgb, ${look.titleColor} ${share}%, ${look.backgroundColor})`;
    return {
      ink: mixed(85),
      soft: mixed(60),
      disabled: mixed(65),
      hidden: mixed(55),
    };
  }
  const both = [ground, tint];
  // As little of the title's colour as reads as text: toward the title is
  // stronger whichever way the look runs, light or dark.
  // The floors are above WCAG's 4.5 and 3 by what antialiasing costs a thin
  // stroke on screen.
  const ink = nearest(subtitle, title, rgb => weakest(rgb, both) >= 7);
  const fade = (most: number, floor: number, grounds: readonly Rgb[]) =>
    hex(furthest(ink, ground, most, rgb => weakest(rgb, grounds) >= floor));
  return {
    ink: hex(ink),
    soft: fade(0.45, 4.5, both),
    disabled: fade(0.35, 4.6, [ground]),
    hidden: fade(0.5, 4.2, [ground]),
  };
}
