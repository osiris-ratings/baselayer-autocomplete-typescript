/**
 * Where a suggestion row draws what. A row has places, each named for where
 * it sits, and fields, what a business has to show; a host picks the field
 * each place shows. See docs/styling.md, "A row's places and fields".
 */

import { ROUTES } from "./entities";
import type { Include } from "./wire";

/**
 * The places a host fills, in reading order, left to right and line by line.
 * A row has four corners: the title, which always holds the name, and the
 * first line's trailing place; the second line's lead and its trailing place.
 * Each corner has a badge pinned to its inner side: after the name or the
 * lead, before a trailing place.
 */
export const ROW_PLACES = [
  "titleBadge",
  "titleTrailingBadge",
  "titleTrailing",
  "subtitle",
  "subtitleBadge",
  "subtitleTrailingBadge",
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
  titleTrailingBadge: null,
  titleTrailing: "states",
  subtitle: "address",
  subtitleBadge: null,
  subtitleTrailingBadge: null,
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
 * left out, and so does a null layout.
 */
export function resolveRowLayout(input: RowLayoutInput | null = {}): RowLayout {
  const staged: RowLayoutInput = input ?? {};
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

/** A corner of a line: the place of its field, and of the badge pinned to the field's inner side. */
export interface RowCorner<Field extends RowPlace | null = RowPlace> {
  field: Field;
  badge: RowPlace;
}

/** A line of a row: its lead corner, then its trailing corner. */
export interface RowLine {
  line: "title" | "subtitle";
  /** On the first line the lead's field is the name, which no place holds: null. */
  lead: RowCorner<RowPlace | null>;
  trailing: RowCorner;
}

/**
 * A row's lines, top to bottom, each as the places of its two corners: the
 * lead (its field, then its badge) and the trailing corner (its badge, then
 * its field). Read in that order, they are `ROW_PLACES`.
 */
export const ROW_LINES = [
  {
    line: "title",
    lead: { field: null, badge: "titleBadge" },
    trailing: { badge: "titleTrailingBadge", field: "titleTrailing" },
  },
  {
    line: "subtitle",
    lead: { field: "subtitle", badge: "subtitleBadge" },
    trailing: { badge: "subtitleTrailingBadge", field: "subtitleTrailing" },
  },
] as const satisfies readonly RowLine[];

/**
 * The layout as a row draws it. A badge beside an empty field is drawn as
 * that field, and a line whose lead is empty draws its trailing corner there,
 * badge and all: no badge is pinned beside nothing, and no line starts with a
 * gap. A drawn layout is its own.
 */
export function drawnRowLayout(layout: RowLayout): RowLayout {
  const drawn = { ...layout };
  for (const { lead, trailing } of ROW_LINES) {
    for (const { field, badge } of [lead, trailing]) {
      if (field !== null && drawn[field] === null) {
        drawn[field] = drawn[badge];
        drawn[badge] = null;
      }
    }
    if (lead.field !== null && drawn[lead.field] === null) {
      drawn[lead.field] = drawn[trailing.field];
      drawn[lead.badge] = drawn[trailing.badge];
      drawn[trailing.field] = null;
      drawn[trailing.badge] = null;
    }
  }
  return drawn;
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
export function includeForLayout(
  staged: RowLayoutInput | null = {},
): Include[] {
  const layout = resolveRowLayout(staged);
  const needed = new Set(
    ROW_PLACES.map(place => layout[place]).map(field =>
      field === null ? undefined : FIELD_SOURCES[field],
    ),
  );
  return ROUTES.businesses.includes.filter(relation => needed.has(relation));
}
