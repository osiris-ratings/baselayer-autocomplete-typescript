// Everything the styled component lets a host change, as one piece of state:
// the `look` knobs, the CSS variables that are not knobs, the row's layout,
// the behavior props, the text, and the markup switches. Defaults are the
// SDK's own, imported rather than copied, except the stylesheet's variables,
// which the stylesheet declares.

import {
  ADDRESS_ROW,
  BUSINESS_STRUCTURES,
  DEFAULT_LIST,
  DEFAULT_LOOK,
  DEFAULT_PICKABLE,
  DEFAULT_ROW_LAYOUT,
  PERSON_ROW,
  ROW_FIELDS,
  ROW_LINES,
  ROW_PLACES,
  drawnLayout,
  resolveLayout,
  structureLabel,
  type AddressRowField,
  type AddressRowLayout,
  type AddressRowPlace,
  type EntityType,
  type IncludeOf,
  type LayoutOf,
  type Look,
  type MatchEmphasis,
  type MatchRegion,
  type PersonRowField,
  type PersonRowLayout,
  type PersonRowPlace,
  type Route,
  type RowField,
  type RowKind,
  type RowLayout,
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

export interface StyleState {
  look: Look;
  /** The field each place of a row shows (`layout`). */
  layout: RowLayout;
  /** The same for a person's row, and what it lists and can pick. */
  personLayout: PersonRowLayout;
  personInclude: IncludeOf<"people">[];
  personPickable: EntityType[];
  /** The same for an address's row. */
  addressLayout: AddressRowLayout;
  addressInclude: IncludeOf<"addresses">[];
  addressPickable: EntityType[];
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
  layout: { ...DEFAULT_ROW_LAYOUT },
  personLayout: resolveLayout(PERSON_ROW),
  personInclude: [...DEFAULT_LIST.people] as IncludeOf<"people">[],
  personPickable: [...DEFAULT_PICKABLE],
  addressLayout: resolveLayout(ADDRESS_ROW),
  addressInclude: [...DEFAULT_LIST.addresses] as IncludeOf<"addresses">[],
  addressPickable: [...DEFAULT_PICKABLE],
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
};

export type DropSpot = RowPlace | typeof TRAY;
export type PlaceChoice = RowField | typeof EMPTY_PLACE;

export const CHOICE_LABELS: Record<PlaceChoice, string> = {
  [EMPTY_PLACE]: "Empty",
  states: "States",
  structure: "Structure",
  address: "Address",
  people: "People",
};

/** A business's row. */
export const BUSINESS_EDITOR: RowEditor<RowPlace, RowField> = {
  kind: {
    places: ROW_PLACES,
    fields: ROW_FIELDS,
    lines: ROW_LINES,
    defaults: DEFAULT_ROW_LAYOUT,
  },
  placeLabels: PLACE_LABELS,
  fieldLabels: CHOICE_LABELS,
  fieldWire: FIELD_WIRE,
  lineNames: { title: { long: "Business name", short: "Name" } },
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
    headLead: "Before the name",
    headBadge: "Beside the name",
    headTrailingBadge: "Beside head, right",
    headTrailing: "Head, right",
    businessLead: "Before business",
    businessBadge: "Beside business",
    businessTrailingBadge: "Beside business, right",
    businessTrailing: "Business, right",
    addressLead: "Before address",
    addressBadge: "Beside address",
    addressTrailingBadge: "Beside address, right",
    addressTrailing: "Address, right",
  },
  fieldLabels: {
    headIcon: "Icon",
    businessIcon: "Icon",
    addressIcon: "Icon",
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
    headIcon: ["type"],
    businessIcon: ["related.businesses.items[].type"],
    addressIcon: ["related.addresses.items[].type"],
  },
  lineNames: {
    head: { long: "Person's name", short: "Name" },
    business: { long: "Business name", short: "Business" },
    address: { long: "Their address", short: "Address" },
  },
};

/** An address's row. */
export const ADDRESS_EDITOR: RowEditor<AddressRowPlace, AddressRowField> = {
  kind: ADDRESS_ROW,
  placeLabels: {
    headLead: "Before the address",
    headBadge: "Beside the address",
    headTrailingBadge: "Beside head, right",
    headTrailing: "Head, right",
    businessLead: "Before business",
    businessBadge: "Beside business",
    businessTrailingBadge: "Beside business, right",
    businessTrailing: "Business, right",
    personLead: "Before person",
    personBadge: "Beside person",
    personTrailingBadge: "Beside person, right",
    personTrailing: "Person, right",
  },
  fieldLabels: {
    headIcon: "Icon",
    businessIcon: "Icon",
    personIcon: "Icon",
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
    headIcon: ["type"],
    businessIcon: ["related.businesses.items[].type"],
    personIcon: ["related.people.items[].type"],
  },
  lineNames: {
    head: { long: "Address", short: "Address" },
    business: { long: "Business name", short: "Business" },
    person: { long: "Person's name", short: "Person" },
  },
};

