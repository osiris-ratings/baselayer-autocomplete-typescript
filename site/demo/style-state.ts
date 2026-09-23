// Everything the styled component lets a host change, as one piece of state:
// the `look` knobs, the CSS variables that are not knobs, the behavior
// props, the text, and the structural switches. Defaults are the SDK's own,
// imported rather than copied, except the stylesheet's variables, which the
// stylesheet declares.

import {
  DEFAULT_LOOK,
  type Include,
  type Look,
  type MatchEmphasis,
  type MatchRegion,
} from "@baselayer/autocomplete";
import {
  DEBOUNCE_MS,
  DEFAULT_LIMIT,
  DEFAULT_MESSAGES,
  MIN_QUERY_CHARS,
  type AutocompleteMessages,
} from "@baselayer/autocomplete/react";

/** The variables in react/styles.css that `look` does not set. */
export const CSS_VARIABLES = {
  "--bl-ac-highlight-bg": {
    label: "Highlighted row",
    kind: "color",
    value: "#edf2f7",
  },
  "--bl-ac-border": { label: "Menu border", kind: "color", value: "#edf2f7" },
  "--bl-ac-more-fg": { label: "+N count ink", kind: "color", value: "#2d3748" },
  "--bl-ac-ink-base": {
    label: "Unmatched ink (ink mode)",
    kind: "color",
    value: "#4a5568",
  },
  "--bl-ac-also-mark": {
    label: "Alternative-name mark",
    kind: "color",
    value: "#2d3748",
  },
  "--bl-ac-underline": {
    label: "Underline mark",
    kind: "color",
    value: "#38a169",
  },
  "--bl-ac-marker": {
    label: "Background mark",
    kind: "color",
    value: "#c6f6d5",
  },
  "--bl-ac-radius": { label: "Menu corners", kind: "length", value: "0.5rem" },
  "--bl-ac-pill-radius": {
    label: "State square corners",
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
} as const;

export type CssVariable = keyof typeof CSS_VARIABLES;

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

export interface StyleState {
  look: Look;
  vars: Record<CssVariable, string>;
  limit: number;
  include: Include[];
  minChars: number;
  debounceMs: number;
  prewarmOnFocus: boolean;
  label: string;
  messages: Record<TextMessage, string>;
  /** Draw the input with this page's own input class (`classNames.input`). */
  pageInput: boolean;
  unstyled: boolean;
}

export const DEFAULT_LABEL = "Business name";
const DEFAULT_INCLUDE: Include[] = ["people", "addresses"];

export const DEFAULT_STYLE: StyleState = {
  look: { ...DEFAULT_LOOK },
  vars: Object.fromEntries(
    Object.entries(CSS_VARIABLES).map(([name, spec]) => [name, spec.value]),
  ) as Record<CssVariable, string>,
  limit: DEFAULT_LIMIT,
  include: DEFAULT_INCLUDE,
  minChars: MIN_QUERY_CHARS,
  debounceMs: DEBOUNCE_MS,
  prewarmOnFocus: true,
  label: DEFAULT_LABEL,
  messages: Object.fromEntries(
    TEXT_MESSAGES.map(key => [key, DEFAULT_MESSAGES[key]]),
  ) as Record<TextMessage, string>,
  pageInput: false,
  unstyled: false,
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
  { key: "titleColor", label: "Name" },
  { key: "subtitleColor", label: "Second line" },
  { key: "pillBackgroundColor", label: "State square" },
  { key: "pillForegroundColor", label: "State square ink" },
  { key: "primaryPillBorderColor", label: "Domicile border" },
  { key: "secondaryPillBackgroundColor", label: "+N square" },
];

export const EMPHASES: MatchEmphasis[] = [
  "underline",
  "background",
  "weight",
  "ink",
  "plain",
];
export const REGIONS: MatchRegion[] = ["token", "substring"];
export const INCLUDES: Include[] = ["people", "addresses", "liens"];

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
  if (state.limit !== DEFAULT_STYLE.limit) props.push(`limit={${state.limit}}`);
  if (state.include.join(",") !== DEFAULT_INCLUDE.join(",")) {
    props.push(`include={${JSON.stringify(state.include)}}`);
  }
  if (state.minChars !== DEFAULT_STYLE.minChars)
    props.push(`minChars={${state.minChars}}`);
  if (state.debounceMs !== DEFAULT_STYLE.debounceMs)
    props.push(`debounceMs={${state.debounceMs}}`);
  if (!state.prewarmOnFocus) props.push("prewarmOnFocus={false}");
  if (state.label !== DEFAULT_LABEL)
    props.push(`label=${JSON.stringify(state.label)}`);
  const messages = changedMessages(state);
  if (messages.length > 0) {
    props.push(
      `messages={{\n${messages.map(([key, value]) => `    ${key}: ${JSON.stringify(value)},`).join("\n")}\n  }}`,
    );
  }
  if (state.pageInput) props.push('classNames={{ input: "your-input" }}');
  if (state.unstyled) props.push("unstyled");
  const tsx =
    props.length === 0
      ? "<BusinessAutocomplete … />\n// Nothing changed: the defaults are the Baselayer console's look."
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
  "--bl-ac-also-mark",
  "--bl-ac-underline",
  "--bl-ac-marker",
  "--bl-ac-radius",
  "--bl-ac-pill-radius",
  "--bl-ac-shadow",
];

export const PRESETS: Preset[] = [
  { name: "Light", look: {}, vars: {} },
  {
    name: "Baselayer",
    look: {
      titleColor: "#1c1b1c",
      subtitleColor: "#676b76",
      pillBackgroundColor: "#c6dbf6",
      pillForegroundColor: "#09234f",
      primaryPillBorderColor: "#384ce3",
      secondaryPillBackgroundColor: "#f1f6fd",
    },
    vars: {
      "--bl-ac-highlight-bg": "#f1f6fd",
      "--bl-ac-border": "#dce5f5",
      "--bl-ac-more-fg": "#09234f",
      "--bl-ac-ink-base": "#676b76",
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
    },
    vars: {
      "--bl-ac-highlight-bg": "#172036",
      "--bl-ac-border": "#1f2a44",
      "--bl-ac-more-fg": "#cbd5e1",
      "--bl-ac-ink-base": "#8b95a7",
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
    },
    vars: {
      "--bl-ac-highlight-bg": "#3e3d32",
      "--bl-ac-border": "#49483e",
      "--bl-ac-more-fg": "#f8f8f2",
      "--bl-ac-ink-base": "#a59f85",
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
    },
    vars: {
      "--bl-ac-highlight-bg": "#f3ead9",
      "--bl-ac-border": "#e7dcc6",
      "--bl-ac-more-fg": "#6b4a24",
      "--bl-ac-ink-base": "#8a7866",
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
    },
    vars: {
      "--bl-ac-highlight-bg": "#fdf2f6",
      "--bl-ac-border": "#f6dbe5",
      "--bl-ac-more-fg": "#9d174d",
      "--bl-ac-ink-base": "#8c6a78",
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
  return { ...state, look, vars };
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
