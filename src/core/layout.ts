/**
 * Where a suggestion row draws what. A row has places, each named for where
 * it sits, and fields, what a business has to show; a host picks the field
 * each place shows. See docs/styling.md, "A row's places and fields".
 */

import { ROUTES } from "./entities";
import type { Include } from "./wire";

/**
 * The places a host fills, in reading order: the badge pinned to the end of
 * the name and the first line's trailing place, then the second line's lead
 * and its trailing place. The title, which leads the first line, always
 * holds the name.
 */
export const ROW_PLACES = [
  "titleBadge",
  "titleTrailing",
  "subtitle",
  "subtitleTrailing",
] as const;
export type RowPlace = (typeof ROW_PLACES)[number];

/**
 * What a place can show of a business: its states (the domicile first, then
 * `+N`), its legal structure, its lead address, and its officers or its
 * registered agent.
 */
export const ROW_FIELDS = ["states", "structure", "address", "people"] as const;
export type RowField = (typeof ROW_FIELDS)[number];

/** The field each place shows, or null for an empty place. */
export type RowLayout = Record<RowPlace, RowField | null>;

/** A layout as a host stages it: any place may be left out. */
export type RowLayoutInput = { [P in RowPlace]?: RowField | null | undefined };

export const DEFAULT_ROW_LAYOUT: Readonly<RowLayout> = Object.freeze({
  titleBadge: "structure",
  titleTrailing: "states",
  subtitle: "address",
  subtitleTrailing: "people",
});

function isField(value: unknown): value is RowField {
  return (
    typeof value === "string" &&
    (ROW_FIELDS as readonly string[]).includes(value)
  );
}

/**
 * The complete layout from a staged one. A place left out keeps its default
 * field unless the host placed that field somewhere else, and a field placed
 * twice stays in the first place in reading order, leaving the later one
 * empty: no field is drawn twice. A value this build cannot use counts as
 * left out.
 */
export function resolveRowLayout(staged: RowLayoutInput = {}): RowLayout {
  const placed = new Set(
    ROW_PLACES.map((place): unknown => staged[place]).filter(isField),
  );
  const drawn = new Set<RowField>();
  const layout = {} as RowLayout;
  for (const place of ROW_PLACES) {
    const value: unknown = staged[place];
    const fallback = DEFAULT_ROW_LAYOUT[place];
    const field =
      value === null || isField(value)
        ? value
        : fallback !== null && placed.has(fallback)
          ? null
          : fallback;
    layout[place] = field !== null && drawn.has(field) ? null : field;
    if (field !== null) {
      drawn.add(field);
    }
  }
  return layout;
}

/** The related entity a field is drawn from; the states and the structure come on the row. */
const FIELD_SOURCES: Partial<Record<RowField, Include>> = {
  address: "addresses",
  people: "people",
};

/**
 * What the tier is to expand for rows in this layout, in the tier's own
 * order: the placed fields decide what is fetched as well as what is drawn.
 * Takes a staged layout or a resolved one. Empty when no placed field needs
 * a related entity.
 */
export function includeForLayout(staged: RowLayoutInput = {}): Include[] {
  const layout = resolveRowLayout(staged);
  const needed = new Set(
    ROW_PLACES.map(place => layout[place]).map(field =>
      field === null ? undefined : FIELD_SOURCES[field],
    ),
  );
  return ROUTES.businesses.includes.filter(relation => needed.has(relation));
}
