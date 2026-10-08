// Everything the styled component lets a host change, as one piece of state:
// the `look` knobs, the CSS variables that are not knobs, the row's layout,
// the behavior props, the text, and the markup switches. Defaults are the
// SDK's own, imported rather than copied, except the stylesheet's variables,
// which the stylesheet declares.

import {
  ADDRESS_ROW,
  BUSINESS_ROW,
  BUSINESS_STRUCTURES,
  DEFAULT_ENABLED_LINES,
  DEFAULT_ICON_SEGMENTS,
  DEFAULT_LIST,
  DEFAULT_LOOK,
  PERSON_ROW,
  ROUTES,
  ROW_KINDS,
  drawnLayout,
  resolveLayout,
  structureLabel,
  type AddressRowField,
  type AddressRowLayout,
  type AddressRowPlace,
  type BusinessRowField,
  type BusinessRowLayout,
  type BusinessRowPlace,
  type EntityType,
  type IconSegmentByRoute,
  type IncludeOf,
  type LayoutOf,
  type Look,
  type MatchEmphasis,
  type MatchRegion,
  type PersonRowField,
  type PersonRowLayout,
  type PersonRowPlace,
  type Relation,
  type Route,
  type RowField,
  type RowKind,
  type RowLine,
  type RowPlace,
} from "@baselayer-sdk/autocomplete";
import {
  DEBOUNCE_MS,
  DEFAULT_LIMIT,
  DEFAULT_MESSAGES,
  MIN_QUERY_CHARS,
  type AutocompleteMessages,
  type MintTiming,
} from "@baselayer-sdk/autocomplete/react";

import type { Snippet } from "../shared/Code";

/** The variables in react/styles.css that `look` does not set. */
export const CSS_VARIABLES = {
  "--bl-ac-highlight-bg": {
    label: "Active row",
    kind: "color",
    value: "#edf2f7",
  },
  "--bl-ac-border": { label: "Menu border", kind: "color", value: "#edf2f7" },
  "--bl-ac-more-fg": { label: "+N flag text", kind: "color", value: "#2d3748" },
  "--bl-ac-ink-base": {
    label: "Unmatched ink (ink mode)",
    kind: "color",
    value: "#4a5568",
  },
  // Unset in the stylesheet: a matched word keeps the title's ink.
  "--bl-ac-ink-mark": {
    label: "Matched ink (ink mode)",
    kind: "color",
    value: "",
  },
  "--bl-ac-also-mark": {
    label: "Alternative-name highlight",
    kind: "color",
    value: "#2d3748",
  },
  "--bl-ac-underline": {
    label: "Underline highlight",
    kind: "color",
    value: "#38a169",
  },
  "--bl-ac-marker": {
    label: "Background highlight",
    kind: "color",
    value: "#c6f6d5",
  },
  "--bl-ac-radius": { label: "Menu corners", kind: "length", value: "0.5rem" },
  "--bl-ac-pill-radius": {
    label: "Flag corners",
    kind: "length",
    value: "0.25rem",
  },
  "--bl-ac-menu-width": { label: "Menu width", kind: "length", value: "560px" },
  "--bl-ac-list-max-height": {
    label: "List height",
    kind: "length",
    value: "24rem",
  },
  "--bl-ac-line-height": { label: "Line height", kind: "number", value: "1.5" },
  "--bl-ac-shadow": {
    label: "Menu shadow",
    kind: "text",
    value: "0 4px 8px rgba(16, 24, 40, 0.08)",
  },
  "--bl-ac-z": { label: "Stacking (z-index)", kind: "number", value: "1000" },
  // Unset in the stylesheet: the component takes the page's font.
  "--bl-ac-font": { label: "Font", kind: "font", value: "" },
  "--bl-ac-name-weight": { label: "Name", kind: "weight", value: "600" },
  "--bl-ac-weight-base": {
    label: "Unmatched words",
    kind: "weight",
    value: "500",
  },
  "--bl-ac-weight-mark": {
    label: "Matched words",
    kind: "weight",
    value: "700",
  },
} as const;

export type CssVariable = keyof typeof CSS_VARIABLES;

/** The fonts the Font fold offers: the page's own, and the ones it loads. */
export const FONT_CHOICES = [
  { label: "Page font (Uncut Sans)", value: "" },
  {
    label: "System UI",
    value: 'system-ui, -apple-system, "Segoe UI", sans-serif',
  },
  {
    label: "Serif (Newsreader)",
    value: '"Newsreader Variable", Georgia, serif',
  },
  {
    label: "Mono (Geist Mono)",
    value: '"Geist Mono", ui-monospace, monospace',
  },
] as const;

/** A font stack the fold does not offer: the host's own. */
export const CUSTOM_FONT = "custom";

/** Which of the fold's fonts a stack is, or the host's own. */
export function fontChoice(stack: string): string {
  const trimmed = stack.trim();
  return (
    FONT_CHOICES.find(choice => choice.value === trimmed)?.value ?? CUSTOM_FONT
  );
}

export const FONT_WEIGHTS = [
  "100",
  "200",
  "300",
  "400",
  "500",
  "600",
  "700",
  "800",
  "900",
] as const;

export const WEIGHT_LABELS: Record<(typeof FONT_WEIGHTS)[number], string> = {
  "100": "100 · Thin",
  "200": "200 · Extra light",
  "300": "300 · Light",
  "400": "400 · Regular",
  "500": "500 · Medium",
  "600": "600 · Semibold",
  "700": "700 · Bold",
  "800": "800 · Extra bold",
  "900": "900 · Black",
};

export const WEIGHT_VARIABLES = [
  "--bl-ac-name-weight",
  "--bl-ac-weight-base",
  "--bl-ac-weight-mark",
] as const satisfies readonly CssVariable[];

/** A variable's value in the state, or its default when it is left empty. */
function varOrDefault(state: StyleState, name: CssVariable): string {
  return state.vars[name].trim() || CSS_VARIABLES[name].value;
}

/**
 * How to set a font of your own, in the weights the fold picked: load it in
 * the page, from a font service or from your own files, then name it in
 * `--bl-ac-font`. A stack of the host's own names its family; one of the
 * fold's own fonts stands in as "Your Font".
 */
