import {
  Fragment,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
  type Ref,
} from "react";

import {
  DEFAULT_LOOK,
  resolveLook,
  resolveRowLayout,
  type Look,
  type LookInput,
  type RowField,
  type RowLayoutInput,
  type RowPlace,
} from "@baselayer-sdk/autocomplete";
import {
  formatFound,
  leadAddressOf,
  orderedStates,
  partsFor,
  peopleLineOf,
  queryTokens,
  structureLabel,
} from "@baselayer-sdk/autocomplete";
import type {
  BusinessSuggestion,
  HighlightPart,
} from "@baselayer-sdk/autocomplete";

import { resolveMessages, type AutocompleteMessages } from "./messages";
import { rowLines } from "./rowLayout";
import { useBusinessCombobox } from "./useBusinessCombobox";

/** Squares shown before the `+N` overflow: the domicile and two more. */
export const STATE_SQUARES = 3;

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
  | "address"
  | "people"
  | "footer"
  | "count"
  | "debug";

export interface RowRenderProps {
  item: BusinessSuggestion;
  index: number;
  highlighted: boolean;
  /** The row as the component would draw it, to wrap or replace. */
  defaultRow: ReactNode;
}

export interface BusinessAutocompleteViewProps {
  id: string;
  /** The input's value; the host owns it. */
  value: string;
  /** Typing only; a pick reports through `onSelect`. */
  onInputChange(value: string): void;
  onSelect(suggestion: BusinessSuggestion): void;
  onInputFocus?: (() => void) | undefined;
  onInputBlur?: (() => void) | undefined;
  inputName?: string | undefined;
  inputRef?: Ref<HTMLInputElement> | undefined;

  suggestions: BusinessSuggestion[];
  found: number;
  foundCapped: boolean;
  truncated: boolean;
  indexTag: string | null;
  roundTripMs: number | null;
  isSearching: boolean;
  error: string | null;
  /**
   * Hold the menu open whatever focus does: a style preview, a design tool.
   * It still shows only what there is to show.
   */
  open?: boolean | undefined;
  /**
   * The field each place of a row shows (`ROW_PLACES`, `ROW_FIELDS`); the
   * title always shows the name. A place left out keeps its default field
   * unless it is placed elsewhere, and null leaves a place empty. With
   * `subtitle` empty, the field in `subtitleTrailing` takes its place.
   */
  layout?: RowLayoutInput | undefined;
  /**
   * The menu as wide as the input (the default), or, `false`, as wide as
   * `--bl-ac-menu-width` from 48em up.
   */
  menuFollowsInputWidth?: boolean | undefined;

  /** How the rows are drawn; any knob left out keeps its default. */
  look?: LookInput | undefined;
  messages?: Partial<AutocompleteMessages> | undefined;
  /** Text of the default label; ignored when `renderLabel` is given. */
  label?: ReactNode;
  /**
   * The host's own label. Spread the props onto a `<label>`: they carry the
   * `id`/`htmlFor` pair the combobox needs.
   */
  renderLabel?:
    ((labelProps: Record<string, unknown>) => ReactElement) | undefined;
  /**
   * The host's own input (a design-system text field). Spread the props onto
   * the input element, ref included.
   */
  renderInput?:
    ((inputProps: Record<string, unknown>) => ReactElement) | undefined;
  renderRow?: ((props: RowRenderProps) => ReactNode) | undefined;
  classNames?: Partial<Record<SlotName, string>> | undefined;
  /** Emit no `bl-ac-*` classes: the host styles every slot itself. */
  unstyled?: boolean | undefined;
}

type ClassFor = (slot: SlotName, base: string) => string | undefined;

