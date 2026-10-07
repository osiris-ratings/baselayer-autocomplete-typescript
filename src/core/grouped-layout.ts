/**
 * Where a person's or an address's row draws what. The row is a group of
 * lines: its head (the person's name or the address), a line per business
 * under it, and a line per address under a person or per person under an
 * address. Each line holds its lead (a name, always) and three places, and
 * each place shows one of its own line's fields. See docs/styling.md,
 * "Person and address rows".
 */

import {
  ENTITY_OF,
  ROUTES,
  type EntityType,
  type IncludeOf,
  type Relation,
} from "./entities";
import type { LayoutInputOf, LayoutOf, RowKind, RowLine } from "./layout";
import type { GroupedOption, PickableBusiness } from "./pick";
import type {
  AddressSuggestion,
  PersonSuggestion,
  RelatedItem,
  RelatedSet,
} from "./wire";

/** A line's three places: the badge after its name, and its trailing corner. */
function linePlaces<L extends string>(line: L) {
  return [`${line}Badge`, `${line}TrailingBadge`, `${line}Trailing`] as const;
}

function lineOf<L extends string>(
  line: L,
): RowLine<`${L}Badge` | `${L}TrailingBadge` | `${L}Trailing`, L> {
  return {
    line,
    lead: { field: null, badge: `${line}Badge` },
    trailing: { badge: `${line}TrailingBadge`, field: `${line}Trailing` },
  };
}

/** The fields each line of a person's row can show, by line. */
export const PERSON_LINE_FIELDS = {
  /** The first of the person's addresses with `+N`, and how many of each. */
  head: ["firstAddress", "counts"],
  /** The business's address, its states, and the person's role on it. */
  business: ["address", "states", "role"],
  /** The person's role at the address. */
  address: ["addressRole"],
} as const;

/** The fields each line of an address's row can show, by line. */
export const ADDRESS_LINE_FIELDS = {
  /** How many businesses, and people, are at the address. */
  head: ["counts"],
  /** The business's address, its states, and how it holds this address. */
  business: ["address", "states", "role"],
  /** The person's role. */
  person: ["personRole"],
} as const;

export const PERSON_ROW_PLACES = [
  ...linePlaces("head"),
  ...linePlaces("business"),
  ...linePlaces("address"),
] as const;
export type PersonRowPlace = (typeof PERSON_ROW_PLACES)[number];
export type PersonRowField =
  (typeof PERSON_LINE_FIELDS)[keyof typeof PERSON_LINE_FIELDS][number];

export const ADDRESS_ROW_PLACES = [
  ...linePlaces("head"),
  ...linePlaces("business"),
  ...linePlaces("person"),
] as const;
export type AddressRowPlace = (typeof ADDRESS_ROW_PLACES)[number];
export type AddressRowField =
  (typeof ADDRESS_LINE_FIELDS)[keyof typeof ADDRESS_LINE_FIELDS][number];

export type PersonRowLayout = LayoutOf<PersonRowPlace, PersonRowField>;
export type PersonRowLayoutInput = LayoutInputOf<
  PersonRowPlace,
  PersonRowField
>;
export type AddressRowLayout = LayoutOf<AddressRowPlace, AddressRowField>;
export type AddressRowLayoutInput = LayoutInputOf<
  AddressRowPlace,
  AddressRowField
>;

/** Which line's fields a place takes: its name up to `Badge` or `Trailing`. */
function acceptsOwnLine<F extends string>(
  fields: Readonly<Record<string, readonly F[]>>,
) {
  return (place: string, field: F): boolean => {
    const line = place.replace(/(TrailingBadge|Trailing|Badge)$/, "");
    return fields[line]?.includes(field) ?? false;
  };
}

/**
 * A person's row: `Jane Q Doe  12 Oak Ln, Dover, DE +2 … 3 businesses · 3
 * addresses`, then each business with its address, its states and the
 * person's role, then each address with the role.
 */
export const PERSON_ROW: RowKind<PersonRowPlace, PersonRowField> = {
  places: PERSON_ROW_PLACES,
  fields: [
    ...PERSON_LINE_FIELDS.head,
    ...PERSON_LINE_FIELDS.business,
    ...PERSON_LINE_FIELDS.address,
  ],
  lines: [lineOf("head"), lineOf("business"), lineOf("address")],
  defaults: Object.freeze({
    headBadge: "firstAddress",
    headTrailingBadge: null,
    headTrailing: "counts",
    businessBadge: "address",
    businessTrailingBadge: "states",
    businessTrailing: "role",
    addressBadge: null,
    addressTrailingBadge: null,
    addressTrailing: "addressRole",
  }),
  accepts: acceptsOwnLine(PERSON_LINE_FIELDS),
};

/**
 * An address's row: the address with how many businesses and people are
 * there, then each business as on a person's row, then each person with
 * their role.
 */
