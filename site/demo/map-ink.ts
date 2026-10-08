// The row map's inks, from the look being styled: each faded toward the card's
// ground as far as it may go and still be read on it, whatever the preset.

import type { StyleState } from "./style-state";

/** An sRGB colour, each channel 0 to 255. */
type Rgb = readonly [number, number, number];

const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = [0, 0, 0];

/**
 * `#rgb`, `#rgba`, `#rrggbb` or `#rrggbbaa` as drawn over `over` (white when
 * left out), or null for anything else (a name, `rgb()`).
 */
function parse(color: string, over: Rgb = WHITE): Rgb | null {
  const digits = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(color)?.[1];
  if (digits === undefined) return null;
  const pairs =
    digits.length <= 4
      ? [...digits].map(digit => digit + digit)
      : (digits.match(/../g) ?? []);
  const [r, g, b, a] = pairs.map(pair => parseInt(pair, 16));
  const rgb: Rgb = [r!, g!, b!];
  return a === undefined ? rgb : round(mix(over, rgb, a / 255));
}

/** A colour on whole channels, as a hex writes it. */
function round(rgb: Rgb): Rgb {
  return rgb.map(Math.round) as unknown as Rgb;
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
 * `holds` once on whole channels, as it is written; `ink` itself when no
 * move does.
 */
function furthest(
  ink: Rgb,
  to: Rgb,
  most: number,
  holds: (rgb: Rgb) => boolean,
): Rgb {
  const at = (toward: number) => round(mix(ink, to, toward));
  if (holds(at(most))) return at(most);
  let [low, high] = [0, most];
  for (let step = 0; step < 24; step++) {
    const middle = (low + high) / 2;
    if (holds(at(middle))) low = middle;
    else high = middle;
  }
  return at(low);
}

/**
 * The least `ink` moves toward `to` to hold once on whole channels; `to`
 * itself when none does.
 */
function nearest(ink: Rgb, to: Rgb, holds: (rgb: Rgb) => boolean): Rgb {
  const at = (toward: number) => round(mix(ink, to, toward));
  if (holds(at(0))) return at(0);
  let [low, high] = [0, 1];
  for (let step = 0; step < 24; step++) {
    const middle = (low + high) / 2;
    if (holds(at(middle))) high = middle;
    else low = middle;
  }
  return at(high);
}

/** How much a line is dimmed, by design: a disabled line, and a hidden one. */
const DIM = { disabled: 0.48, hidden: 0.38 };

/** The demo's blue (brand.css `--blue`): the map's rings and checkbox. */
const BLUE = "#384ce3";

/**
 * A checked box's fill: the ring with this share of its colour and a little
 * less light, darkened further only until its white mark reads at `markOn`.
 */
const CALM = { colour: 0.5, darker: 0.04, markOn: 4 };

/** A colour's hue in turns, and its saturation and lightness, 0 to 1. */
function hsl(rgb: Rgb): [number, number, number] {
  const [r, g, b] = rgb.map(channel => channel / 255) as [
    number,
    number,
    number,
  ];
  const [high, low] = [Math.max(r, g, b), Math.min(r, g, b)];
  const lightness = (high + low) / 2;
  const spread = high - low;
  if (spread === 0) return [0, 0, lightness];
  const saturation = spread / (1 - Math.abs(2 * lightness - 1));
  const sector =
    high === r
      ? (g - b) / spread
      : high === g
        ? (b - r) / spread + 2
        : (r - g) / spread + 4;
  return [(((sector / 6) % 1) + 1) % 1, saturation, lightness];
}

function fromHsl([hue, saturation, lightness]: [number, number, number]): Rgb {
  const spread = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const channel = (offset: number) => {
    const at = (hue * 6 + offset) % 6;
    return (
      lightness -
      spread / 2 +
      spread * Math.max(0, Math.min(1, Math.abs(at - 3) - 1))
    );
  };
  return [channel(0), channel(4), channel(2)].map(
    value => value * 255,
  ) as unknown as Rgb;
}

/** The ring made calmer for a checked box's fill, a white mark legible on it. */
function calmFill(ring: Rgb): Rgb {
  const [hue, saturation, lightness] = hsl(ring);
  const calm = fromHsl([
    hue,
    saturation * CALM.colour,
    Math.max(0, lightness - CALM.darker),
  ]);
  return nearest(calm, BLACK, rgb => ratio(WHITE, rgb) >= CALM.markOn);
}

/** An ink on its ground, and the least contrast it is to keep when dimmed. */
interface Kept {
  ink: Rgb;
  on: Rgb;
  floor: number;
}

/**
 * Whether what a dimmed line draws keeps its floor at `opacity` over the card:
 * its labels' and its frozen icons' ink, and each badge's text on its own
 * ground. A thin label loses more to antialiasing than a bold badge does.
 */
function keeps(kept: readonly Kept[], ground: Rgb, opacity: number): boolean {
  const over = (rgb: Rgb) => mix(ground, rgb, opacity);
  return kept.every(
    ({ ink, on, floor }) => ratio(over(ink), over(on)) >= floor,
  );
}

/** The inks the row map draws in, and how much it dims a line. */
export interface MapInks {
  /** A label or a heading. */
  ink: string;
  /** What only has to be seen: a grip, an empty place, an icon left off. */
  soft: string;
  /** Fainter still, but there: the Disabled column's guide. */
  guide: string;
  /** The opacity of a disabled line, and of a hidden one. */
  dim: { disabled: number; hidden: number };
  /**
   * What rings a focused grip, checkbox, icon or place: the demo's blue,
   * raised toward the title on a card it would not stand out on.
   */
  ring: string;
  /** The Disabled column's checkbox, quieter than the drags around it. */
  check: CheckInks;
}

/** A checkbox drawn in the look's colours. */
export interface CheckInks {
  /** An empty box's edge, and that edge under the pointer. */
  edge: string;
  hover: string;
  /** A checked box's fill and edge, under its white mark. */
  fill: string;
}

/**
 * The row map's inks for the look: labels from the subtitle's colour, darkened
 * toward the title's until they read as text on the card and on an enabled
 * line's tint, and a softer ink faded toward the card no further than a floor.
 */
export function mapInks(state: StyleState): MapInks {
  const { look, vars } = state;
  // Each colour as it is drawn: a ground over white, an ink over its ground.
  const ground = parse(look.backgroundColor);
  const on = (color: string, under: Rgb | null) =>
    under === null ? null : parse(color, under);
  const tint = on(vars["--bl-ac-highlight-bg"], ground);
  const title = on(look.titleColor, ground);
  const subtitle = on(look.subtitleColor, ground);
  const pillGround = on(look.pillBackgroundColor, ground);
  const pill = [on(look.pillForegroundColor, pillGround), pillGround];
  const structureGround = on(look.structurePillBackgroundColor, ground);
  const structure = [
    on(look.structurePillForegroundColor, structureGround),
    structureGround,
  ];
  if (
    ground === null ||
    tint === null ||
    title === null ||
    subtitle === null ||
    [...pill, ...structure].includes(null)
  ) {
    // A colour this cannot read: the stylesheet mixes, with no floor.
    const mixed = (share: number) =>
      `color-mix(in srgb, ${look.titleColor} ${share}%, ${look.backgroundColor})`;
    return {
      ink: mixed(85),
      soft: mixed(60),
      guide: mixed(25),
      dim: { ...DIM },
      ring: BLUE,
      check: {
        edge: mixed(45),
        hover: mixed(60),
        fill: hex(calmFill(parse(BLUE)!)),
      },
    };
  }
  const both = [ground, tint];
  // As little of the title's colour as reads as text: toward the title is
  // stronger whichever way the look runs, light or dark.
  // The floors are above WCAG's 4.5 and 3 by what antialiasing costs a thin
  // stroke on screen.
  const ink = nearest(subtitle, title, rgb => weakest(rgb, both) >= 7);
  const soft = furthest(ink, ground, 0.45, rgb => weakest(rgb, both) >= 4.5);
  const kept: Kept[] = [
    { ink, on: ground, floor: 2 },
    { ink: pill[0]!, on: pill[1]!, floor: 1.75 },
    { ink: structure[0]!, on: structure[1]!, floor: 1.75 },
  ];
  // A dimmed line may read poorly, as a disabled one does in the menu, but
  // never vanish: a look that would lose a hidden line dims it less.
  let hidden = DIM.hidden;
  while (hidden < DIM.disabled && !keeps(kept, ground, hidden)) {
    hidden = Math.round((hidden + 0.01) * 100) / 100;
  }
  // A focus ring holds WCAG's 3:1 on the card: the blue, raised toward the
  // title only where the card is too dark for it.
  const ring = nearest(parse(BLUE)!, title, rgb => ratio(rgb, ground) >= 3);
  // The checkbox stays out of the way: an empty box's edge faint, about 2:1
  // on the card and a step stronger under the pointer, and a checked one's
  // fill the ring made calmer under a white mark.
  const edge = (least: number) =>
    hex(furthest(ink, ground, 1, rgb => ratio(rgb, ground) >= least));
  return {
    ink: hex(ink),
    soft: hex(soft),
    guide: hex(furthest(soft, ground, 0.95, rgb => ratio(rgb, ground) >= 1.5)),
    dim: { disabled: DIM.disabled, hidden },
    ring: hex(ring),
    check: {
      edge: edge(2),
      hover: edge(3),
      fill: hex(calmFill(ring)),
    },
  };
}
