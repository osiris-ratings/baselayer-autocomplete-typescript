/**
 * Where a suggestion row draws what. A row has places, each named for where
 * it sits, and fields, what a business has to show; a host picks the field
 * each place shows. See docs/styling.md, "A row's places and fields".
 */

import { ROUTES, type EntityType, type Relation } from "./entities";
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

/** A corner of a line: the place of its field, and of the badge pinned to the field's inner side. */
export interface RowCorner<
  Field extends string | null = RowPlace,
  Badge extends string = RowPlace,
> {
  field: Field;
  badge: Badge;
}

/** A line of a row: its lead corner, then its trailing corner. */
export interface RowLine<
  P extends string = RowPlace,
  L extends string = "title" | "subtitle",
> {
  line: L;
  /** When the lead's field is the row's name, which no place holds: null. */
  lead: RowCorner<P | null, P>;
  trailing: RowCorner<P, P>;
  /** The entity the line draws, and so what `enabledLines` names to enable it. */
  entity?: EntityType;
  /** The relation a line lists, one line per item; null on the row's head. */
  relation?: Relation | null;
}

/**
 * A kind of row a host lays out: its places in reading order, the fields a
 * place can show, its lines, and the field each place shows by default.
 * `accepts` says which fields a place may hold; left out, any field may go in
 * any place. `iconSegments` are the segments, names and fields, an icon can
 * ride on.
 */
export interface RowKind<
  P extends string,
  F extends string,
  S extends string = string,
> {
  places: readonly P[];
  fields: readonly F[];
  lines: readonly RowLine<P, string>[];
  defaults: Readonly<Record<P, F | null>>;
  accepts?: (place: P, field: F) => boolean;
  iconSegments: readonly S[];
}

/** The field each place of a kind shows, or null for an empty place. */
export type LayoutOf<P extends string, F extends string> = Record<P, F | null>;

/** A layout of a kind as a host stages it: any place may be left out. */
export type LayoutInputOf<P extends string, F extends string> = {
  [K in P]?: F | null | undefined;
};

/** Whether `place` of `kind` may hold `value`, a field of that kind. */
function holds<P extends string, F extends string>(
  kind: RowKind<P, F>,
  place: P,
  value: unknown,
): value is F {
  return (
    typeof value === "string" &&
    (kind.fields as readonly string[]).includes(value) &&
    (kind.accepts?.(place, value as F) ?? true)
  );
}

/**
 * The complete layout of a kind from a staged one. A place left out keeps its
 * default field unless the host placed that field somewhere else, and a field
 * placed twice stays in the first place in reading order, leaving the later
 * one empty: no field is drawn twice. A value this build cannot use, or one
 * the place does not accept, counts as left out, and so does a null layout.
 */
export function resolveLayout<P extends string, F extends string>(
  kind: RowKind<P, F>,
  input: LayoutInputOf<P, F> | null = {},
): LayoutOf<P, F> {
  const staged: LayoutInputOf<P, F> = input ?? {};
  const placed = new Set<F>();
  for (const place of kind.places) {
    const value: unknown = staged[place];
    if (holds(kind, place, value)) {
      placed.add(value);
    }
  }
  const drawn = new Set<F>();
  const layout = {} as LayoutOf<P, F>;
  for (const place of kind.places) {
    const value: unknown = staged[place];
    const fallback = kind.defaults[place];
    const field: F | null =
      value === null
        ? null
        : holds(kind, place, value)
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

/**
 * The layout of a kind as a row draws it. A badge beside an empty field is
 * drawn as that field, and a line whose lead is empty draws its trailing
 * corner there, badge and all: no badge is pinned beside nothing, and no line
 * starts with a gap. A drawn layout is its own.
 */
export function drawnLayout<P extends string, F extends string>(
  kind: RowKind<P, F>,
  layout: LayoutOf<P, F>,
): LayoutOf<P, F> {
  const drawn = { ...layout };
  for (const { lead, trailing } of kind.lines) {
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

/**
 * The complete layout from a staged one (`resolveLayout` for a business row).
 * A place left out keeps its default field unless the host placed that field
 * somewhere else, and a field placed twice stays in the first place in reading
 * order, leaving the later one empty: no field is drawn twice. A value this
 * build cannot use counts as left out, and so does a null layout.
 */
export function resolveRowLayout(input: RowLayoutInput | null = {}): RowLayout {
  return resolveLayout(BUSINESS_HEAD, input);
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
] as const satisfies readonly RowLine<RowPlace, "title" | "subtitle">[];

/**
 * A business row's head as a kind: any of its fields may go in any of its
 * places. `BUSINESS_ROW` is the whole row, the lines it can list included.
 */
const BUSINESS_HEAD: RowKind<RowPlace, RowField> = {
  places: ROW_PLACES,
  fields: ROW_FIELDS,
  lines: ROW_LINES,
  defaults: DEFAULT_ROW_LAYOUT,
  iconSegments: [],
};

/** The layout as a business row draws it (`drawnLayout` for a business row). */
export function drawnRowLayout(layout: RowLayout): RowLayout {
  return drawnLayout(BUSINESS_HEAD, layout);
}

/** The related entity a field is drawn from; the states and the structure come on the row. */
const FIELD_SOURCES: Partial<Record<RowField, Include>> = {
  address: "addresses",
  people: "people",
};

/**
 * What the autocomplete service is to expand for rows in this layout, in the
 * autocomplete service's own order: the placed fields decide what is fetched as
 * well as what is drawn. Takes a staged layout or a resolved one. Empty when no
 * placed field needs a related entity.
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
