// What the styled views share: their slots, their classes, the look's
// variables and the marks on a highlighted name.

import { Fragment, type CSSProperties, type ReactNode } from "react";

import {
  DEFAULT_LOOK,
  orderedStates,
  type BusinessStates,
  type HighlightPart,
  type Look,
} from "@baselayer-sdk/autocomplete";

import { disabledInks } from "./disabled";

/** The parts of a view a host can give its own class, through `classNames`. */
export type SlotName =
  | "root"
  | "label"
  | "input"
  | "menu"
  | "list"
  | "row"
  | "titleLine"
  | "title"
  | "nameGroup"
  | "name"
  | "also"
  | "mark"
  | "structure"
  | "states"
  | "state"
  | "moreStates"
  | "subtitleLine"
  | "corner"
  | "address"
  | "people"
  | "footer"
  | "count"
  | "debug"
  | "group"
  | "groupHead"
  | "groupLine"
  | "lineName"
  | "counts"
  | "selection"
  | "icon"
  | "role"
  | "more";

export type ClassFor = (slot: SlotName, base: string) => string | undefined;

export function classes(
  unstyled: boolean,
  classNames: Partial<Record<SlotName, string>> | undefined,
): ClassFor {
  return (slot, base) => {
    const own = classNames?.[slot];
    const parts = [unstyled ? undefined : base, own].filter(Boolean);
    return parts.length > 0 ? parts.join(" ") : undefined;
  };
}

/** The look's colors as CSS variables, only where they differ from the stylesheet's. */
export function lookVariables(look: Look): CSSProperties {
  const vars: Record<string, string> = {};
  // A disabled line's inks follow the knob and the colours they fade; the
  // stylesheet's fallbacks are the default look's.
  if (look.disabledDim !== DEFAULT_LOOK.disabledDim) {
    const inks = disabledInks(look);
    vars["--bl-ac-disabled-filter"] = inks.filter;
    vars["--bl-ac-disabled-opacity"] = inks.opacity;
    vars["--bl-ac-disabled-mark"] = `${inks.markShare}%`;
  }
  // Nothing fades at 0, so a disabled head and line keep a pick's weights.
  if (look.disabledDim === 0) {
    vars["--bl-ac-disabled-head-weight"] =
      look.matchEmphasis === "weight"
        ? "var(--bl-ac-weight-base)"
        : "var(--bl-ac-name-weight)";
    vars["--bl-ac-disabled-line-weight"] = "var(--bl-ac-weight-base)";
  }
  if (
    look.disabledDim !== DEFAULT_LOOK.disabledDim ||
    look.titleColor !== DEFAULT_LOOK.titleColor ||
    look.subtitleColor !== DEFAULT_LOOK.subtitleColor ||
    look.backgroundColor !== DEFAULT_LOOK.backgroundColor
  ) {
    const inks = disabledInks(look);
    vars["--bl-ac-disabled-name"] = inks.name;
    vars["--bl-ac-disabled-text"] = inks.text;
    vars["--bl-ac-disabled-role"] = inks.role;
  }
  const set = (name: string, value: string, fallback: string) => {
    if (value !== fallback) {
      vars[name] = value;
    }
  };
  set("--bl-ac-bg", look.backgroundColor, DEFAULT_LOOK.backgroundColor);
  set("--bl-ac-title", look.titleColor, DEFAULT_LOOK.titleColor);
  set("--bl-ac-subtitle", look.subtitleColor, DEFAULT_LOOK.subtitleColor);
  set(
    "--bl-ac-pill-bg",
    look.pillBackgroundColor,
    DEFAULT_LOOK.pillBackgroundColor,
  );
  set(
    "--bl-ac-pill-fg",
    look.pillForegroundColor,
    DEFAULT_LOOK.pillForegroundColor,
  );
  set(
    "--bl-ac-pill-primary-border",
    look.primaryPillBorderColor,
    DEFAULT_LOOK.primaryPillBorderColor,
  );
  set(
    "--bl-ac-pill-secondary-bg",
    look.secondaryPillBackgroundColor,
    DEFAULT_LOOK.secondaryPillBackgroundColor,
  );
  set(
    "--bl-ac-structure-bg",
    look.structurePillBackgroundColor,
    DEFAULT_LOOK.structurePillBackgroundColor,
  );
  set(
    "--bl-ac-structure-fg",
    look.structurePillForegroundColor,
    DEFAULT_LOOK.structurePillForegroundColor,
  );
  if (look.matchEmphasisColor !== null) {
    vars["--bl-ac-mark"] = look.matchEmphasisColor;
  }
  return vars as CSSProperties;
}

/**
 * `text` with the marks on it: the parts `partsFor` gives this line, the
 * matched ones as spans; the text as it is when the parts belong to the row's
 * other name, or there are none.
 */
export function marked(
  text: string,
  parts: HighlightPart[] | null,
  markClass: string | undefined,
  testId = "business-suggestion-match",
): ReactNode {
  if (parts === null) {
    return text;
  }
  return parts.map((part, index) =>
    part.matched ? (
      <span key={index} className={markClass} data-testid={testId}>
        {part.text}
      </span>
    ) : (
      <Fragment key={index}>{part.text}</Fragment>
    ),
  );
}

/** Squares shown before the `+N` overflow: the domicile and two more. */
export const STATE_SQUARES = 3;

/**
 * A business's states as squares, the domicile first and marked, then the
 * states a filter matched, then `+N` past the third.
 */
export function StateSquares({
  business,
  matched,
  cx,
  more,
  place,
}: {
  /** A business row, or a business listed under a person or an address. */
  business: BusinessStates;
  /** The states a state filter matched: moved forward and marked. */
  matched: readonly string[];
  cx: ClassFor;
  more: (count: number) => string;
  /** The layout place it is drawn in. */
  place: string;
}) {
  const states = orderedStates(business, matched);
  const shown = states.slice(0, STATE_SQUARES);
  const hidden = states.length - shown.length;
  return (
    <span className={cx("states", "bl-ac-states")} data-place={place}>
      {shown.map(state => (
        <span
          key={state}
          className={cx("state", "bl-ac-state")}
          data-testid="business-suggestion-state"
          data-domicile={state === business.domicile_state ? "true" : undefined}
          data-matched={matched.includes(state) ? "true" : undefined}
        >
          {state}
        </span>
      ))}
      {hidden > 0 && (
        <span
          className={cx("moreStates", "bl-ac-more-states")}
          data-testid="business-suggestion-more-states"
        >
          {more(hidden)}
        </span>
      )}
    </span>
  );
}

/**
 * The role column's width for a menu's lines under rows: its longest role, so
 * the roles line up and the squares before them start at one edge.
 */
export function roleColumn(
  roles: readonly (string | null)[],
): CSSProperties | undefined {
  const longest = Math.max(0, ...roles.map(role => role?.length ?? 0));
  return longest === 0
    ? undefined
    : ({ "--bl-ac-role-chars": String(longest) } as CSSProperties);
}