export const { canDrop, moveField, placeOptions, unplacedFields, withPlaced } =
  editorOps(BUSINESS_EDITOR);

/** The places that show another field than the SDK's default, in reading order. */
export function changedLayout(state: StyleState): Partial<RowLayout> {
  return Object.fromEntries(
    ROW_PLACES.filter(
      place => state.layout[place] !== DEFAULT_ROW_LAYOUT[place],
    ).map(place => [place, state.layout[place]]),
  );
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

/** The places of a person's or an address's row that differ from the SDK's default. */
export function changedGroupedLayout(
  state: StyleState,
  route: "people" | "addresses",
): [string, string | null][] {
  const layout: Readonly<Record<string, string | null>> =
    route === "people" ? state.personLayout : state.addressLayout;
  const defaults: Readonly<Record<string, string | null>> =
    route === "people" ? resolveLayout(PERSON_ROW) : resolveLayout(ADDRESS_ROW);
  return Object.keys(defaults)
    .filter(place => layout[place] !== defaults[place])
    .map(place => [place, layout[place] ?? null]);
}

/**
 * How many things the Components fold changed, on every search's row: the
 * places, and what a person's and an address's rows list and can pick.
 */
export function componentChanges(state: StyleState): number {
  const lists: [readonly string[], readonly string[]][] = [
    [state.personInclude, DEFAULT_LIST.people],
    [state.personPickable, DEFAULT_PICKABLE],
    [state.addressInclude, DEFAULT_LIST.addresses],
    [state.addressPickable, DEFAULT_PICKABLE],
  ];
  return (
    Object.keys(changedLayout(state)).length +
    changedGroupedLayout(state, "people").length +
    changedGroupedLayout(state, "addresses").length +
    lists.filter(([value, defaults]) => value.join() !== defaults.join()).length
  );
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
  const layout =
    route === "businesses"
      ? Object.entries(changedLayout(state))
      : changedGroupedLayout(state, route);
  if (layout.length > 0) {
    props.push(
      `layout={{\n${layout.map(([place, field]) => `    ${place}: ${field === null ? "null" : JSON.stringify(field)},`).join("\n")}\n  }}`,
    );
  }
  if (route !== "businesses") {
    const [include, pickable] =
      route === "people"
        ? [state.personInclude, state.personPickable]
        : [state.addressInclude, state.addressPickable];
    props.push(
      ...listProp("include", include, DEFAULT_LIST[route]),
      ...listProp("pickable", pickable, DEFAULT_PICKABLE),
    );
    if (pickable.some(type => type !== "business")) {
      props.push("onPickEntity={pick => …}");
    }
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

/** A color theme: the colors, corners and shadow, over the defaults. */
export interface Preset {
  name: string;
  look: Partial<Pick<Look, LookColor>>;
  vars: Partial<Record<CssVariable, string>>;
}

/** What a preset owns; sizes, behavior and text stay the reader's. */
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
];

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
      "--bl-ac-radius": "4px",
      "--bl-ac-shadow": "0 12px 32px rgba(0, 0, 0, 0.5)",
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
  },
];

/** The state with a preset's colors and corners, everything else kept. */
export function applyPreset(state: StyleState, preset: Preset): StyleState {
  const look = { ...state.look };
  for (const { key } of LOOK_COLORS) {
    look[key] = preset.look[key] ?? DEFAULT_STYLE.look[key];
  }
  const vars = { ...state.vars };
  for (const name of PRESET_VARS) {
    vars[name] = preset.vars[name] ?? CSS_VARIABLES[name].value;
  }
  return { ...state, look, vars, preset: preset.name };
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
  const same = (a: string, b: string) =>
    a.trim().toLowerCase() === b.trim().toLowerCase();
  return (
    PRESETS.find(preset => {
      const applied = applyPreset(state, preset);
      return (
        LOOK_COLORS.every(({ key }) =>
          same(state.look[key], applied.look[key]),
        ) &&
        PRESET_VARS.every(name => same(state.vars[name], applied.vars[name]))
      );
    }) ?? null
  );
}

const [LIGHT] = PRESETS;

/** Where the demo opens, and what its Reset goes back to: Light. */
export const INITIAL_STYLE: StyleState =
  LIGHT === undefined ? DEFAULT_STYLE : applyPreset(DEFAULT_STYLE, LIGHT);
