// Everything the styled component lets a host change, as one piece of state:
// the `look` knobs, the CSS variables that are not knobs, the row's layout,
// the behavior props, the text, and the markup switches. Defaults are the
// SDK's own, imported rather than copied, except the stylesheet's variables,
// which the stylesheet declares.

import {
  BUSINESS_STRUCTURES,
  DEFAULT_LOOK,
  DEFAULT_ROW_LAYOUT,
  ROW_FIELDS,
  ROW_PLACES,
  drawnRowLayout,
  structureLabel,
  type Look,
  type MatchEmphasis,
  type MatchRegion,
  type RowField,
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

/** A structure the tier knows, which the Text fold lists. */
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

/** The structure flags relabeled, in the tier's order. */
export function changedStructures(state: StyleState): [Structure, string][] {
  return BUSINESS_STRUCTURES.filter(
    structure => state.structures[structure] !== STRUCTURE_FLAGS[structure],
  ).map(structure => [structure, state.structures[structure]]);
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

/** Where a dragged field can land besides a place: out of the row. */
export const TRAY = "tray";
export type DropSpot = RowPlace | typeof TRAY;

/**
 * Whether a field can be dropped on a spot: on a place other than its own
 * where the row would draw it, and on the tray when the row shows it. A
 * badge beside nothing, the badge beside the field itself included, or the
 * second line's right with no lead, is drawn elsewhere, so it takes nothing.
 */
export function canDrop(
  layout: RowLayout,
  field: RowField,
  to: DropSpot,
): boolean {
  const from = ROW_PLACES.find(place => layout[place] === field);
  if (to === TRAY) return from !== undefined;
  return to !== from && moveField(layout, field, to)[to] === field;
}

/** The fields the layout places nowhere, in their own order. */
export function unplacedFields(layout: RowLayout): RowField[] {
  const placed = new Set(ROW_PLACES.map(place => layout[place]));
  return ROW_FIELDS.filter(field => !placed.has(field));
}

/**
 * The layout with a field dropped somewhere, as the row draws it. On a place,
 * the field takes it and whatever the place held goes where the field came
 * from (a swap, or out of the row when the field came from the tray); on the
 * tray, the field leaves the row.
 */
export function moveField(
  layout: RowLayout,
  field: RowField,
  to: DropSpot,
): RowLayout {
  const from = ROW_PLACES.find(place => layout[place] === field);
  const next = { ...layout };
  if (to === TRAY) {
    if (from !== undefined) next[from] = null;
    return drawnRowLayout(next);
  }
  const displaced = next[to];
  if (from !== undefined) next[from] = displaced;
  next[to] = field;
  return drawnRowLayout(next);
}

/** The choice that leaves a place empty. */
export const EMPTY_PLACE = "empty";
export type PlaceChoice = RowField | typeof EMPTY_PLACE;

const CHOICES: readonly PlaceChoice[] = [EMPTY_PLACE, ...ROW_FIELDS];

export const CHOICE_LABELS: Record<PlaceChoice, string> = {
  [EMPTY_PLACE]: "Empty",
  states: "States",
  structure: "Structure",
  address: "Address",
  people: "People",
};

/**
 * A place's options: empty, and every field the row would draw there. A
 * field placed elsewhere says where it comes from, and that it swaps with
 * the place's own field when the place holds one.
 */
export function placeOptions(
  layout: RowLayout,
  place: RowPlace,
): { value: PlaceChoice; label: string }[] {
  const drawnHere = CHOICES.filter(
    choice =>
      choice === EMPTY_PLACE ||
      withPlaced(layout, place, choice)[place] === choice,
  );
  return drawnHere.map(choice => {
    const elsewhere = ROW_PLACES.find(
      other => other !== place && layout[other] === choice,
    );
    return {
      value: choice,
      label:
        elsewhere === undefined
          ? CHOICE_LABELS[choice]
          : `${CHOICE_LABELS[choice]}, ${layout[place] === null ? "from" : "swaps with"} ${PLACE_LABELS[elsewhere]}`,
    };
  });
}

/**
 * The layout with a choice made for one place, as the row draws it: a pick
 * is the drop of that field on that place, so it swaps with what the place
 * held, and empty sends the place's field out of the row.
 */
export function withPlaced(
  layout: RowLayout,
  place: RowPlace,
  choice: PlaceChoice,
): RowLayout {
  if (choice !== EMPTY_PLACE) {
    return moveField(layout, choice, place);
  }
  const field = layout[place];
  return field === null
    ? drawnRowLayout(layout)
    : moveField(layout, field, TRAY);
}

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

/** What a host writes to get this look: the props, and the CSS. */
export function exportCode(state: StyleState): { tsx: string; css: string } {
  const props: string[] = [];
  const look = Object.entries(changedLook(state));
  if (look.length > 0) {
    props.push(
      `look={{\n${look.map(([key, value]) => `    ${key}: ${literal(value)},`).join("\n")}\n  }}`,
    );
  }
  const layout = Object.entries(changedLayout(state));
  if (layout.length > 0) {
    props.push(
      `layout={{\n${layout.map(([place, field]) => `    ${place}: ${field === null ? "null" : JSON.stringify(field)},`).join("\n")}\n  }}`,
    );
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
  const tsx =
    props.length === 0
      ? "<BusinessAutocomplete … />\n// Nothing changed from the defaults."
      : `<BusinessAutocomplete\n  ${props.join("\n  ")}\n  …\n/>`;
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
