// What the styled views share: their slots, their classes, the look's
// variables and the marks on a highlighted name.

import { Fragment, type CSSProperties, type ReactNode } from "react";

import {
  DEFAULT_LOOK,
  type HighlightPart,
  type Look,
} from "@baselayer-sdk/autocomplete";

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
  | "groupCount"
  | "option"
  | "optionName"
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
