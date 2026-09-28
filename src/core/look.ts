/**
 * How the styled typeahead draws its rows: the look a host stages, with the
 * defaults filled in so the component reads a complete look and never a
 * maybe.
 *
 * Colors are hex strings, so the typeahead renders the same with or without a
 * design system on the page.
 */

export const MATCH_EMPHASES = [
  "plain",
  "weight",
  "ink",
  "underline",
  "background",
] as const;
export type MatchEmphasis = (typeof MATCH_EMPHASES)[number];

export const MATCH_REGIONS = ["token", "substring"] as const;
export type MatchRegion = (typeof MATCH_REGIONS)[number];

export interface Look {
  /** Whether the footer shows the round trip and the index that answered. */
  showDebugInfo: boolean;
  /** How the words a typed token matched are marked. */
  matchEmphasis: MatchEmphasis;
  /** The marks' own color, or null for the treatment's default. */
  matchEmphasisColor: string | null;
  /** The whole word a token starts, or only the typed characters. */
  matchEmphasisRegion: MatchRegion;
  /** Behind the suggestion menu. */
  backgroundColor: string;
  /** The name, which leads every row. */
  titleColor: string;
  /** The address and the people, wherever they sit, and the fainter alternative name. */
  subtitleColor: string;
  /** The state squares. */
  pillBackgroundColor: string;
  pillForegroundColor: string;
  /** The border that marks the domicile's square. */
  primaryPillBorderColor: string;
  /** The `+N` square that counts the states not shown. */
  secondaryPillBackgroundColor: string;
  /** The structure's flag. */
  structurePillBackgroundColor: string;
  structurePillForegroundColor: string;
}

export const DEFAULT_LOOK: Readonly<Look> = Object.freeze({
  showDebugInfo: false,
  matchEmphasis: "underline",
  matchEmphasisColor: null,
  matchEmphasisRegion: "token",
  backgroundColor: "#FFFFFF", // white
  titleColor: "#1A202C", // gray.800
  subtitleColor: "#718096", // gray.500
  pillBackgroundColor: "#C6F6D5", // green.100
  pillForegroundColor: "#22543D", // green.800
  primaryPillBorderColor: "#48BB78", // green.400
  secondaryPillBackgroundColor: "#EDF2F7", // gray.100
  // Neutral, so the flag does not read as a state square.
  structurePillBackgroundColor: "#EDF2F7", // gray.100
  structurePillForegroundColor: "#4A5568", // gray.600
});

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** A look as a host stages it: any knob may be absent, null, or unusable. */
export type LookInput = { [K in keyof Look]?: unknown };

function color(value: unknown, fallback: string): string {
  return typeof value === "string" && HEX_COLOR.test(value) ? value : fallback;
}

function oneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof value === "string" &&
    (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

/**
 * The look with the staged knobs laid over the defaults. A knob that is
 * absent, null, or one this build cannot use keeps its default, so one bad
 * color costs that color and nothing else.
 */
export function resolveLook(staged: LookInput = {}): Look {
  const base = DEFAULT_LOOK;
  return {
    showDebugInfo:
      typeof staged.showDebugInfo === "boolean"
        ? staged.showDebugInfo
        : base.showDebugInfo,
    matchEmphasis: oneOf(
      staged.matchEmphasis,
      MATCH_EMPHASES,
      base.matchEmphasis,
    ),
    matchEmphasisColor:
      typeof staged.matchEmphasisColor === "string" &&
      HEX_COLOR.test(staged.matchEmphasisColor)
        ? staged.matchEmphasisColor
        : null,
    matchEmphasisRegion: oneOf(
      staged.matchEmphasisRegion,
      MATCH_REGIONS,
      base.matchEmphasisRegion,
    ),
    backgroundColor: color(staged.backgroundColor, base.backgroundColor),
    titleColor: color(staged.titleColor, base.titleColor),
    subtitleColor: color(staged.subtitleColor, base.subtitleColor),
    pillBackgroundColor: color(
      staged.pillBackgroundColor,
      base.pillBackgroundColor,
    ),
    pillForegroundColor: color(
      staged.pillForegroundColor,
      base.pillForegroundColor,
    ),
    primaryPillBorderColor: color(
      staged.primaryPillBorderColor,
      base.primaryPillBorderColor,
    ),
    secondaryPillBackgroundColor: color(
      staged.secondaryPillBackgroundColor,
      base.secondaryPillBackgroundColor,
    ),
    structurePillBackgroundColor: color(
      staged.structurePillBackgroundColor,
      base.structurePillBackgroundColor,
    ),
    structurePillForegroundColor: color(
      staged.structurePillForegroundColor,
      base.structurePillForegroundColor,
    ),
  };
}