function classes(
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
function lookVariables(look: Look): CSSProperties {
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
function marked(
  text: string,
  parts: HighlightPart[] | null,
  markClass: string | undefined,
): ReactNode {
  if (parts === null) {
    return text;
  }
  return parts.map((part, index) =>
    part.matched ? (
      <span
        key={index}
        className={markClass}
        data-testid="business-suggestion-match"
      >
        {part.text}
      </span>
    ) : (
      <Fragment key={index}>{part.text}</Fragment>
    ),
  );
}

function StateSquares({
  suggestion,
  cx,
  more,
  place,
}: {
  suggestion: BusinessSuggestion;
  cx: ClassFor;
  more: (count: number) => string;
  place: RowPlace;
}) {
  const states = orderedStates(suggestion);
  const shown = states.slice(0, STATE_SQUARES);
  const hidden = states.length - shown.length;
  return (
    <span className={cx("states", "bl-ac-states")} data-place={place}>
      {shown.map((state, index) => (
        <span
          key={state}
          className={cx("state", "bl-ac-state")}
          data-testid="business-suggestion-state"
          data-domicile={index === 0 ? "true" : undefined}
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
 * The styled typeahead, with the state supplied by the host
 * (`useBusinessAutocomplete`). Each row is one business family, drawn in the
 * places `layout` fills; by default a two-line cell: the canonical name with
 * the matched words marked, its structure's flag, and, fainter, the
 * alternative name when that is what matched, with the family's states as
 * squares at the right, domicile first; then the lead address and the lead
 * officer. Below the rows, outside the listbox, the count row.
 */
export function BusinessAutocompleteView({
  id,
  value,
  onInputChange,
  onSelect,
  onInputFocus,
  onInputBlur,
  inputName,
  inputRef,
  suggestions,
  found,
  foundCapped,
  truncated,
  indexTag,
  roundTripMs,
  isSearching,
  error,
  open = false,
  layout: layoutInput,
  menuFollowsInputWidth = true,
  look: lookInput,
  messages: messageOverrides,
  label,
  renderLabel,
  renderInput,
  renderRow,
  classNames,
  unstyled = false,
}: BusinessAutocompleteViewProps) {
  const look = resolveLook(lookInput ?? {});
  // One layout for every row, from the places the host filled.
  const lines = rowLines(resolveRowLayout(layoutInput));
  const text = resolveMessages(messageOverrides);
  const cx = classes(unstyled, classNames);
  const hasFooter = isSearching || error !== null || roundTripMs !== null;
  const combobox = useBusinessCombobox({
    id,
    items: suggestions,
    inputValue: value,
    onInputChange,
    onPick: onSelect,
    hasFooter,
    open,
  });
  // What was typed, as the tier tokenizes it, for cutting a marked word down
  // to the typed characters under the `substring` region.
  const tokens = queryTokens(value);
  const { hasRows, menuVisible, highlightedIndex } = combobox;
  const hasCountRow = combobox.isOpen && hasFooter;

  function countRowLabel(): string {
    if (isSearching && suggestions.length === 0) {
      return text.searching;
    }
    // A truncated answer is not a count: "0 matches" would read as "your
    // business is not in here", which is the one thing it must not say.
    if (truncated) {
      return suggestions.length === 0
        ? text.truncatedNoRows
        : text.truncatedRows;
    }
    const noun = found === 1 && !foundCapped ? text.match : text.matches;
    return `${formatFound(found, foundCapped)} ${noun}`;
  }

  const labelProps = combobox.getLabelProps() as Record<string, unknown>;
  const inputProps = combobox.getInputProps({
    ref: inputRef,
    name: inputName,
    onFocus: onInputFocus,
    onBlur: onInputBlur,
    autoComplete: "off",
  });

  const region = look.matchEmphasisRegion;
  // Plain draws none of the marks, which is no parts at all.
  const drawMarks = look.matchEmphasis !== "plain";

  return (
    <div
      className={cx("root", "bl-ac")}
      style={lookVariables(look)}
      data-emphasis={look.matchEmphasis}
      data-region={region}
      data-mark-color={look.matchEmphasisColor !== null ? "true" : undefined}
    >
      {renderLabel ? (
        renderLabel(labelProps)
      ) : label !== undefined ? (
        <label {...labelProps} className={cx("label", "bl-ac-label")}>
          {label}
        </label>
      ) : null}
      {renderInput ? (
        renderInput(inputProps)
      ) : (
        <input {...inputProps} className={cx("input", "bl-ac-input")} />
      )}
      <div
        className={cx("menu", "bl-ac-menu")}
        data-testid="autocomplete-menu"
        data-open={menuVisible ? "true" : "false"}
        data-width={menuFollowsInputWidth ? undefined : "fixed"}
        hidden={!menuVisible}
      >
        {/* The listbox holds the options and nothing else; the count row sits
            below it. Always mounted, as downshift requires of its menu. */}
        <div className={cx("list", "bl-ac-list")} {...combobox.getMenuProps()}>
          {hasRows &&
            suggestions.map((item, index) => {
              const address = leadAddressOf(item);
              const people = peopleLineOf(item);
              const structure = structureLabel(item.structure, text.structures);
              const parts = drawMarks ? item.highlight : [];
              const highlighted = highlightedIndex === index;
              const markClass = cx("mark", "bl-ac-mark");
              // Each field as drawn in a place: the same in any, the place
              // deciding where it sits and what gives way first.
              const fieldNode: Record<
                RowField,
                (place: RowPlace) => ReactNode
              > = {
                states: place => (
                  <StateSquares
                    suggestion={item}
                    cx={cx}
                    more={text.more}
                    place={place}
                  />
                ),
                structure: place =>
                  structure !== null && (
                    <span
                      className={cx("structure", "bl-ac-structure")}
                      data-place={place}
                      data-testid="business-suggestion-structure"
                    >
                      {structure}
                    </span>
                  ),
                address: place => (
                  <span
                    className={cx("address", "bl-ac-address")}
                    data-place={place}
                    data-testid="business-suggestion-address"
                  >
                    {address ?? text.noAddress}
                  </span>
                ),
                people: place =>
                  people !== null && (
                    <span
                      className={cx("people", "bl-ac-people")}
                      data-place={place}
                      data-testid="business-suggestion-officers"
                      data-role={people.role}
                    >
                      {people.names[0]}
                      {people.more > 0 ? ` ${text.more(people.more)}` : ""}
                      {people.role === "agent" ? text.agentSuffix : ""}
                    </span>
                  ),
              };
              const draw = (field: RowField | null, place: RowPlace) =>
                field === null ? null : fieldNode[field](place);
              const lead =
                lines.subtitle === null
                  ? null
                  : draw(lines.subtitle.lead, "subtitle");
              const trailing =
                lines.subtitle === null
                  ? null
                  : draw(lines.subtitle.trailing, "subtitleTrailing");
              const defaultRow = (
                <>
                  <div
                    className={cx("titleLine", "bl-ac-line bl-ac-line-title")}
                  >
                    <span
                      className={cx("title", "bl-ac-title")}
                      data-place="title"
                    >
                      {/* One piece, so `also …` leaves the line whole rather
                          than splitting the name from its badge. */}
                      <span className={cx("nameGroup", "bl-ac-name-group")}>
                        <span
                          className={cx("name", "bl-ac-name")}
                          data-testid="business-suggestion-name"
                          data-emphasis={look.matchEmphasis}
                          data-region={region}
                        >
                          {marked(
                            item.label,
                            partsFor(item.label, parts, region, tokens),
                            markClass,
                          )}
                        </span>
                        {draw(lines.title.badge, "titleBadge")}
                      </span>
                      {item.matched_name !== null && (
                        <span
                          className={cx("also", "bl-ac-also")}
                          data-testid="business-suggestion-also"
                          data-emphasis={look.matchEmphasis}
                        >
                          also{" "}
                          {marked(
                            item.matched_name,
                            partsFor(item.matched_name, parts, region, tokens),
                            markClass,
                          )}
                        </span>
                      )}
                    </span>
                    {draw(lines.title.trailing, "titleTrailing")}
                  </div>
                  {/* A row with nothing for its second line (no officers
                      where only they are placed) drops the line. */}
                  {(lead || trailing) && (
                    <div
                      className={cx(
                        "subtitleLine",
                        "bl-ac-line bl-ac-line-subtitle",
                      )}
                    >
                      {lead}
                      {trailing}
                    </div>
                  )}
                </>
              );
              return (
                <div
                  key={item.token}
                  className={cx("row", "bl-ac-row")}
                  data-highlighted={highlighted ? "true" : undefined}
                  data-testid="business-suggestion"
                  {...combobox.getItemProps({ item, index })}
                >
                  {renderRow
                    ? renderRow({ item, index, highlighted, defaultRow })
                    : defaultRow}
                </div>
              );
            })}
        </div>
        {hasCountRow && (
          <div
            className={cx("footer", "bl-ac-footer")}
            data-rows={hasRows ? "true" : undefined}
            data-testid="business-suggestions-footer"
            {...combobox.getFooterProps()}
          >
            <span className={cx("count", "bl-ac-count")}>
              {error ?? countRowLabel()}
            </span>
            {look.showDebugInfo && roundTripMs !== null && (
              <span
                className={cx("debug", "bl-ac-debug")}
                data-testid="business-suggestions-diagnostics"
              >
                {roundTripMs} ms{indexTag !== null ? ` · ${indexTag}` : ""}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
