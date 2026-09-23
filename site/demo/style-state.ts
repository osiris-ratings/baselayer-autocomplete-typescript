// Everything the styled component lets a host change, as one piece of state:
// the `look` knobs, the CSS variables that are not knobs, the behaviour
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
    value: "#faf089",
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
