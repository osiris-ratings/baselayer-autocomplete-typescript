import { type ReactElement, type ReactNode, type Ref } from "react";

import {
  ROW_LINES,
  drawnRowLayout,
  resolveLook,
  resolveRowLayout,
  type Look,
  type LookInput,
  type RowField,
  type RowLayout,
  type RowLayoutInput,
  type RowLine,
  type RowPlace,
} from "@baselayer-sdk/autocomplete";
import {
  addressLineOf,
  formatFound,
  matchedOn,
  orderedStates,
  partsFor,
  peopleLineOf,
  queryTokens,
  structureLabel,
} from "@baselayer-sdk/autocomplete";
import type { BusinessSuggestion, Filters } from "@baselayer-sdk/autocomplete";

import { resolveMessages, type AutocompleteMessages } from "./messages";
import { useBusinessCombobox } from "./useBusinessCombobox";
import {
  classes,
  lookVariables,
  marked,
  type ClassFor,
  type SlotName,
} from "./viewParts";

export type { SlotName } from "./viewParts";

/** Squares shown before the `+N` overflow: the domicile and two more. */
export const STATE_SQUARES = 3;

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
   * The filters `suggestions` were fetched with (`appliedFilters` of
   * `useBusinessAutocomplete`), none when there were none or the client withheld
   * them. The rows read only the states from it: the wire flags what a person
   * or an address filter matched, but not what a state filter did.
   */
  appliedFilters?: Filters | undefined;
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