export const ADDRESS_ROW: RowKind<AddressRowPlace, AddressRowField> = {
  places: ADDRESS_ROW_PLACES,
  fields: [
    ...ADDRESS_LINE_FIELDS.head,
    ...ADDRESS_LINE_FIELDS.business,
    ...ADDRESS_LINE_FIELDS.person,
  ],
  lines: [lineOf("head"), lineOf("business"), lineOf("person")],
  defaults: Object.freeze({
    headBadge: null,
    headTrailingBadge: null,
    headTrailing: "counts",
    businessBadge: "address",
    businessTrailingBadge: "states",
    businessTrailing: "role",
    personBadge: null,
    personTrailingBadge: null,
    personTrailing: "personRole",
  }),
  accepts: acceptsOwnLine(ADDRESS_LINE_FIELDS),
};

/** The relations listed under a row when the host names none. */
export const DEFAULT_LISTED = ["businesses"] as const;

export interface GroupedRequest<R extends "people" | "addresses"> {
  /** The relations listed under each row, a line each. */
  listed: IncludeOf<R>[];
  /** What to ask the service to expand: the listed relations, and what the layout draws. */
  include: IncludeOf<R>[];
}

/**
 * What a person's or an address's rows list, and what to ask the service to
 * expand for them: the relations `listed` (businesses when left out), and
 * whatever the layout draws besides, such as a person's first address in the
 * head, which needs their addresses even when no address line is listed. In
 * the route's own order.
 */
export function requestFor(
  route: "people",
  layout: PersonRowLayout,
  listed?: readonly IncludeOf<"people">[],
): GroupedRequest<"people">;
export function requestFor(
  route: "addresses",
  layout: AddressRowLayout,
  listed?: readonly IncludeOf<"addresses">[],
): GroupedRequest<"addresses">;
export function requestFor(
  route: "people" | "addresses",
  layout: PersonRowLayout | AddressRowLayout,
  listed: readonly Relation[] = DEFAULT_LISTED,
): GroupedRequest<"people" | "addresses"> {
  const fields: readonly (string | null)[] = Object.values(layout);
  const drawn = new Set(fields);
  const needed = new Set<Relation>(listed);
  if (route === "people" && drawn.has("firstAddress")) {
    needed.add("addresses");
  }
  const order: readonly Relation[] = ROUTES[route].includes;
  return {
    listed: order.filter(relation => listed.includes(relation)),
    include: order.filter(relation => needed.has(relation)),
  } as GroupedRequest<"people" | "addresses">;
}

/** What a row offers to pick when the host names nothing: its businesses. */
export const DEFAULT_PICKABLE = ["business"] as const;

/** A line under the head: one item of a listed relation. */
export interface GroupedItemLine {
  item: RelatedItem;
  /** What picking it hands; null when the line is inert. */
  option: GroupedOption | null;
}

/** A listed relation's lines, named for the entity each one is. */
export interface GroupedList {
  relation: Relation;
  line: EntityType;
  lines: GroupedItemLine[];
  /** How many there are past the lines shown: its full count, less them. */
  notShown: number;
}

export interface GroupedLines {
  /** What picking the head hands; null when the row's own type is not pickable. */
  head: { option: GroupedOption | null };
  lists: GroupedList[];
}

/**
 * A person's or an address's row as lines: the head, then a list per relation
 * in `listed`, each item a line. A line is pickable when its type is in
 * `pickable` and the autocomplete service gave it a token; a business hands a
 * business option, a person or an address a typed pick.
 */
export function groupedLines(
  row: PersonSuggestion | AddressSuggestion,
  listed: readonly Relation[],
  pickable: readonly EntityType[] = DEFAULT_PICKABLE,
): GroupedLines {
  const related: Partial<Record<Relation, RelatedSet>> = row.related;
  const optionOf = (item: RelatedItem): GroupedOption | null => {
    if (item.token === null || !pickable.includes(item.type)) {
      return null;
    }
    if (item.type === "business") {
      return { kind: "business", row, business: item as PickableBusiness };
    }
    return {
      kind: "entity",
      pick: { type: item.type, token: item.token, label: item.label },
    };
  };
  return {
    head: {
      option: pickable.includes(row.type)
        ? {
            kind: "entity",
            pick: { type: row.type, token: row.token, label: row.label },
          }
        : null,
    },
    lists: listed.flatMap(relation => {
      const set = related[relation];
      if (set === undefined) {
        return [];
      }
      return [
        {
          relation,
          line: ENTITY_OF[relation],
          lines: set.items.map(item => ({ item, option: optionOf(item) })),
          notShown: Math.max(0, (set.count ?? 0) - set.items.length),
        },
      ];
    }),
  };
}

/** Every pickable line of `lines`, in the order they are drawn. */
export function groupedOptions(lines: GroupedLines): GroupedOption[] {
  return [
    lines.head.option,
    ...lines.lists.flatMap(list => list.lines.map(line => line.option)),
  ].filter((option): option is GroupedOption => option !== null);
}