export function fontSnippets(state: StyleState): Snippet[] {
  const stack = state.vars["--bl-ac-font"].trim();
  const own = fontChoice(stack) === CUSTOM_FONT;
  const named = own
    ? stack
        .split(",")[0]!
        .trim()
        .replace(/^["']|["']$/g, "")
    : "";
  const family = named === "" ? "Your Font" : named;
  const fontStack = own ? stack : `"${family}", system-ui, sans-serif`;
  const weights = [
    ...new Set(WEIGHT_VARIABLES.map(name => varOrDefault(state, name))),
  ].sort((a, b) => Number(a) - Number(b));
  const rule = [
    ".your-form .bl-ac {",
    `  --bl-ac-font: ${fontStack};`,
    ...WEIGHT_VARIABLES.map(name => `  ${name}: ${varOrDefault(state, name)};`),
    "}",
  ];
  const query = `family=${encodeURIComponent(family).replace(/%20/g, "+")}:wght@${weights.join(";")}&display=swap`;
  const html = [
    "<!-- 1. Load the font in your <head>; Google Fonts, for one. -->",
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />',
    "<link",
    '  rel="stylesheet"',
    `  href="https://fonts.googleapis.com/css2?${query}"`,
    "/>",
    "",
    "<!-- 2. Point the autocomplete at it, in the weights it draws. -->",
    "<style>",
    ...rule.map(line => `  ${line}`),
    "</style>",
  ].join("\n");
  const css = [
    "/* 1. Or serve the font files yourself: one @font-face per weight. */",
    ...weights.flatMap(weight => [
      "@font-face {",
      `  font-family: "${family}";`,
      `  src: url("/fonts/${family.toLowerCase().replace(/\s+/g, "-")}-${weight}.woff2") format("woff2");`,
      `  font-weight: ${weight};`,
      "  font-display: swap;",
      "}",
    ]),
    "",
    "/* 2. Point the autocomplete at it, in the weights it draws. */",
    ...rule,
  ].join("\n");
  return [
    { label: "HTML", lang: "html", code: html },
    { label: "CSS", lang: "css", code: css },
  ];
}

/** The messages that are strings; `more` and `httpFallback` are functions. */
export const TEXT_MESSAGES = [
  "searching",
  "truncatedNoRows",
  "truncatedRows",
  "match",
  "matches",
  "noAddress",
  "agentSuffix",
  "dayLimit",
  "unavailable",
  "authUnavailable",
] as const satisfies readonly (keyof AutocompleteMessages)[];

export type TextMessage = (typeof TEXT_MESSAGES)[number];

/** A structure the autocomplete service knows, which the Text fold lists. */
export type Structure = (typeof BUSINESS_STRUCTURES)[number];

/** Each structure's flag as the SDK draws it; "" for none. */
export const STRUCTURE_FLAGS = Object.fromEntries(
  BUSINESS_STRUCTURES.map(structure => [
    structure,
    structureLabel(structure) ?? "",
  ]),
) as Record<Structure, string>;

/** A search's row as the Components fold edits it. */
export interface RowState<R extends Route, L> {
  /** The field each place shows (`layout`). */
  layout: L;
  /** The relations listed under each row, a line per item (`list`). */
  list: IncludeOf<R>[];
  /** The lines a visitor can choose: the head, and the lines' entities (`enabledLines`). */
  enabled: EntityType[];
  /** The segments drawn with their icon (`iconSegments`). */
  iconSegments: IconSegmentByRoute[R][];
}

/** Each search's row. */
export interface RowStates {
  businesses: RowState<"businesses", BusinessRowLayout>;
  people: RowState<"people", PersonRowLayout>;
  addresses: RowState<"addresses", AddressRowLayout>;
}

export interface StyleState {
  look: Look;
  rows: RowStates;
  vars: Record<CssVariable, string>;
  limit: number;
  minChars: number;
  debounceMs: number;
  /** When the session is minted: on focus, keystroke or request. */
  mintOn: MintTiming;
  /** The menu as wide as the input, or as `--bl-ac-menu-width`. */
  menuFollowsInputWidth: boolean;
  label: string;
  messages: Record<TextMessage, string>;
  /** Each structure's flag (`messages.structures`); "" draws none. */
  structures: Record<Structure, string>;
  /** Draw the input with this page's own input class (`classNames.input`). */
  pageInput: boolean;
  unstyled: boolean;
  /** The preset last applied, which a color's reset returns to. */
  preset: string;
}

export const DEFAULT_LABEL = "Business name";

export const DEFAULT_STYLE: StyleState = {
  look: { ...DEFAULT_LOOK },
  rows: {
    businesses: {
      layout: resolveLayout(BUSINESS_ROW),
      list: [...DEFAULT_LIST.businesses] as IncludeOf<"businesses">[],
      enabled: [...DEFAULT_ENABLED_LINES],
      iconSegments: [...DEFAULT_ICON_SEGMENTS.businesses],
    },
    people: {
      layout: resolveLayout(PERSON_ROW),
      list: [...DEFAULT_LIST.people] as IncludeOf<"people">[],
      enabled: [...DEFAULT_ENABLED_LINES],
      iconSegments: [...DEFAULT_ICON_SEGMENTS.people],
    },
    addresses: {
      layout: resolveLayout(ADDRESS_ROW),
      list: [...DEFAULT_LIST.addresses] as IncludeOf<"addresses">[],
      enabled: [...DEFAULT_ENABLED_LINES],
      iconSegments: [...DEFAULT_ICON_SEGMENTS.addresses],
    },
  },
  vars: Object.fromEntries(
    Object.entries(CSS_VARIABLES).map(([name, spec]) => [name, spec.value]),
  ) as Record<CssVariable, string>,
  limit: DEFAULT_LIMIT,
  minChars: MIN_QUERY_CHARS,
  debounceMs: DEBOUNCE_MS,
  mintOn: "keystroke",
  menuFollowsInputWidth: true,
  label: DEFAULT_LABEL,
  messages: Object.fromEntries(
    TEXT_MESSAGES.map(key => [key, DEFAULT_MESSAGES[key]]),
  ) as Record<TextMessage, string>,
  structures: { ...STRUCTURE_FLAGS },
  pageInput: false,
  unstyled: false,
  preset: "Light",
};

export type LookColor = {
  [K in keyof Look]: Look[K] extends string
    ? K extends "matchEmphasis" | "matchEmphasisRegion"
      ? never
      : K
    : never;
}[keyof Look];

export const LOOK_COLORS: { key: LookColor; label: string }[] = [
  { key: "backgroundColor", label: "Menu background" },
  { key: "titleColor", label: "Title" },
  { key: "subtitleColor", label: "Subtitles" },
  { key: "pillBackgroundColor", label: "Flag" },
  { key: "pillForegroundColor", label: "Flag text" },
  { key: "primaryPillBorderColor", label: "Domicile flag border" },
  { key: "secondaryPillBackgroundColor", label: "+N flag" },
  { key: "structurePillBackgroundColor", label: "Structure flag" },
  { key: "structurePillForegroundColor", label: "Structure flag text" },
];

export const EMPHASES: MatchEmphasis[] = [
  "underline",
  "background",
  "weight",
  "ink",
  "plain",
];
export const REGIONS: MatchRegion[] = ["token", "substring"];

/** The `look` knobs that differ from the default, for the component and the export. */
export function changedLook(state: StyleState): Partial<Look> {
  const out: Partial<Record<keyof Look, unknown>> = {};
  for (const key of Object.keys(DEFAULT_LOOK) as (keyof Look)[]) {
    const value = state.look[key];
    const base = DEFAULT_LOOK[key];
    const same =
      typeof value === "string" && typeof base === "string"
        ? value.toLowerCase() === base.toLowerCase()
        : value === base;
    if (!same) out[key] = value;
  }
  return out as Partial<Look>;
}

export function changedVars(state: StyleState): [CssVariable, string][] {
  return (Object.keys(CSS_VARIABLES) as CssVariable[])
    .filter(name => state.vars[name].trim() !== CSS_VARIABLES[name].value)
    .filter(name => state.vars[name].trim() !== "")
    .map(name => [name, state.vars[name].trim()]);
}

export function changedMessages(state: StyleState): [TextMessage, string][] {
  return TEXT_MESSAGES.filter(
    key => state.messages[key] !== DEFAULT_MESSAGES[key],
  ).map(key => [key, state.messages[key]]);
}

/** The structure flags relabeled, in the autocomplete service's order. */
export function changedStructures(state: StyleState): [Structure, string][] {
  return BUSINESS_STRUCTURES.filter(
    structure => state.structures[structure] !== STRUCTURE_FLAGS[structure],
  ).map(structure => [structure, state.structures[structure]]);
}

/** Where a dragged field can land besides a place: out of the row. */
export const TRAY = "tray";

/** The choice that leaves a place empty. */
export const EMPTY_PLACE = "empty";

/**
 * A kind of row as the Components fold edits it: its places and fields, what
 * to call each, what each field reads off the wire, and each line's name.
 */
export interface RowEditor<P extends string, F extends string> {
  kind: RowKind<P, F>;
  placeLabels: Record<P, string>;
  fieldLabels: Record<F, string>;
  fieldWire: Record<F, readonly string[]>;
  /** Each line's name, which no place holds: long, and for a narrow panel. */
  lineNames: Record<string, { long: string; short: string }>;
  /**
   * Each line kind's name, by the relation it lists or `head`, as a sentence
   * names it: its handle shows or hides it, its toggle enables it.
   */
  kindNames: Record<string, string>;
}

/**
 * What the Components fold does with a kind's layout: where a dragged field
 * can land, what each place offers, and the layout after a drop or a pick,
 * always as the row draws it.
 */
export function editorOps<P extends string, F extends string>(
  editor: RowEditor<P, F>,
) {
  type Layout = LayoutOf<P, F>;
  type Spot = P | typeof TRAY;
  type Choice = F | typeof EMPTY_PLACE;
  const { kind } = editor;
  const placeOf = (layout: Layout, field: F) =>
    kind.places.find(place => layout[place] === field);

  /**
   * The layout with a field dropped somewhere, as the row draws it. On a
   * place, the field takes it and whatever the place held goes where the
   * field came from (a swap, or out of the row when the field came from the
   * tray); on the tray, the field leaves the row.
   */
  function moveField(layout: Layout, field: F, to: Spot): Layout {
    const from = placeOf(layout, field);
    const next = { ...layout };
    if (to === TRAY) {
      if (from !== undefined) next[from] = null;
      return drawnLayout(kind, resolveLayout(kind, next));
    }
    const displaced = next[to];
    if (from !== undefined) next[from] = displaced;
    next[to] = field;
    return drawnLayout(kind, resolveLayout(kind, next));
  }

  /**
   * Whether a field can be dropped on a spot: on a place other than its own
   * where the row would draw it, and on the tray when the row shows it. A
   * badge beside nothing, the badge beside the field itself included, or a
   * place on another line than the field's, takes nothing.
   */
  function canDrop(layout: Layout, field: F, to: Spot): boolean {
    const from = placeOf(layout, field);
    if (to === TRAY) return from !== undefined;
    return to !== from && moveField(layout, field, to)[to] === field;
  }

  /** The fields the layout places nowhere, in their own order. */
  function unplacedFields(layout: Layout): F[] {
    const placed = new Set(kind.places.map(place => layout[place]));
    return kind.fields.filter(field => !placed.has(field));
  }

  /**
   * The layout with a choice made for one place, as the row draws it: a pick
   * is the drop of that field on that place, so it swaps with what the place
   * held, and empty sends the place's field out of the row.
   */
  function withPlaced(layout: Layout, place: P, choice: Choice): Layout {
    if (choice !== EMPTY_PLACE) {
      return moveField(layout, choice, place);
    }
    const field = layout[place];
    return field === null
      ? drawnLayout(kind, layout)
      : moveField(layout, field, TRAY);
  }

  /**
   * A place's options: empty, and every field the row would draw there. A
   * field placed elsewhere says where it comes from, and that it swaps with
   * the place's own field when the place holds one.
   */
  function placeOptions(
    layout: Layout,
    place: P,
  ): { value: Choice; label: string }[] {
    const choices: Choice[] = [EMPTY_PLACE, ...kind.fields];
    const drawnHere = choices.filter(
      choice =>
        choice === EMPTY_PLACE ||
        withPlaced(layout, place, choice)[place] === choice,
    );
    return drawnHere.map(choice => {
      const label =
        choice === EMPTY_PLACE ? "Empty" : editor.fieldLabels[choice];
      const elsewhere = kind.places.find(
        other => other !== place && layout[other] === choice,
      );
      return {
        value: choice,
        label:
          elsewhere === undefined
            ? label
            : `${label}, ${layout[place] === null ? "from" : "swaps with"} ${editor.placeLabels[elsewhere]}`,
      };
    });
  }

  return { canDrop, moveField, placeOptions, unplacedFields, withPlaced };
}

/** Each place a host fills, named for where it sits. */
export const PLACE_LABELS: Record<RowPlace, string> = {
  titleBadge: "Beside the name",
  titleTrailingBadge: "Beside title, right",
  titleTrailing: "Title, right",
  subtitle: "Subtitle",
  subtitleBadge: "Beside subtitle",
  subtitleTrailingBadge: "Beside subtitle, right",
  subtitleTrailing: "Subtitle, right",
};

/**
 * What each field reads off a row of the autocomplete service's answer, the
 * fields of the response it is drawn from. The marks a filter earns read its
 * flags: `matched` on the people and the addresses, and the request's state
 * filter, which the service flags nowhere.
 */
export const FIELD_WIRE: Record<RowField, readonly string[]> = {
  states: ["domicile_state", "states", "state filter"],
  structure: ["structure"],
  address: [
    "related.addresses.items[0].label",
    "related.addresses.items[0].matched",
    "related.addresses.items[0].role",
  ],
  people: [
    "related.people.items[].label",
    "related.people.items[].matched",
    "related.people.items[].role",
  ],
  counts: ["related.people.count", "related.addresses.count"],
};

export type DropSpot = RowPlace | typeof TRAY;
export type PlaceChoice = RowField | typeof EMPTY_PLACE;

export const CHOICE_LABELS: Record<PlaceChoice, string> = {
  [EMPTY_PLACE]: "Empty",
  states: "States",
  structure: "Structure",
  address: "Address",
  people: "People",
  counts: "Counts",
};

/**
 * A business's row: its head, as a business row has always drawn it, and the
 * officers and addresses it can list.
 */
export const BUSINESS_EDITOR: RowEditor<BusinessRowPlace, BusinessRowField> = {
  kind: BUSINESS_ROW,
  placeLabels: {
    ...PLACE_LABELS,
    personBadge: "Beside person",
    personTrailingBadge: "Beside person, right",
    personTrailing: "Person, right",
    addressBadge: "Beside address",
    addressTrailingBadge: "Beside address, right",
    addressTrailing: "Address, right",
  },
  fieldLabels: {
    states: CHOICE_LABELS.states,
    structure: CHOICE_LABELS.structure,
    address: CHOICE_LABELS.address,
    people: CHOICE_LABELS.people,
    counts: CHOICE_LABELS.counts,
    personRole: "Role",
    addressRole: "Held as",
  },
  fieldWire: {
    ...FIELD_WIRE,
    personRole: ["related.people.items[].role"],
    addressRole: ["related.addresses.items[].role"],
  },
  lineNames: {
    title: { long: "Business name", short: "Name" },
    person: { long: "Officer or agent", short: "Person" },
    address: { long: "Address", short: "Address" },
  },
  kindNames: {
    head: "the business",
    people: "officers and agents",
    addresses: "addresses",
  },
};

/** What a business line reads, under a person or an address. */
const BUSINESS_LINE_WIRE = {
  address: ["related.businesses.items[].address"],
  states: [
    "related.businesses.items[].domicile_state",
    "related.businesses.items[].states",
  ],
  role: ["related.businesses.items[].role"],
} as const;

/** A person's row. */
export const PERSON_EDITOR: RowEditor<PersonRowPlace, PersonRowField> = {
  kind: PERSON_ROW,
  placeLabels: {
    headBadge: "Beside the name",
    headTrailingBadge: "Beside head, right",
    headTrailing: "Head, right",
    businessBadge: "Beside business",
    businessTrailingBadge: "Beside business, right",
    businessTrailing: "Business, right",
    addressBadge: "Beside address",
    addressTrailingBadge: "Beside address, right",
    addressTrailing: "Address, right",
  },
  fieldLabels: {
    firstAddress: "First address",
    counts: "Counts",
    address: "Address",
    states: "States",
    role: "Role",
    addressRole: "Role there",
  },
  fieldWire: {
    firstAddress: [
      "related.addresses.items[0].label",
      "related.addresses.count",
    ],
    counts: ["related.businesses.count", "related.addresses.count"],
    ...BUSINESS_LINE_WIRE,
    addressRole: ["related.addresses.items[].role"],
  },
  lineNames: {
    head: { long: "Person's name", short: "Name" },
    business: { long: "Business name", short: "Business" },
    address: { long: "Their address", short: "Address" },
  },
  kindNames: {
    head: "the person",
    businesses: "businesses",
    addresses: "their addresses",
  },
};

/** An address's row. */
export const ADDRESS_EDITOR: RowEditor<AddressRowPlace, AddressRowField> = {
  kind: ADDRESS_ROW,
  placeLabels: {
    headBadge: "Beside the address",
    headTrailingBadge: "Beside head, right",
    headTrailing: "Head, right",
    businessBadge: "Beside business",
    businessTrailingBadge: "Beside business, right",
    businessTrailing: "Business, right",
    personBadge: "Beside person",
    personTrailingBadge: "Beside person, right",
    personTrailing: "Person, right",
  },
  fieldLabels: {
    counts: "Counts",
    address: "Its own address",
    states: "States",
    role: "Held as",
    personRole: "Role",
  },
  fieldWire: {
    counts: ["related.businesses.count", "related.people.count"],
    ...BUSINESS_LINE_WIRE,
    personRole: ["related.people.items[].role"],
  },
  lineNames: {
    head: { long: "Address", short: "Address" },
    business: { long: "Business name", short: "Business" },
    person: { long: "Person's name", short: "Person" },
  },
  kindNames: {
    head: "the address",
    businesses: "businesses",
    people: "people there",
  },
};

export const { canDrop, moveField, placeOptions, unplacedFields, withPlaced } =
  editorOps(BUSINESS_EDITOR);

/**
 * A kind of line a row draws: its head, which is always drawn, or a relation
 * it can list, a line per item.
 */
export interface LineKind {
  /** The relation it lists; null on the head. */
  relation: Relation | null;
  /** The entity it draws, which its toggle names in `enabledLines`. */
  entity: EntityType;
  /** The model's lines that draw it: a business's head is its title and subtitle. */
  lines: readonly RowLine<string, string>[];
}

/** A search's row's line kinds, the head first, in the order the row draws them. */
export function lineKinds(route: Route): LineKind[] {
  const kinds: {
    relation: Relation | null;
    entity: EntityType;
    lines: RowLine<string, string>[];
  }[] = [];
  const lines: readonly RowLine<string, string>[] = ROW_KINDS[route].lines;
  for (const line of lines) {
    const relation = line.relation ?? null;
    const same = kinds.find(kind => kind.relation === relation);
    if (same === undefined) {
      kinds.push({
        relation,
        entity: line.entity ?? ROUTES[route].entity,
        lines: [line],
      });
    } else {
      same.lines.push(line);
    }
  }
  return kinds;
}

/**
 * The fields a line kind of a search's row can show: any its places take,
 * in the row's own order.
 */
export function lineFields(route: Route, relation: Relation | null): string[] {
  const fields: readonly string[] = ROW_KINDS[route].fields;
  const accepts = ROW_KINDS[route].accepts as
    ((place: string, field: string) => boolean) | undefined;
  const places = lineKinds(route)
    .filter(each => each.relation === relation)
    .flatMap(each => each.lines)
    .flatMap(({ lead, trailing }) =>
      [lead.field, lead.badge, trailing.badge, trailing.field].filter(
        (place): place is string => place !== null && place !== undefined,
      ),
    );
  return fields.filter(field =>
    places.some(place => accepts?.(place, field) ?? true),
  );
}

/** The entities a search's row draws: its head's, and each listed line's. */
export function shownEntities(route: Route, state: StyleState): EntityType[] {
  const list: readonly Relation[] = state.rows[route].list;
  return lineKinds(route)
    .filter(kind => kind.relation === null || list.includes(kind.relation))
    .map(kind => kind.entity);
}

/** The state with one search's row changed. */
function withRow<R extends Route>(
  state: StyleState,
  route: R,
  row: RowStates[R],
): StyleState {
  return { ...state, rows: { ...state.rows, [route]: row } };
}

/**
 * The state with a line kind listed under a search's rows, at `at` in the
 * list (its end when left out), or not listed. A line keeps whether it is
 * enabled while it is hidden, so it comes back as it was; `componentProps`
 * hands over only the shown ones.
 */
export function withListed<R extends Route>(
  state: StyleState,
  route: R,
  relation: IncludeOf<R>,
  listed: boolean,
  at?: number,
): StyleState {
  const row: RowStates[R] = state.rows[route];
  const list: readonly IncludeOf<R>[] = row.list;
  if (list.includes(relation) === listed) return state;
  if (!listed) {
    return withRow(state, route, {
      ...row,
      list: list.filter(each => each !== relation),
    });
  }
  const next = [...list];
  next.splice(clamp(at ?? next.length, next.length), 0, relation);
  return withRow(state, route, { ...row, list: next });
}

/** `at` within 0 and `most`. */
function clamp(at: number, most: number): number {
  return Math.min(Math.max(at, 0), most);
}

/**
 * The state with a listed line kind moved to `at` in its row's list, the
 * others keeping their order: the order the row draws its lines in.
 */
export function withListOrder<R extends Route>(
  state: StyleState,
  route: R,
  relation: IncludeOf<R>,
  at: number,
): StyleState {
  const row: RowStates[R] = state.rows[route];
  const list: readonly IncludeOf<R>[] = row.list;
  const from = list.indexOf(relation);
  if (from === -1) return state;
  const rest = list.filter(each => each !== relation);
  const to = clamp(at, rest.length);
  if (to === from) return state;
  rest.splice(to, 0, relation);
  return withRow(state, route, { ...row, list: rest });
}

/**
 * The state with a line's entity enabled on a search's rows, or disabled, in
 * the order the row draws its lines. A line the row does not draw keeps the
 * state.
 */
export function withEnabled<R extends Route>(
  state: StyleState,
  route: R,
  entity: EntityType,
  enabled: boolean,
): StyleState {
  const row: RowStates[R] = state.rows[route];
  if (
    !shownEntities(route, state).includes(entity) ||
    row.enabled.includes(entity) === enabled
  ) {
    return state;
  }
  return withRow(state, route, {
    ...row,
    enabled: lineKinds(route)
      .map(kind => kind.entity)
      .filter(type => (type === entity ? enabled : row.enabled.includes(type))),
  });
}

/** The entity a segment names, whose glyph its icon draws. */
export const SEGMENT_ENTITY: {
  readonly [R in Route]: Readonly<Record<IconSegmentByRoute[R], EntityType>>;
} = {
  businesses: {
    name: "business",
    address: "address",
    people: "person",
    personName: "person",
    addressName: "address",
  },
  people: {
    name: "person",
    firstAddress: "address",
    businessName: "business",
    address: "address",
    addressName: "address",
  },
  addresses: {
    name: "address",
    businessName: "business",
    address: "address",
    personName: "person",
  },
};

/** The entity a segment of a search's row names. */
export function segmentEntity(route: Route, segment: string): EntityType {
  const entities: Readonly<Record<string, EntityType>> = SEGMENT_ENTITY[route];
  return entities[segment]!;
}

/**
 * The segment a line's name is, when an icon can ride on it: the head's is
 * `name`, a listed line's its line's (`businessName`).
 */
export function nameSegment<R extends Route>(
  route: R,
  relation: Relation | null,
  line: string,
): IconSegmentByRoute[R] | null {
  const segment = relation === null ? "name" : `${line}Name`;
  const segments: readonly string[] = ROW_KINDS[route].iconSegments;
  return segments.includes(segment) ? (segment as IconSegmentByRoute[R]) : null;
}

/** The segment a field is, when an icon can ride on it. */
export function fieldSegment<R extends Route>(
  route: R,
  field: string,
): IconSegmentByRoute[R] | null {
  const segments: readonly string[] = ROW_KINDS[route].iconSegments;
  return segments.includes(field) ? (field as IconSegmentByRoute[R]) : null;
}

/**
 * The state with a segment drawn with its icon on a search's rows, or not, in
 * the order the row's kind names its segments.
 */
export function withIconSegment<R extends Route>(
  state: StyleState,
  route: R,
  segment: IconSegmentByRoute[R],
  on: boolean,
): StyleState {
  const row: RowStates[R] = state.rows[route];
  const segments: readonly string[] = row.iconSegments;
  if (segments.includes(segment) === on) return state;
  const order: readonly string[] = ROW_KINDS[route].iconSegments;
  return withRow(state, route, {
    ...row,
    iconSegments: order.filter(each =>
      each === segment ? on : segments.includes(each),
    ) as IconSegmentByRoute[R][],
  });
}

/**
 * What each search's component is handed for its row, as a host writes it:
 * the layout, the relations listed under each row, the lines enabled, and
 * the segments drawn with their icon.
 */
export interface ComponentProps {
  businesses: {
    layout: BusinessRowLayout;
    list: IncludeOf<"businesses">[];
    enabledLines: EntityType[];
    iconSegments: IconSegmentByRoute["businesses"][];
  };
  people: {
    layout: PersonRowLayout;
    list: IncludeOf<"people">[];
    enabledLines: EntityType[];
    iconSegments: IconSegmentByRoute["people"][];
  };
  addresses: {
    layout: AddressRowLayout;
    list: IncludeOf<"addresses">[];
    enabledLines: EntityType[];
    iconSegments: IconSegmentByRoute["addresses"][];
  };
}

/**
 * The props of the component for `route` that the Components fold sets: the
 * one reading of a row, which the exported configuration writes and the
 * preview draws.
 */
export function componentProps<R extends Route>(
  state: StyleState,
  route: R,
): ComponentProps[R] {
  const { layout, list, enabled, iconSegments } = state.rows[route];
  // A hidden line keeps its choice for when it is shown again, but nothing
  // not drawn can be chosen.
  const shown = shownEntities(route, state);
  return {
    layout,
    list,
    enabledLines: enabled.filter(entity => shown.includes(entity)),
    iconSegments,
  } as ComponentProps[R];
}

/** The preview's stylesheet: the changed variables, on the demo's component only. */
export function previewCss(state: StyleState): string {
  const vars = changedVars(state);
  if (vars.length === 0) return "";
  return `.demo-preview .bl-ac {\n${vars.map(([name, value]) => `  ${name}: ${value};`).join("\n")}\n}`;
}

function literal(value: unknown): string {
  return typeof value === "string" ? JSON.stringify(value) : String(value);
}

/**
 * The places of a search's row that the map draws and that show another field
 * than its component's default, in reading order: a line the row does not
 * list is not drawn, so nothing of it is written.
 */
export function changedRowLayout(
  state: StyleState,
  route: Route,
): [string, string | null][] {
  const layout: Readonly<Record<string, string | null>> = componentProps(
    state,
    route,
  ).layout;
  const kind: { places: readonly string[] } = ROW_KINDS[route];
  const defaults: Readonly<Record<string, string | null>> = resolveLayout(
    ROW_KINDS[route] as RowKind<string, string>,
  );
  const list: readonly Relation[] = state.rows[route].list;
  const drawn = new Set(
    lineKinds(route)
      .filter(each => each.relation === null || list.includes(each.relation))
      .flatMap(each => each.lines)
      .flatMap(({ lead, trailing }) => [
        lead.field,
        lead.badge,
        trailing.badge,
        trailing.field,
      ]),
  );
  return kind.places
    .filter(place => drawn.has(place) && layout[place] !== defaults[place])
    .map(place => [place, layout[place] ?? null]);
}

/**
 * How many things the Components fold changed, on every search's row: the
 * places the map draws, what each row lists, which of its lines are enabled
 * and which segments carry an icon.
 */
export function componentChanges(state: StyleState): number {
  const routes: Route[] = ["businesses", "people", "addresses"];
  return routes.reduce((count, route) => {
    const { list, enabledLines, iconSegments } = componentProps(state, route);
    const lists: [readonly string[], readonly string[]][] = [
      [list, DEFAULT_LIST[route]],
      [enabledLines, DEFAULT_ENABLED_LINES],
      [iconSegments, DEFAULT_ICON_SEGMENTS[route]],
    ];
    return (
      count +
      changedRowLayout(state, route).length +
      lists.filter(([value, defaults]) => value.join() !== defaults.join())
        .length
    );
  }, 0);
}

/** A list prop, unless it is the default. */
function listProp(
  name: string,
  values: readonly string[],
  defaults: readonly string[],
): string[] {
  return values.join() === defaults.join()
    ? []
    : [`${name}={[${values.map(value => JSON.stringify(value)).join(", ")}]}`];
}

const COMPONENT_OF: Record<Route, string> = {
  businesses: "BusinessAutocomplete",
  people: "PersonAutocomplete",
  addresses: "AddressAutocomplete",
};

/**
 * What every host gives the component, before anything it styles: the id
 * filled in, and the client, the value and the handlers left to the host.
 */
const REQUIRED_PROPS: Record<Route, readonly string[]> = {
  businesses: [
    'id="business"',
    "client={client}",
    "value={value}",
    "onChange={setValue}",
    "onPick={(suggestion, pick) => …}",
  ],
  people: [
    'id="person"',
    "client={client}",
    "value={value}",
    "onChange={setValue}",
    "onPick={pick => …}",
  ],
  addresses: [
    'id="address"',
    "client={client}",
    "value={value}",
    "onChange={setValue}",
    "onPick={pick => …}",
  ],
};

/**
 * What a host writes to get this look on the field for `route`: the props,
 * and the CSS. Each field's layout is its own row's.
 */
export function exportCode(
  state: StyleState,
  route: Route = "businesses",
): { tsx: string; css: string } {
  const props: string[] = [];
  const look = Object.entries(changedLook(state));
  if (look.length > 0) {
    props.push(
      `look={{\n${look.map(([key, value]) => `    ${key}: ${literal(value)},`).join("\n")}\n  }}`,
    );
  }
  const layout = changedRowLayout(state, route);
  if (layout.length > 0) {
    props.push(
      `layout={{\n${layout.map(([place, field]) => `    ${place}: ${field === null ? "null" : JSON.stringify(field)},`).join("\n")}\n  }}`,
    );
  }
  // What the row lists and which lines are enabled, as the component is handed
  // them; an enabled line that is not a business needs somewhere for its pick
  // to go.
  const { list, enabledLines, iconSegments } = componentProps(state, route);
  props.push(
    ...listProp("list", list, DEFAULT_LIST[route]),
    ...listProp("enabledLines", enabledLines, DEFAULT_ENABLED_LINES),
    ...listProp("iconSegments", iconSegments, DEFAULT_ICON_SEGMENTS[route]),
  );
  if (enabledLines.some(type => type !== "business")) {
    props.push("onPickEntity={pick => …}");
  }
  if (state.limit !== DEFAULT_STYLE.limit) props.push(`limit={${state.limit}}`);
  if (state.minChars !== DEFAULT_STYLE.minChars)
    props.push(`minChars={${state.minChars}}`);
  if (state.debounceMs !== DEFAULT_STYLE.debounceMs)
    props.push(`debounceMs={${state.debounceMs}}`);
  if (state.mintOn !== DEFAULT_STYLE.mintOn)
    props.push(`mintOn=${JSON.stringify(state.mintOn)}`);
  if (!state.menuFollowsInputWidth) props.push("menuFollowsInputWidth={false}");
  if (state.label !== DEFAULT_LABEL)
    props.push(`label=${JSON.stringify(state.label)}`);
  const messages = changedMessages(state).map(
    ([key, value]) => `    ${key}: ${JSON.stringify(value)},`,
  );
  const structures = changedStructures(state);
  if (structures.length > 0) {
    messages.push(
      `    structures: { ${structures.map(([structure, flag]) => `${structure}: ${JSON.stringify(flag)}`).join(", ")} },`,
    );
  }
  if (messages.length > 0) {
    props.push(`messages={{\n${messages.join("\n")}\n  }}`);
  }
  if (state.pageInput) props.push('classNames={{ input: "your-input" }}');
  if (state.unstyled) props.push("unstyled");
  const lines = [...REQUIRED_PROPS[route], ...props].join("\n  ");
  const tsx = `<${COMPONENT_OF[route]}\n  ${lines}\n/>${
    props.length === 0 ? "\n// Nothing else changed from the defaults." : ""
  }`;
  const vars = changedVars(state);
  const css =
    vars.length === 0
      ? "/* No variables changed. */"
      : `/* Set them on .bl-ac under a selector of your own. */\n.your-form .bl-ac {\n${vars.map(([name, value]) => `  ${name}: ${value};`).join("\n")}\n}`;
  return { tsx, css };
}

/** How matched words are marked: the part of the look a preset sets. */
export type Highlight = Pick<
  Look,
  "matchEmphasis" | "matchEmphasisRegion" | "matchEmphasisColor"
>;
const HIGHLIGHT_KEYS = [
  "matchEmphasis",
  "matchEmphasisRegion",
  "matchEmphasisColor",
] as const satisfies readonly (keyof Highlight)[];

/**
 * A search's row as a preset sets it: where each field sits, staged over the
 * defaults as a host's layout is, and the lines, their order, and what they draw.
 */
export type PresetRow<R extends Route> = Partial<
  Pick<RowStates[R], "list" | "enabled" | "iconSegments">
> & { layout?: Partial<RowStates[R]["layout"]> };

/**
 * A look: the colors, corners and shadow, the font and its sizes, how matched
 * words are marked, and each search's whole row, all over the defaults.
 */
export interface Preset {
  name: string;
  look: Partial<Pick<Look, LookColor>>;
  vars: Partial<Record<CssVariable, string>>;
  highlight?: Partial<Highlight>;
  rows?: { [R in Route]?: PresetRow<R> };
}

/**
 * The variables a preset owns, beside its look's colors and highlight: the
 * colors only the stylesheet sets, the corners and the shadow, the font, the
 * line height and the three weights. The menu's width, the list's height and
 * the stacking (`--bl-ac-menu-width`, `--bl-ac-list-max-height`, `--bl-ac-z`)
 * are the host's layout and stay the reader's, as do behavior and text.
 */
const PRESET_VARS: CssVariable[] = [
  "--bl-ac-highlight-bg",
  "--bl-ac-border",
  "--bl-ac-more-fg",
  "--bl-ac-ink-base",
  "--bl-ac-ink-mark",
  "--bl-ac-also-mark",
  "--bl-ac-underline",
  "--bl-ac-marker",
  "--bl-ac-radius",
  "--bl-ac-pill-radius",
  "--bl-ac-shadow",
  "--bl-ac-font",
  "--bl-ac-line-height",
  "--bl-ac-name-weight",
  "--bl-ac-weight-base",
  "--bl-ac-weight-mark",
];

// The fonts a preset may take: the Font fold's own, and none the site does not load.
const SYSTEM_UI = FONT_CHOICES[1].value;
const SERIF = FONT_CHOICES[2].value;
const MONO = FONT_CHOICES[3].value;

// Where a preset puts the fields of each search's row, staged over the defaults.
const BUSINESS_LAYOUTS = {
  statesBeside: { titleBadge: "states", titleTrailing: "structure" },
  compact: { subtitle: null, subtitleTrailing: null },
  addressRight: { subtitle: "people", subtitleTrailing: "address" },
  rolesInline: {
    personBadge: "personRole",
    personTrailing: null,
    addressBadge: "addressRole",
    addressTrailing: null,
  },
  statesBelow: { titleTrailing: null, subtitleTrailing: "states" },
  countsRight: { subtitleTrailing: "counts" },
  countsBeside: { titleTrailingBadge: "counts" },
} as const satisfies Record<string, Partial<BusinessRowLayout>>;

const PERSON_LAYOUTS = {
  noCounts: { headTrailing: null },
  countsBeside: { headBadge: "counts", headTrailing: "firstAddress" },
  addressRight: { businessBadge: null, businessTrailingBadge: "address" },
  noStates: { businessTrailingBadge: null },
  addressRoleInline: { addressBadge: "addressRole", addressTrailing: null },
} as const satisfies Record<string, Partial<PersonRowLayout>>;

const ADDRESS_LAYOUTS = {
  noCounts: { headTrailing: null },
  countsBeside: { headBadge: "counts", headTrailing: null },
  noStates: { businessTrailingBadge: null },
  personRoleInline: { personBadge: "personRole", personTrailing: null },
  noAddress: { businessBadge: null },
} as const satisfies Record<string, Partial<AddressRowLayout>>;

export const PRESETS: Preset[] = [
  // The default colors, and matched ink in the green of the highlights.
  { name: "Light", look: {}, vars: { "--bl-ac-ink-mark": "#2f855a" } },
  {
    name: "Baselayer",
    look: {
      titleColor: "#1c1b1c",
      subtitleColor: "#676b76",
      pillBackgroundColor: "#c6dbf6",
      pillForegroundColor: "#09234f",
      primaryPillBorderColor: "#384ce3",
      secondaryPillBackgroundColor: "#f1f6fd",
      structurePillBackgroundColor: "#eef0f3",
      structurePillForegroundColor: "#4b4f58",
    },
    vars: {
      "--bl-ac-highlight-bg": "#f1f6fd",
      "--bl-ac-border": "#dce5f5",
      "--bl-ac-more-fg": "#09234f",
      "--bl-ac-ink-base": "#676b76",
      "--bl-ac-ink-mark": "#384ce3",
      "--bl-ac-also-mark": "#1c1b1c",
      "--bl-ac-underline": "#384ce3",
      "--bl-ac-marker": "#c6dbf6",
      "--bl-ac-radius": "2px",
      "--bl-ac-pill-radius": "2px",
      "--bl-ac-shadow": "0 18px 36px rgba(9, 35, 79, 0.12)",
    },
    highlight: { matchEmphasis: "ink", matchEmphasisRegion: "token" },
    rows: {
      businesses: {
        layout: BUSINESS_LAYOUTS.statesBeside,
        list: ["people"],
        iconSegments: ["name", "personName"],
      },
      people: { layout: PERSON_LAYOUTS.noCounts },
      addresses: { layout: ADDRESS_LAYOUTS.noCounts },
    },
  },
  {
    name: "Midnight",
    look: {
      backgroundColor: "#0b1220",
      titleColor: "#e5e9f2",
      subtitleColor: "#8b95a7",
      pillBackgroundColor: "#1f2a44",
      pillForegroundColor: "#a5b4fc",
      primaryPillBorderColor: "#6366f1",
      secondaryPillBackgroundColor: "#182033",
      structurePillBackgroundColor: "#1c2230",
      structurePillForegroundColor: "#aeb6c4",
    },
    vars: {
      "--bl-ac-highlight-bg": "#172036",
      "--bl-ac-border": "#1f2a44",
      "--bl-ac-more-fg": "#cbd5e1",
      "--bl-ac-ink-base": "#8b95a7",
      "--bl-ac-ink-mark": "#818cf8",
      "--bl-ac-also-mark": "#e5e9f2",
      "--bl-ac-underline": "#818cf8",
      "--bl-ac-marker": "#312e81",
      "--bl-ac-shadow": "0 12px 32px rgba(0, 0, 0, 0.45)",
      "--bl-ac-line-height": "1.6",
      "--bl-ac-name-weight": "700",
    },
    highlight: { matchEmphasis: "background", matchEmphasisRegion: "token" },
    rows: {
      people: { list: ["businesses", "addresses"] },
      addresses: { layout: ADDRESS_LAYOUTS.countsBeside },
    },
  },
  {
    name: "Monokai",
    look: {
      backgroundColor: "#272822",
      titleColor: "#f8f8f2",
      subtitleColor: "#a59f85",
      pillBackgroundColor: "#3e3d32",
      pillForegroundColor: "#a6e22e",
      primaryPillBorderColor: "#a6e22e",
      secondaryPillBackgroundColor: "#3e3d32",
      structurePillBackgroundColor: "#3e3d32",
      structurePillForegroundColor: "#66d9ef",
    },
    vars: {
      "--bl-ac-highlight-bg": "#3e3d32",
      "--bl-ac-border": "#49483e",
      "--bl-ac-more-fg": "#f8f8f2",
      "--bl-ac-ink-base": "#a59f85",
      "--bl-ac-ink-mark": "#f92672",
      "--bl-ac-also-mark": "#e6db74",
      "--bl-ac-underline": "#f92672",
      "--bl-ac-marker": "#75715e",
      "--bl-ac-radius": "0",
      "--bl-ac-pill-radius": "0",
      "--bl-ac-shadow": "none",
      "--bl-ac-font": MONO,
      // Geist Mono loads in 400 and 500 only; a heavier name is faux bold.
      "--bl-ac-name-weight": "500",
    },
    highlight: {
      matchEmphasis: "ink",
      matchEmphasisRegion: "substring",
      matchEmphasisColor: "#fd971f",
    },
    rows: {
      businesses: { layout: BUSINESS_LAYOUTS.compact, iconSegments: [] },
      people: { layout: PERSON_LAYOUTS.countsBeside, iconSegments: [] },
      addresses: { layout: ADDRESS_LAYOUTS.noStates, iconSegments: [] },
    },
  },
  {
    name: "Sepia",
    look: {
      backgroundColor: "#fbf6ec",
      titleColor: "#3b2f25",
      subtitleColor: "#8a7866",
      pillBackgroundColor: "#efe2cb",
      pillForegroundColor: "#6b4a24",
      primaryPillBorderColor: "#b0793a",
      secondaryPillBackgroundColor: "#f3ead9",
      structurePillBackgroundColor: "#ede7dd",
      structurePillForegroundColor: "#6e6358",
    },
    vars: {
      "--bl-ac-highlight-bg": "#f3ead9",
      "--bl-ac-border": "#e7dcc6",
      "--bl-ac-more-fg": "#6b4a24",
      "--bl-ac-ink-base": "#8a7866",
      "--bl-ac-ink-mark": "#9a6429",
      "--bl-ac-also-mark": "#3b2f25",
      "--bl-ac-underline": "#b0793a",
      "--bl-ac-marker": "#f4d9a6",
      "--bl-ac-radius": "4px",
      "--bl-ac-line-height": "1.65",
      "--bl-ac-font": SERIF,
    },
    highlight: { matchEmphasis: "underline", matchEmphasisRegion: "token" },
    rows: {
      businesses: {
        layout: BUSINESS_LAYOUTS.statesBelow,
        list: ["addresses"],
        iconSegments: ["addressName"],
      },
      people: { list: ["addresses"] },
      addresses: { list: ["people"] },
    },
  },
  {
    name: "Rosé",
    look: {
      titleColor: "#2a1520",
      subtitleColor: "#8c6a78",
      pillBackgroundColor: "#fde2ea",
      pillForegroundColor: "#9d174d",
      primaryPillBorderColor: "#db2777",
      secondaryPillBackgroundColor: "#fdf2f6",
      structurePillBackgroundColor: "#f2ebee",
      structurePillForegroundColor: "#6f5a63",
    },
    vars: {
      "--bl-ac-highlight-bg": "#fdf2f6",
      "--bl-ac-border": "#f6dbe5",
      "--bl-ac-more-fg": "#9d174d",
      "--bl-ac-ink-base": "#8c6a78",
      "--bl-ac-ink-mark": "#db2777",
      "--bl-ac-also-mark": "#2a1520",
      "--bl-ac-underline": "#db2777",
      "--bl-ac-marker": "#fbcfe8",
      "--bl-ac-radius": "12px",
      "--bl-ac-pill-radius": "999px",
    },
    highlight: {
      matchEmphasis: "background",
      matchEmphasisRegion: "substring",
    },
    rows: {
      businesses: {
        layout: BUSINESS_LAYOUTS.rolesInline,
        list: ["people"],
        iconSegments: [],
      },
      people: { layout: PERSON_LAYOUTS.addressRight },
      addresses: {
        list: ["businesses", "people"],
        enabled: ["business", "person"],
      },
    },
  },
  {
    name: "Slate",
    look: {
      backgroundColor: "#f8fafc",
      titleColor: "#0f172a",
      subtitleColor: "#475569",
      pillBackgroundColor: "#e2e8f0",
      pillForegroundColor: "#1e293b",
      primaryPillBorderColor: "#64748b",
      secondaryPillBackgroundColor: "#f1f5f9",
      structurePillBackgroundColor: "#e2e8f0",
      structurePillForegroundColor: "#334155",
    },
    vars: {
      "--bl-ac-highlight-bg": "#eef2f7",
      "--bl-ac-border": "#cbd5e1",
      "--bl-ac-more-fg": "#1e293b",
      "--bl-ac-ink-base": "#52525b",
      "--bl-ac-ink-mark": "#1d4ed8",
      "--bl-ac-also-mark": "#0f172a",
      "--bl-ac-underline": "#2563eb",
      "--bl-ac-marker": "#dbeafe",
      "--bl-ac-radius": "0",
      "--bl-ac-pill-radius": "0",
      "--bl-ac-shadow": "none",
      "--bl-ac-line-height": "1.4",
      "--bl-ac-name-weight": "700",
      "--bl-ac-font": SYSTEM_UI,
    },
    highlight: { matchEmphasis: "ink", matchEmphasisRegion: "substring" },
    rows: {
      businesses: { layout: BUSINESS_LAYOUTS.compact, iconSegments: [] },
      people: { layout: PERSON_LAYOUTS.noCounts, list: [], iconSegments: [] },
      addresses: {
        layout: ADDRESS_LAYOUTS.noCounts,
        list: [],
        iconSegments: [],
      },
    },
  },
  {
    name: "Graphite",
    look: {
      backgroundColor: "#1c1d21",
      titleColor: "#f2f3f5",
      subtitleColor: "#a3a8b3",
      pillBackgroundColor: "#2c2f36",
      pillForegroundColor: "#d6d9e0",
      primaryPillBorderColor: "#8a919e",
      secondaryPillBackgroundColor: "#25272d",
      structurePillBackgroundColor: "#2a2c31",
      structurePillForegroundColor: "#c3c7cf",
    },
    vars: {
      "--bl-ac-highlight-bg": "#26282e",
      "--bl-ac-border": "#33363d",
      "--bl-ac-more-fg": "#d6d9e0",
      "--bl-ac-ink-base": "#a3a8b3",
      "--bl-ac-ink-mark": "#f59e0b",
      "--bl-ac-also-mark": "#f2f3f5",
      "--bl-ac-underline": "#f59e0b",
      "--bl-ac-marker": "#4a3a12",
      "--bl-ac-radius": "4px",
      "--bl-ac-pill-radius": "2px",
      "--bl-ac-shadow": "0 18px 48px rgba(0, 0, 0, 0.55)",
      "--bl-ac-font": MONO,
      "--bl-ac-name-weight": "500",
    },
    highlight: { matchEmphasis: "ink", matchEmphasisRegion: "token" },
    rows: {
      businesses: {
        layout: BUSINESS_LAYOUTS.countsRight,
        list: ["people", "addresses"],
        iconSegments: [],
      },
      people: {
        layout: PERSON_LAYOUTS.addressRight,
        list: ["businesses", "addresses"],
        iconSegments: [],
      },
      addresses: { layout: ADDRESS_LAYOUTS.noStates, iconSegments: [] },
    },
  },
  {
    name: "Forest",
    look: {
      backgroundColor: "#f6faf6",
      titleColor: "#14301c",
      subtitleColor: "#4b6352",
      pillBackgroundColor: "#d9ecd9",
      pillForegroundColor: "#1d4d2b",
      primaryPillBorderColor: "#3f8f55",
      secondaryPillBackgroundColor: "#edf5ee",
      structurePillBackgroundColor: "#e3ece4",
      structurePillForegroundColor: "#2e4734",
    },
    vars: {
      "--bl-ac-highlight-bg": "#e8f2ea",
      "--bl-ac-border": "#cfe1d3",
      "--bl-ac-more-fg": "#1d4d2b",
      "--bl-ac-ink-base": "#4b6352",
      "--bl-ac-ink-mark": "#1f6e37",
      "--bl-ac-also-mark": "#14301c",
      "--bl-ac-underline": "#2f9a50",
      "--bl-ac-marker": "#c9ebd2",
      "--bl-ac-radius": "6px",
      "--bl-ac-pill-radius": "999px",
      "--bl-ac-shadow": "0 6px 16px rgba(20, 48, 28, 0.1)",
    },
    highlight: { matchEmphasis: "background", matchEmphasisRegion: "token" },
    rows: {
      businesses: {
        layout: BUSINESS_LAYOUTS.addressRight,
        iconSegments: ["name"],
      },
      addresses: {
        list: ["businesses", "people"],
        enabled: ["business", "person"],
      },
    },
  },
  {
    name: "Ocean",
    look: {
      backgroundColor: "#0b1f2a",
      titleColor: "#e6f4f8",
      subtitleColor: "#8fb3c0",
      pillBackgroundColor: "#12384a",
      pillForegroundColor: "#9fe0f2",
      primaryPillBorderColor: "#22a7c9",
      secondaryPillBackgroundColor: "#102c39",
      structurePillBackgroundColor: "#133140",
      structurePillForegroundColor: "#b5d3dc",
    },
    vars: {
      "--bl-ac-highlight-bg": "#10303f",
      "--bl-ac-border": "#184255",
      "--bl-ac-more-fg": "#cde9f1",
      "--bl-ac-ink-base": "#8fb3c0",
      "--bl-ac-ink-mark": "#5eead4",
      "--bl-ac-also-mark": "#e6f4f8",
      "--bl-ac-underline": "#22d3ee",
      "--bl-ac-marker": "#134e4a",
      "--bl-ac-radius": "12px",
      "--bl-ac-pill-radius": "999px",
      "--bl-ac-shadow": "0 14px 36px rgba(0, 0, 0, 0.5)",
    },
    highlight: { matchEmphasis: "background", matchEmphasisRegion: "token" },
    rows: {
      businesses: {
        list: ["people", "addresses"],
        iconSegments: ["name", "address", "personName", "addressName"],
      },
      people: { layout: PERSON_LAYOUTS.countsBeside, iconSegments: ["name"] },
      addresses: {
        layout: ADDRESS_LAYOUTS.personRoleInline,
        list: ["businesses", "people"],
        iconSegments: ["name"],
      },
    },
  },
  {
    name: "Sand",
    look: {
      backgroundColor: "#fdf8f0",
      titleColor: "#3a2a17",
      subtitleColor: "#6f5a40",
      pillBackgroundColor: "#f1e2c8",
      pillForegroundColor: "#6b4a1e",
      primaryPillBorderColor: "#b9873f",
      secondaryPillBackgroundColor: "#f6ecdb",
      structurePillBackgroundColor: "#eee5d6",
      structurePillForegroundColor: "#5a4a37",
    },
    vars: {
      "--bl-ac-highlight-bg": "#f5ead6",
      "--bl-ac-border": "#e6d6bb",
      "--bl-ac-more-fg": "#6b4a1e",
      "--bl-ac-ink-base": "#6f5a40",
      "--bl-ac-ink-mark": "#94540f",
      "--bl-ac-also-mark": "#3a2a17",
      "--bl-ac-underline": "#c27a24",
      "--bl-ac-marker": "#f6d9a8",
      "--bl-ac-radius": "2px",
      "--bl-ac-pill-radius": "2px",
      "--bl-ac-shadow": "none",
      "--bl-ac-line-height": "1.6",
      "--bl-ac-font": MONO,
      "--bl-ac-name-weight": "500",
    },
    highlight: {
      matchEmphasis: "underline",
      matchEmphasisRegion: "substring",
      matchEmphasisColor: "#94540f",
    },
    rows: {
      businesses: {
        layout: BUSINESS_LAYOUTS.statesBelow,
        list: ["addresses"],
        iconSegments: ["addressName"],
      },
      people: { layout: PERSON_LAYOUTS.noStates },
      addresses: { iconSegments: [] },
    },
  },
  {
    name: "Plum",
    look: {
      backgroundColor: "#1e1325",
      titleColor: "#f5ecf8",
      subtitleColor: "#b9a3c4",
      pillBackgroundColor: "#3a2346",
      pillForegroundColor: "#e3c5f0",
      primaryPillBorderColor: "#b46cd6",
      secondaryPillBackgroundColor: "#2a1a33",
      structurePillBackgroundColor: "#2f2138",
      structurePillForegroundColor: "#d4c2dc",
    },
    vars: {
      "--bl-ac-highlight-bg": "#2b1b34",
      "--bl-ac-border": "#3d2a48",
      "--bl-ac-more-fg": "#e3c5f0",
      "--bl-ac-ink-base": "#b9a3c4",
      "--bl-ac-ink-mark": "#e879f9",
      "--bl-ac-also-mark": "#f5ecf8",
      "--bl-ac-underline": "#c084fc",
      "--bl-ac-marker": "#4c1d63",
      "--bl-ac-radius": "16px",
      "--bl-ac-pill-radius": "999px",
      "--bl-ac-shadow": "0 16px 40px rgba(0, 0, 0, 0.5)",
      "--bl-ac-line-height": "1.55",
      "--bl-ac-font": SERIF,
    },
    highlight: {
      matchEmphasis: "underline",
      matchEmphasisRegion: "substring",
      matchEmphasisColor: "#f0abfc",
    },
    rows: {
      businesses: {
        layout: BUSINESS_LAYOUTS.rolesInline,
        list: ["addresses", "people"],
        iconSegments: ["name"],
      },
      people: {
        list: ["addresses", "businesses"],
        enabled: ["business", "address"],
      },
      addresses: {
        layout: ADDRESS_LAYOUTS.noAddress,
        list: ["people", "businesses"],
      },
    },
  },
  {
    name: "Mint",
    look: {
      backgroundColor: "#f3fbf8",
      titleColor: "#082e25",
      subtitleColor: "#3d6b60",
      pillBackgroundColor: "#c8efe2",
      pillForegroundColor: "#0b5543",
      primaryPillBorderColor: "#19a07c",
      secondaryPillBackgroundColor: "#e6f6f0",
      structurePillBackgroundColor: "#dcefe8",
      structurePillForegroundColor: "#24524a",
    },
    vars: {
      "--bl-ac-highlight-bg": "#e2f4ed",
      "--bl-ac-border": "#c4e6da",
      "--bl-ac-more-fg": "#0b5543",
      "--bl-ac-ink-base": "#3d6b60",
      "--bl-ac-ink-mark": "#0d6e56",
      "--bl-ac-also-mark": "#0b3b30",
      "--bl-ac-underline": "#19a07c",
      "--bl-ac-marker": "#b8eedc",
      "--bl-ac-radius": "14px",
      "--bl-ac-pill-radius": "999px",
      "--bl-ac-shadow": "0 18px 40px rgba(8, 46, 37, 0.18)",
    },
    highlight: { matchEmphasis: "underline", matchEmphasisRegion: "token" },
    rows: {
      businesses: { layout: BUSINESS_LAYOUTS.statesBeside, iconSegments: [] },
      people: {
        layout: PERSON_LAYOUTS.addressRoleInline,
        list: ["businesses", "addresses"],
        enabled: ["business", "person"],
      },
      addresses: { layout: ADDRESS_LAYOUTS.noCounts, iconSegments: ["name"] },
    },
  },
  {
    name: "Ember",
    look: {
      backgroundColor: "#1f1410",
      titleColor: "#fbeee6",
      subtitleColor: "#c4a596",
      pillBackgroundColor: "#3d2219",
      pillForegroundColor: "#ffc9a8",
      primaryPillBorderColor: "#f97316",
      secondaryPillBackgroundColor: "#2a1a14",
      structurePillBackgroundColor: "#33231d",
      structurePillForegroundColor: "#d9c2b6",
    },
    vars: {
      "--bl-ac-highlight-bg": "#2c1b15",
      "--bl-ac-border": "#44291f",
      "--bl-ac-more-fg": "#ffd9c2",
      "--bl-ac-ink-base": "#c4a596",
      "--bl-ac-ink-mark": "#fb923c",
      "--bl-ac-also-mark": "#fbeee6",
      "--bl-ac-underline": "#f97316",
      "--bl-ac-marker": "#5a2a14",
      "--bl-ac-radius": "6px",
      "--bl-ac-pill-radius": "4px",
      "--bl-ac-shadow": "0 12px 32px rgba(0, 0, 0, 0.5)",
      "--bl-ac-name-weight": "700",
      "--bl-ac-weight-base": "500",
      "--bl-ac-weight-mark": "800",
    },
    highlight: {
      matchEmphasis: "weight",
      matchEmphasisRegion: "substring",
      matchEmphasisColor: "#fb923c",
    },
    rows: {
      businesses: {
        layout: BUSINESS_LAYOUTS.addressRight,
        list: ["people"],
        iconSegments: ["name", "personName"],
      },
      people: { layout: PERSON_LAYOUTS.noCounts, iconSegments: ["name"] },
      addresses: { layout: ADDRESS_LAYOUTS.countsBeside, list: ["people"] },
    },
  },
  {
    name: "Paper",
    look: {
      backgroundColor: "#ffffff",
      titleColor: "#111111",
      subtitleColor: "#555555",
      pillBackgroundColor: "#f2f2f2",
      pillForegroundColor: "#222222",
      primaryPillBorderColor: "#888888",
      secondaryPillBackgroundColor: "#f7f7f7",
      structurePillBackgroundColor: "#eeeeee",
      structurePillForegroundColor: "#333333",
    },
    vars: {
      "--bl-ac-highlight-bg": "#f4f4f4",
      "--bl-ac-border": "#e0e0e0",
      "--bl-ac-more-fg": "#222222",
      "--bl-ac-ink-base": "#555555",
      "--bl-ac-ink-mark": "#b42318",
      "--bl-ac-also-mark": "#111111",
      "--bl-ac-underline": "#111111",
      "--bl-ac-marker": "#fff3a3",
      "--bl-ac-radius": "0",
      "--bl-ac-pill-radius": "0",
      "--bl-ac-shadow": "none",
      "--bl-ac-name-weight": "700",
      "--bl-ac-weight-base": "400",
      "--bl-ac-weight-mark": "700",
      "--bl-ac-font": SERIF,
    },
    highlight: {
      matchEmphasis: "background",
      matchEmphasisRegion: "substring",
      matchEmphasisColor: "#fff3a3",
    },
    rows: {
      businesses: { layout: BUSINESS_LAYOUTS.compact, iconSegments: [] },
      people: {
        layout: PERSON_LAYOUTS.countsBeside,
        list: [],
        iconSegments: [],
      },
      addresses: {
        layout: ADDRESS_LAYOUTS.countsBeside,
        list: [],
        iconSegments: [],
      },
    },
  },
  {
    name: "Dusk",
    look: {
      backgroundColor: "#171a2e",
      titleColor: "#eceefe",
      subtitleColor: "#a3a7c7",
      pillBackgroundColor: "#2a2f55",
      pillForegroundColor: "#c7ccff",
      primaryPillBorderColor: "#7c83f2",
      secondaryPillBackgroundColor: "#1f2340",
      structurePillBackgroundColor: "#242842",
      structurePillForegroundColor: "#c2c5de",
    },
    vars: {
      "--bl-ac-highlight-bg": "#20243f",
      "--bl-ac-border": "#2d3256",
      "--bl-ac-more-fg": "#d2d5ff",
      "--bl-ac-ink-base": "#a3a7c7",
      "--bl-ac-ink-mark": "#fbbf24",
      "--bl-ac-also-mark": "#eceefe",
      "--bl-ac-underline": "#fbbf24",
      "--bl-ac-marker": "#4b3a10",
      "--bl-ac-radius": "0",
      "--bl-ac-pill-radius": "0",
      "--bl-ac-shadow": "none",
      "--bl-ac-line-height": "1.7",
    },
    highlight: { matchEmphasis: "underline", matchEmphasisRegion: "token" },
    rows: {
      businesses: { layout: BUSINESS_LAYOUTS.statesBelow, iconSegments: [] },
      people: { layout: PERSON_LAYOUTS.noStates, list: [], iconSegments: [] },
      addresses: {
        layout: ADDRESS_LAYOUTS.noStates,
        list: [],
        iconSegments: [],
      },
    },
  },
  {
    name: "Frost",
    look: {
      backgroundColor: "#f5f9ff",
      titleColor: "#10233f",
      subtitleColor: "#4a5d7a",
      pillBackgroundColor: "#dbe8fb",
      pillForegroundColor: "#173d74",
      primaryPillBorderColor: "#3b82f6",
      secondaryPillBackgroundColor: "#eaf2fd",
      structurePillBackgroundColor: "#e4ebf5",
      structurePillForegroundColor: "#2c4060",
    },
    vars: {
      "--bl-ac-highlight-bg": "#e7f0fc",
      "--bl-ac-border": "#d3e1f5",
      "--bl-ac-more-fg": "#173d74",
      "--bl-ac-ink-base": "#5c5f66",
      "--bl-ac-ink-mark": "#1d4ed8",
      "--bl-ac-also-mark": "#10233f",
      "--bl-ac-underline": "#3b82f6",
      "--bl-ac-marker": "#dbeafe",
      "--bl-ac-radius": "10px",
      "--bl-ac-pill-radius": "6px",
      "--bl-ac-shadow": "0 8px 24px rgba(16, 35, 63, 0.12)",
      "--bl-ac-line-height": "1.45",
    },
    highlight: { matchEmphasis: "ink", matchEmphasisRegion: "substring" },
    rows: {
      businesses: {
        layout: BUSINESS_LAYOUTS.statesBeside,
        list: ["people"],
        iconSegments: ["name"],
      },
      people: { layout: PERSON_LAYOUTS.addressRight },
    },
  },
  {
    name: "Moss",
    look: {
      backgroundColor: "#141c14",
      titleColor: "#ecf3e8",
      subtitleColor: "#a1b39a",
      pillBackgroundColor: "#24341f",
      pillForegroundColor: "#c5e3b3",
      primaryPillBorderColor: "#6fae4f",
      secondaryPillBackgroundColor: "#1b261a",
      structurePillBackgroundColor: "#222c20",
      structurePillForegroundColor: "#c2cfbd",
    },
    vars: {
      "--bl-ac-highlight-bg": "#1d281c",
      "--bl-ac-border": "#2a3828",
      "--bl-ac-more-fg": "#d0e8c2",
      "--bl-ac-ink-base": "#a1b39a",
      "--bl-ac-ink-mark": "#a3e635",
      "--bl-ac-also-mark": "#ecf3e8",
      "--bl-ac-underline": "#84cc16",
      "--bl-ac-marker": "#3a4d16",
      "--bl-ac-radius": "2px",
      "--bl-ac-pill-radius": "2px",
      "--bl-ac-shadow": "none",
    },
    highlight: {
      matchEmphasis: "background",
      matchEmphasisRegion: "substring",
    },
    rows: {
      businesses: {
        layout: BUSINESS_LAYOUTS.countsBeside,
        list: ["people"],
        iconSegments: ["name"],
      },
      people: { list: ["businesses", "addresses"] },
      addresses: { layout: ADDRESS_LAYOUTS.personRoleInline },
    },
  },
  {
    name: "Clay",
    look: {
      backgroundColor: "#fbf5f1",
      titleColor: "#3b1f14",
      subtitleColor: "#7d5848",
      pillBackgroundColor: "#f3ddd2",
      pillForegroundColor: "#7a2e12",
      primaryPillBorderColor: "#c2410c",
      secondaryPillBackgroundColor: "#f7e9e1",
      structurePillBackgroundColor: "#efe3dc",
      structurePillForegroundColor: "#5c4033",
    },
    vars: {
      "--bl-ac-highlight-bg": "#f5e6dd",
      "--bl-ac-border": "#ead3c6",
      "--bl-ac-more-fg": "#7a2e12",
      "--bl-ac-ink-base": "#6b625d",
      "--bl-ac-ink-mark": "#a63a0e",
      "--bl-ac-also-mark": "#3b1f14",
      "--bl-ac-underline": "#ea580c",
      "--bl-ac-marker": "#fed7aa",
      "--bl-ac-radius": "8px",
      "--bl-ac-pill-radius": "999px",
    },
    highlight: { matchEmphasis: "ink", matchEmphasisRegion: "token" },
    rows: {
      businesses: {
        layout: {
          ...BUSINESS_LAYOUTS.addressRight,
          ...BUSINESS_LAYOUTS.countsBeside,
        },
        list: ["addresses"],
        iconSegments: [],
      },
      people: {
        layout: PERSON_LAYOUTS.addressRoleInline,
        list: ["businesses", "addresses"],
      },
      addresses: { list: ["people", "businesses"] },
    },
  },
  {
    name: "Citrus",
    look: {
      backgroundColor: "#fffdf2",
      titleColor: "#2b2a12",
      subtitleColor: "#5f5d2b",
      pillBackgroundColor: "#fbf3b4",
      pillForegroundColor: "#574d00",
      primaryPillBorderColor: "#c9a400",
      secondaryPillBackgroundColor: "#fdf9d9",
      structurePillBackgroundColor: "#f1efd9",
      structurePillForegroundColor: "#4d4b2a",
    },
    vars: {
      "--bl-ac-highlight-bg": "#fbf6d4",
      "--bl-ac-border": "#ede6b5",
      "--bl-ac-more-fg": "#574d00",
      "--bl-ac-ink-base": "#5f5d2b",
      "--bl-ac-ink-mark": "#975500",
      "--bl-ac-also-mark": "#2b2a12",
      "--bl-ac-underline": "#a87b00",
      "--bl-ac-marker": "#fde68a",
      "--bl-ac-radius": "18px",
      "--bl-ac-pill-radius": "999px",
      "--bl-ac-shadow": "0 10px 28px rgba(87, 77, 0, 0.14)",
      "--bl-ac-name-weight": "800",
      "--bl-ac-weight-mark": "800",
    },
    highlight: {
      matchEmphasis: "weight",
      matchEmphasisRegion: "token",
      matchEmphasisColor: "#975500",
    },
    rows: {
      businesses: {
        layout: BUSINESS_LAYOUTS.compact,
        list: ["people"],
        iconSegments: ["name"],
      },
      people: { layout: PERSON_LAYOUTS.countsBeside, list: ["addresses"] },
      addresses: {
        layout: ADDRESS_LAYOUTS.noCounts,
        list: ["businesses", "people"],
      },
    },
  },
];

/** A search's row as a preset lays it out, the defaults where it says nothing. */
function presetRow<R extends Route>(
  state: StyleState,
  preset: Preset,
  route: R,
): RowStates[R] {
  const row: PresetRow<R> = preset.rows?.[route] ?? {};
  const base: RowStates[R] = DEFAULT_STYLE.rows[route];
  const kind = ROW_KINDS[route] as RowKind<string, string>;
  return {
    ...state.rows[route],
    layout: resolveLayout(
      kind,
      (row.layout ?? {}) as Readonly<Record<string, string | null>>,
    ) as RowStates[R]["layout"],
    list: [...(row.list ?? base.list)],
    enabled: [...(row.enabled ?? base.enabled)],
    iconSegments: [...(row.iconSegments ?? base.iconSegments)],
  };
}

/**
 * The state with all a preset sets: its colors and corners, its highlight, and
 * each search's lines; everything else kept.
 */
export function applyPreset(state: StyleState, preset: Preset): StyleState {
  const look = { ...state.look };
  for (const { key } of LOOK_COLORS) {
    look[key] = preset.look[key] ?? DEFAULT_STYLE.look[key];
  }
  for (const key of HIGHLIGHT_KEYS) {
    (look as Record<keyof Highlight, unknown>)[key] =
      preset.highlight?.[key] ?? DEFAULT_STYLE.look[key];
  }
  const vars = { ...state.vars };
  for (const name of PRESET_VARS) {
    vars[name] = preset.vars[name] ?? CSS_VARIABLES[name].value;
  }
  const rows: RowStates = {
    businesses: presetRow(state, preset, "businesses"),
    people: presetRow(state, preset, "people"),
    addresses: presetRow(state, preset, "addresses"),
  };
  return { ...state, look, vars, rows, preset: preset.name };
}

function lastPreset(state: StyleState): Preset | undefined {
  return PRESETS.find(preset => preset.name === state.preset);
}

/** A `look` color as the preset last applied set it. */
export function presetColor(state: StyleState, key: LookColor): string {
  return lastPreset(state)?.look[key] ?? DEFAULT_STYLE.look[key];
}

/** A CSS variable as the preset last applied set it. */
export function presetVar(state: StyleState, name: CssVariable): string {
  const owned = PRESET_VARS.includes(name);
  return (
    (owned ? lastPreset(state)?.vars[name] : undefined) ??
    CSS_VARIABLES[name].value
  );
}

/** How many colors, and shapes and sizes, differ from the preset last applied. */
type VariableKind = (typeof CSS_VARIABLES)[CssVariable]["kind"];
/** The variables the Shape and size fold holds, and the ones the Font fold does. */
export const SHAPE_KINDS: ReadonlySet<VariableKind> = new Set([
  "length",
  "number",
  "text",
]);
export const FONT_KINDS: ReadonlySet<VariableKind> = new Set([
  "font",
  "weight",
]);

export function presetChanges(state: StyleState): {
  colors: number;
  shape: number;
  font: number;
} {
  const differs = (a: string, b: string) =>
    a.trim().toLowerCase() !== b.trim().toLowerCase();
  const vars = (Object.keys(CSS_VARIABLES) as CssVariable[]).filter(name =>
    differs(state.vars[name], presetVar(state, name)),
  );
  return {
    colors:
      LOOK_COLORS.filter(({ key }) =>
        differs(state.look[key], presetColor(state, key)),
      ).length +
      vars.filter(name => CSS_VARIABLES[name].kind === "color").length,
    shape: vars.filter(name => SHAPE_KINDS.has(CSS_VARIABLES[name].kind))
      .length,
    font: vars.filter(name => FONT_KINDS.has(CSS_VARIABLES[name].kind)).length,
  };
}

/** The preset the state is in, or null once anything it owns was changed. */
export function activePreset(state: StyleState): Preset | null {
  const same = (a: string | null, b: string | null) =>
    (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
  // The Enabled boxes and the icons are sets; the lines are listed in order.
  const sameSet = (a: readonly string[], b: readonly string[]) =>
    [...a].sort().join() === [...b].sort().join();
  const sameRows = (applied: RowStates) =>
    (Object.keys(applied) as Route[]).every(route => {
      const [now, then] = [state.rows[route], applied[route]];
      const nowLayout: Readonly<Record<string, unknown>> = now.layout;
      const thenLayout: Readonly<Record<string, unknown>> = then.layout;
      return (
        ROW_KINDS[route].places.every(
          place => nowLayout[place] === thenLayout[place],
        ) &&
        now.list.join() === then.list.join() &&
        sameSet(now.enabled, then.enabled) &&
        sameSet(now.iconSegments, then.iconSegments)
      );
    });
  return (
    PRESETS.find(preset => {
      const applied = applyPreset(state, preset);
      return (
        LOOK_COLORS.every(({ key }) =>
          same(state.look[key], applied.look[key]),
        ) &&
        HIGHLIGHT_KEYS.every(key => same(state.look[key], applied.look[key])) &&
        PRESET_VARS.every(name => same(state.vars[name], applied.vars[name])) &&
        sameRows(applied.rows)
      );
    }) ?? null
  );
}

const [LIGHT] = PRESETS;

/** Where the demo opens, and what its Reset goes back to: Light. */
export const INITIAL_STYLE: StyleState =
  LIGHT === undefined ? DEFAULT_STYLE : applyPreset(DEFAULT_STYLE, LIGHT);