function StateSquares({
  suggestion,
  matched,
  cx,
  more,
  place,
}: {
  suggestion: BusinessSuggestion;
  /** The states a state filter matched: moved forward and marked. */
  matched: readonly string[];
  cx: ClassFor;
  more: (count: number) => string;
  place: RowPlace;
}) {
  const states = orderedStates(suggestion, matched);
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

/** Each line's slot and classes. */
const LINE_CLASSES: Record<
  RowLine["line"],
  { slot: SlotName; className: string }
> = {
  title: { slot: "titleLine", className: "bl-ac-line bl-ac-line-title" },
  subtitle: {
    slot: "subtitleLine",
    className: "bl-ac-line bl-ac-line-subtitle",
  },
};

interface DefaultRowProps {
  item: BusinessSuggestion;
  /** The layout as the row draws it (`drawnRowLayout`), one for every row. */
  layout: RowLayout;
  look: Look;
  /**
   * What was typed, as the autocomplete service tokenizes it (`queryTokens`).
   */
  tokens: string[];
  text: AutocompleteMessages;
  cx: ClassFor;
  /** The states the filters the rows were fetched with named, if any. */
  stateFilter: readonly string[] | undefined;
}

/**
 * One business as the component draws it: each line of `ROW_LINES` as its
 * lead corner and its trailing corner, each holding its places' fields. The
 * first line's lead is the title: the name with its badge, then `also …`.
 */
function DefaultRow({
  item,
  layout,
  look,
  tokens,
  text,
  cx,
  stateFilter,
}: DefaultRowProps) {
  const region = look.matchEmphasisRegion;
  // Plain draws none of the marks, which is no parts at all.
  const parts = look.matchEmphasis !== "plain" ? item.highlight : [];
  const markClass = cx("mark", "bl-ac-mark");
  const address = addressLineOf(item);
  const people = peopleLineOf(item);
  const structure = structureLabel(item.structure, text.structures);
  const matches = matchedOn(item, { state: stateFilter });
  const matchedStates = matches.flatMap(match =>
    match.kind === "state" ? match.states : [],
  );
  // A match with no parts of its own is marked whole, as the one part.
  const wholeMark = (label: string, matched: boolean): ReactNode =>
    matched && look.matchEmphasis !== "plain"
      ? marked(label, [{ text: label, matched: true }], markClass)
      : label;
  const addressSuffix =
    address === null || !address.matched
      ? ""
      : address.role === "officer"
        ? text.officerAddressSuffix
        : address.role === "agent"
          ? text.agentAddressSuffix
          : "";
  // Each field as drawn in a place: the same in any, the place deciding
  // where it sits and what gives way first.
  const fieldNode: Record<RowField, (place: RowPlace) => ReactNode> = {
    states: place => (
      <StateSquares
        suggestion={item}
        matched={matchedStates}
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
        data-emphasis={look.matchEmphasis}
        data-matched={address?.matched ? "true" : undefined}
      >
        {address === null ? (
          text.noAddress
        ) : (
          <>
            {wholeMark(address.label, address.matched)}
            {addressSuffix}
          </>
        )}
      </span>
    ),
    people: place =>
      people !== null && (
        <span
          className={cx("people", "bl-ac-people")}
          data-place={place}
          data-testid="business-suggestion-officers"
          data-role={people.role}
          data-emphasis={look.matchEmphasis}
          data-matched={people.matched > 0 ? "true" : undefined}
        >
          {wholeMark(people.names[0] ?? "", people.matched > 0)}
          {people.more > 0 ? ` ${text.more(people.more)}` : ""}
          {people.role === "agent" ? text.agentSuffix : ""}
        </span>
      ),
  };
  const draw = (place: RowPlace): ReactNode => {
    const field = layout[place];
    return field === null ? null : fieldNode[field](place);
  };
  /** Whether a place draws text on this row, rather than a flag or nothing. */
  const drawsText = (place: RowPlace) =>
    layout[place] === "address" ||
    (layout[place] === "people" && people !== null);
  /** Whether a place draws a flag on this row. */
  const drawsFlag = (place: RowPlace) =>
    layout[place] === "states" ||
    (layout[place] === "structure" && structure !== null);
  /**
   * A corner: the two places it pins together, in the order they sit, or
   * nothing when neither draws anything on this row. It says whether it holds
   * text and whether a flag, which decide how it shares its line.
   */
  const corner = (
    kind: "lead" | "trailing",
    first: RowPlace,
    second: RowPlace,
  ) => {
    const drawnFirst = draw(first);
    const drawnSecond = draw(second);
    if (!drawnFirst && !drawnSecond) {
      return null;
    }
    return (
      <span
        className={cx("corner", "bl-ac-corner")}
        data-corner={kind}
        data-text={drawsText(first) || drawsText(second) ? "true" : undefined}
        data-flag={drawsFlag(first) || drawsFlag(second) ? "true" : undefined}
      >
        {drawnFirst}
        {drawnSecond}
      </span>
    );
  };
  const title = (badge: RowPlace) => (
    <span className={cx("title", "bl-ac-title")} data-place="title">
      {/* One piece, so `also …` leaves the line whole rather than splitting
          the name from its badge. */}
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
        {draw(badge)}
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
  );
  return (
    <>
      {ROW_LINES.map(({ line, lead, trailing }) => {
        const leadCorner =
          lead.field === null
            ? title(lead.badge)
            : corner("lead", lead.field, lead.badge);
        const trailingCorner = corner(
          "trailing",
          trailing.badge,
          trailing.field,
        );
        // A line with nothing on it for this row (no officers where only
        // they are placed) is dropped; the title's never is.
        if (!leadCorner && !trailingCorner) {
          return null;
        }
        const { slot, className } = LINE_CLASSES[line];
        return (
          <div key={line} className={cx(slot, className)}>
            {leadCorner}
            {trailingCorner}
          </div>
        );
      })}
    </>
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
  appliedFilters,
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
  // One layout for every row, from the places the host filled, as drawn.
  const layout = drawnRowLayout(resolveRowLayout(layoutInput));
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
  // What was typed, as the autocomplete service tokenizes it, for cutting a
  // marked word down to the typed characters under the `substring` region.
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
              const highlighted = highlightedIndex === index;
              const defaultRow = (
                <DefaultRow
                  item={item}
                  layout={layout}
                  look={look}
                  tokens={tokens}
                  text={text}
                  cx={cx}
                  stateFilter={appliedFilters?.state}
                />
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
