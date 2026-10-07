/**
 * Where each search's row draws what: a business's, a person's and an
 * address's, as one model. A row is its head, then a line for each item of a
 * relation it lists: a business's officers and addresses, a person's
 * businesses and addresses, an address's businesses and people. Every line
 * draws a name, with a place before it for its icon and three after it, each
 * showing one of its own line's fields. See docs/styling.md, "A row's places
 * and fields".
 */

import {
  ENTITY_OF,
  ROUTES,
  type EntityType,
  type IncludeOf,
  type Relation,
  type Route,
} from "./entities";
import {
  DEFAULT_ROW_LAYOUT,
  ROW_FIELDS,
  ROW_LINES,
  ROW_PLACES,
  includeForLayout,
  type LayoutInputOf,
  type LayoutOf,
  type RowField,
  type RowKind,
  type RowLayoutInput,
  type RowLine,
} from "./layout";
import type { GroupedOption, PickableBusiness } from "./pick";
import type { SessionScope } from "./scope";
import type {
  AddressSuggestion,
  BusinessSuggestion,
  PersonSuggestion,
  RelatedItem,
  RelatedSet,
} from "./wire";

/** A line's places: the icon's before the name, its badge, its trailing corner. */
function linePlaces<L extends string>(line: L) {
  return [
    `${line}Lead`,
    `${line}Badge`,
    `${line}TrailingBadge`,
    `${line}Trailing`,
  ] as const;
}

type PlacesOf<L extends string> = ReturnType<typeof linePlaces<L>>[number];

function lineOf<L extends string>(
  line: L,
  entity: EntityType,
  relation: Relation | null,
): RowLine<PlacesOf<L>, L> {
  return {
    line,
    leading: `${line}Lead`,
    lead: { field: null, badge: `${line}Badge` },
    trailing: { badge: `${line}TrailingBadge`, field: `${line}Trailing` },
    entity,
    relation,
  };
}

/**
 * Which line a place is on, by its name: what is left of it once `Lead`,
 * `Badge`, `TrailingBadge` or `Trailing` is taken off.
 */
function lineOfPlace(place: string): string {
  return place.replace(/(Lead|TrailingBadge|Trailing|Badge)$/, "");
}

/**
 * A place takes its own line's fields, and its line's icon goes only before
 * the name: the place before the name takes nothing else.
 */
function acceptsOwnLine<F extends string>(
  fields: Readonly<Record<string, readonly F[]>>,
) {
  return (place: string, field: F): boolean => {
    const line = lineOfPlace(place);
    const icon = `${line}Icon`;
    if (place.endsWith("Lead")) {
      return field === icon;
    }
    return field !== icon && (fields[line]?.includes(field) ?? false);
  };
}

/** The fields each line of a person's row can show, by line. */
export const PERSON_LINE_FIELDS = {
  /** Their icon, their first address with `+N`, and how many of each. */
  head: ["headIcon", "firstAddress", "counts"],
  /** The business's icon, its address, its states, and the person's role on it. */
  business: ["businessIcon", "address", "states", "role"],
  /** The address's icon, and the person's role at it. */
  address: ["addressIcon", "addressRole"],
} as const;

/** The fields each line of an address's row can show, by line. */
export const ADDRESS_LINE_FIELDS = {
  /** Its icon, and how many businesses, and people, are there. */
  head: ["headIcon", "counts"],
  /** The business's icon, its address, its states, and how it holds this address. */
  business: ["businessIcon", "address", "states", "role"],
  /** The person's icon, and their role. */
  person: ["personIcon", "personRole"],
} as const;

/**
 * The fields each line a business's row lists can show, by line; its head
 * shows `ROW_FIELDS`, and its icon before its name.
 */
