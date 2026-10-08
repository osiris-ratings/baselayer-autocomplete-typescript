// The row map's inks, from the look being styled: each faded toward the card's
// ground as far as it may go and still be read on it, whatever the preset.

import type { StyleState } from "./style-state";

/** An sRGB colour, each channel 0 to 255. */
type Rgb = readonly [number, number, number];

const WHITE: Rgb = [255, 255, 255];

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

/** How far a checked box's fill is taken from the accent toward the card. */
const CHECK_FILL_TOWARD_CARD = 0.4;

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
  /** The Disabled column's checkbox, quieter than the drags around it. */
  check: CheckInks;
}

/** A checkbox drawn in the look's colours. */
export interface CheckInks {
  /** An empty box's edge, and that edge under the pointer. */
  edge: string;
  hover: string;
  /** A checked box's fill and edge, and its mark. */
  fill: string;
  mark: string;
  /** The focus ring: the look's accent. */
  ring: string;
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
  // The look's accent: the colour its matches are marked in.
  const accentColor = vars["--bl-ac-underline"];
  const accent = on(accentColor, ground);
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
    accent === null ||
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
      check: {
        edge: mixed(45),
        hover: mixed(60),
        fill: `color-mix(in srgb, ${accentColor} 60%, ${look.backgroundColor})`,
        mark: look.titleColor,
        ring: accentColor,
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
  // The checkbox stays out of the way: an empty box's edge as faint as a
  // control's boundary may be, and a checked one's fill the accent taken well
  // toward the card, its mark white where that reads on it, else the look's
  // strongest text or its card, whichever reads better.
  const edge = (least: number) =>
    hex(furthest(ink, ground, 1, rgb => ratio(rgb, ground) >= least));
  const fill = round(mix(accent, ground, CHECK_FILL_TOWARD_CARD));
  const mark = [WHITE, title, ground].reduce((best, rgb) =>
    ratio(best, fill) >= 3 || ratio(best, fill) >= ratio(rgb, fill)
      ? best
      : rgb,
  );
  return {
    ink: hex(ink),
    soft: hex(soft),
    guide: hex(furthest(soft, ground, 0.95, rgb => ratio(rgb, ground) >= 1.5)),
    dim: { disabled: DIM.disabled, hidden },
    check: {
      edge: edge(3),
      hover: edge(4),
      fill: hex(fill),
      mark: hex(mark),
      ring: hex(accent),
    },
  };
}