export const BUSINESS_LINE_FIELDS = {
  title: ["titleIcon"],
  /** The officer's or agent's icon, and their role on the business. */
  person: ["personIcon", "personRole"],
  /** The address's icon, and how the business holds it. */
  address: ["addressIcon", "addressRole"],
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

/**
 * A business row's places in reading order: the head's (`ROW_PLACES`) with
 * the icon's before the name, then each line it can list.
 */
export const BUSINESS_ROW_PLACES = [
  "titleLead",
  ...ROW_PLACES.slice(0, 3),
  ...ROW_PLACES.slice(3),
  ...linePlaces("person"),
  ...linePlaces("address"),
] as const;
export type BusinessRowPlace = (typeof BUSINESS_ROW_PLACES)[number];
export type BusinessRowField =
  | RowField
  | (typeof BUSINESS_LINE_FIELDS)[keyof typeof BUSINESS_LINE_FIELDS][number];

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
export type BusinessRowLayout = LayoutOf<BusinessRowPlace, BusinessRowField>;
export type BusinessRowLayoutInput = LayoutInputOf<
  BusinessRowPlace,
  BusinessRowField
>;

/**
 * A person's row: `Jane Q Doe  12 Oak Ln, Dover, DE +2 … 3 businesses · 3
 * addresses`, then each business with its address, its states and the
 * person's role, then each address with the role; an icon before every name.
 */
export const PERSON_ROW: RowKind<PersonRowPlace, PersonRowField> = {
  places: PERSON_ROW_PLACES,
  fields: [
    ...PERSON_LINE_FIELDS.head,
    ...PERSON_LINE_FIELDS.business,
    ...PERSON_LINE_FIELDS.address,
  ],
  lines: [
    lineOf("head", "person", null),
    lineOf("business", "business", "businesses"),
    lineOf("address", "address", "addresses"),
  ],
  defaults: Object.freeze({
    headLead: "headIcon",
    headBadge: "firstAddress",
    headTrailingBadge: null,
    headTrailing: "counts",
    businessLead: "businessIcon",
    businessBadge: "address",
    businessTrailingBadge: "states",
    businessTrailing: "role",
    addressLead: "addressIcon",
    addressBadge: null,
    addressTrailingBadge: null,
    addressTrailing: "addressRole",
  }),
  accepts: acceptsOwnLine(PERSON_LINE_FIELDS),
};

/**
 * An address's row: the address with how many businesses and people are
 * there, then each business as on a person's row, then each person with
 * their role; an icon before every name.
 */
export const ADDRESS_ROW: RowKind<AddressRowPlace, AddressRowField> = {
  places: ADDRESS_ROW_PLACES,
  fields: [
    ...ADDRESS_LINE_FIELDS.head,
    ...ADDRESS_LINE_FIELDS.business,
    ...ADDRESS_LINE_FIELDS.person,
  ],
  lines: [
    lineOf("head", "address", null),
    lineOf("business", "business", "businesses"),
    lineOf("person", "person", "people"),
  ],
  defaults: Object.freeze({
    headLead: "headIcon",
    headBadge: null,
    headTrailingBadge: null,
    headTrailing: "counts",
    businessLead: "businessIcon",
    businessBadge: "address",
    businessTrailingBadge: "states",
    businessTrailing: "role",
    personLead: "personIcon",
    personBadge: null,
    personTrailingBadge: null,
    personTrailing: "personRole",
  }),
  accepts: acceptsOwnLine(ADDRESS_LINE_FIELDS),
};

const HEAD_PLACES: readonly string[] = ROW_PLACES;
const HEAD_FIELDS: readonly string[] = ROW_FIELDS;
const acceptsBusinessLine =
  acceptsOwnLine<BusinessRowField>(BUSINESS_LINE_FIELDS);

/**
 * A business's row: its head as a business row has always drawn it, the
 * title and the subtitle, with a place before the name for its icon; then,
 * where the host lists them, a line for each officer or agent and each
 * address, an icon before every name and the role at the right. By default
 * the head is today's and nothing is listed.
 */
export const BUSINESS_ROW: RowKind<BusinessRowPlace, BusinessRowField> = {
  places: BUSINESS_ROW_PLACES,
  fields: [
    ...ROW_FIELDS,
    ...BUSINESS_LINE_FIELDS.title,
    ...BUSINESS_LINE_FIELDS.person,
    ...BUSINESS_LINE_FIELDS.address,
  ],
  lines: [
    {
      ...ROW_LINES[0],
      leading: "titleLead",
      entity: "business",
      relation: null,
    },
    { ...ROW_LINES[1], entity: "business", relation: null },
    lineOf("person", "person", "people"),
    lineOf("address", "address", "addresses"),
  ],
  defaults: Object.freeze({
    ...DEFAULT_ROW_LAYOUT,
    titleLead: null,
    personLead: "personIcon",
    personBadge: null,
    personTrailingBadge: null,
    personTrailing: "personRole",
    addressLead: "addressIcon",
    addressBadge: null,
    addressTrailingBadge: null,
    addressTrailing: "addressRole",
  }),
  // The head's fields go anywhere in the head, as they always have; its icon
  // only before the name; a listed line's fields only on their own line.
  accepts: (place, field) =>
    HEAD_PLACES.includes(place)
      ? HEAD_FIELDS.includes(field)
      : acceptsBusinessLine(place, field),
};

/** Each search's row. */
export const ROW_KINDS = {
  businesses: BUSINESS_ROW,
  people: PERSON_ROW,
  addresses: ADDRESS_ROW,
} as const;

/** The relations a search's rows list under them when the host names none. */
export const DEFAULT_LIST: Readonly<Record<Route, readonly Relation[]>> =
  Object.freeze({
    businesses: [],
    people: ["businesses"],
    addresses: ["businesses"],
  });

export interface GroupedRequest<R extends Route> {
  /** The relations listed under each row, a line per item. */
  list: IncludeOf<R>[];
  /** What to ask the service to expand: the listed relations, and what the layout draws. */
  include: IncludeOf<R>[];
}

/**
 * What a search's rows list, and what to ask the autocomplete service to
 * expand for them: the relations in `list` (the search's `DEFAULT_LIST` when
 * left out), and whatever the layout draws besides. A business's head asks for
 * the people and the addresses its fields draw, as it always has; a person's
 * first address needs their addresses; the head's counts need every relation
 * they count. With a `scope`, a relation it does not grant on the route is
 * dropped from both, and what needs it draws nothing, rather than the search
 * failing. In the route's own order.
 */
export function requestFor(
  route: "businesses",
  layout: BusinessRowLayout,
  list?: readonly IncludeOf<"businesses">[],
  scope?: SessionScope,
): GroupedRequest<"businesses">;
export function requestFor(
  route: "people",
  layout: PersonRowLayout,
  list?: readonly IncludeOf<"people">[],
  scope?: SessionScope,
): GroupedRequest<"people">;
export function requestFor(
  route: "addresses",
  layout: AddressRowLayout,
  list?: readonly IncludeOf<"addresses">[],
  scope?: SessionScope,
): GroupedRequest<"addresses">;
export function requestFor(
  route: Route,
  layout: BusinessRowLayout | PersonRowLayout | AddressRowLayout,
  list: readonly Relation[] = DEFAULT_LIST[route],
  scope?: SessionScope,
): GroupedRequest<Route> {
  const fields: readonly (string | null)[] = Object.values(layout);
  const drawn = new Set(fields);
  const order: readonly Relation[] = ROUTES[route].includes;
  const needed = new Set<Relation>(list);
  if (route === "businesses") {
    // The head's places hold only the head's fields.
    const business = layout as BusinessRowLayout;
    const head = Object.fromEntries(
      ROW_PLACES.map(place => [place, business[place]]),
    ) as RowLayoutInput;
    for (const relation of includeForLayout(head)) needed.add(relation);
  }
  if (route === "people" && drawn.has("firstAddress")) {
    needed.add("addresses");
  }
  if (drawn.has("counts")) {
    order.forEach(relation => needed.add(relation));
  }
  const granted: readonly Relation[] =
    scope === undefined ? order : (scope.routes[route] ?? []);
  const asked = (relation: Relation) => granted.includes(relation);
  return {
    list: order.filter(relation => list.includes(relation) && asked(relation)),
    include: order.filter(relation => needed.has(relation) && asked(relation)),
  } as GroupedRequest<Route>;
}

/**
 * What a row offers to pick when the host names nothing: businesses, which
 * are a business row's head and the lines under a person or an address.
 */
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
  row: PersonSuggestion | AddressSuggestion | BusinessSuggestion,
  listed: readonly Relation[],
  pickable: readonly EntityType[] = DEFAULT_PICKABLE,
): GroupedLines {
  const related: Partial<Record<Relation, RelatedSet>> = row.related;
  const optionOf = (item: RelatedItem): GroupedOption | null => {
    if (item.token === null || !pickable.includes(item.type)) {
      return null;
    }
    if (item.type === "business") {
      // Only a person's or an address's row lists businesses.
      return row.type === "business"
        ? null
        : { kind: "business", row, business: item as PickableBusiness };
    }
    return {
      kind: "entity",
      row,
      pick: { type: item.type, token: item.token, label: item.label },
    };
  };
  return {
    head: {
      option: !pickable.includes(row.type)
        ? null
        : row.type === "business"
          ? { kind: "row", row }
          : {
              kind: "entity",
              row,
              pick: { type: row.type, token: row.token, label: row.label },
            },
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
