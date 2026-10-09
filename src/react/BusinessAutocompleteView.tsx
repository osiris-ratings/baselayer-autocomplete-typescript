import { useRef, type ReactElement, type ReactNode, type Ref } from "react";

import {
  BUSINESS_ROW,
  DEFAULT_ENABLED_LINES,
  DEFAULT_ICON_SEGMENTS,
  ROUTES,
  ROW_LINES,
  drawnLayout,
  drawnRowLayout,
  groupedLines,
  resolveLayout,
  resolveLook,
  resolveRowLayout,
  type BusinessIconSegment,
  type BusinessRowLayoutInput,
  type EntityPick,
  type EntityType,
  type RelatedRole,
  type GroupedOption,
  type Include,
  type Look,
  type LookInput,
  type RelatedItem,
  type RowField,
  type RowLayout,
  type RowLayoutInput,
  type RowPlace,
} from "@baselayer-sdk/autocomplete";
import {
  addressLineOf,
  formatFound,
  matchedOn,
  partsFor,
  peopleLineOf,
  queryTokens,
  structureLabel,
} from "@baselayer-sdk/autocomplete";
import type { BusinessSuggestion, Filters } from "@baselayer-sdk/autocomplete";

import { SegmentIcon, type IconSet } from "./icons";
import { resolveMessages, type AutocompleteMessages } from "./messages";
import type { GroupedSelection } from "./selection";
import { useSuggestionCombobox } from "./useBusinessCombobox";
import {
  StateSquares,
  classes,
  countsText,
  useRoleColumn,
  lookVariables,
  marked,
  type ClassFor,
  type SlotName,
} from "./viewParts";

export { STATE_SQUARES } from "./viewParts";
export type { SlotName } from "./viewParts";

/**
 * A line of a group as the combobox holds it: what picking it hands, or null
 * for a disabled one, which is an option the keys pass over; and its name.
 */
interface OptionItem {
  option: GroupedOption | null;
  label: string;
}

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
  layout?: BusinessRowLayoutInput | undefined;
  /**
   * The relations listed under each row, a line per item: a business's
   * officers and agents (`people`) and its `addresses`. None by default, and
   * then each row is the one option it has always been.
   */
  list?: readonly Include[] | undefined;
  /** Which lines can be picked, by type: the business itself by default. */
  enabledLines?: readonly EntityType[] | undefined;
  /** A host's own icons, by entity or by entity and role; `false` draws none. */
  icons?: IconSet | undefined;
  /**
   * The segments that carry an icon before their text, wherever they are
   * placed: none by default, so a row draws as it always has.
   */
  iconSegments?: readonly BusinessIconSegment[] | undefined;
  /** What the line under the field names; none drawn when null. */
  selection?: GroupedSelection | null | undefined;
  /** An officer or an address picked from a line under `row`. */
  onSelectEntity?:
    ((pick: EntityPick, row: BusinessSuggestion) => void) | undefined;
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

/** Each line's slot and classes. */
const LINE_CLASSES: Record<
  (typeof ROW_LINES)[number]["line"],
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
  /** An id for the name, which labels the row's group when it lists lines. */
  nameId?: string | undefined;
  /** The icon a segment carries, for an entity in a role, or none. */
  iconOf: IconOf;
}

/** The icon a segment carries, for an entity in a role; nothing for none. */
type IconOf = (
  segment: BusinessIconSegment,
  entity: EntityType,
  role: RelatedRole | null,
) => ReactNode;

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
  nameId,
  iconOf,
}: DefaultRowProps) {
  const region = look.matchEmphasisRegion;
  // Plain draws none of the marks, which is no parts at all.
  const parts = look.matchEmphasis !== "plain" ? item.highlight : [];
  const markClass = cx("mark", "bl-ac-mark");
  const address = addressLineOf(item);
  const people = peopleLineOf(item);
  const structure = structureLabel(item.structure, text.structures);
  const counts = countsText("businesses", item.related, text);
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
        business={item}
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
            {iconOf(
              "address",
              "address",
              item.related.addresses.items[0]?.role ?? null,
            )}
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
          {iconOf("people", "person", people.role)}
          {wholeMark(people.names[0] ?? "", people.matched > 0)}
          {people.more > 0 ? ` ${text.more(people.more)}` : ""}
          {people.role === "agent" ? text.agentSuffix : ""}
        </span>
      ),
    counts: place =>
      counts !== null && (
        <span
          className={cx("counts", "bl-ac-group-count")}
          data-place={place}
          data-testid="business-suggestion-counts"
        >
          {counts}
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
    (layout[place] === "people" && people !== null) ||
    (layout[place] === "counts" && counts !== null);
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
        {iconOf("name", "business", null)}
        <span
          id={nameId}
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
  list,
  enabledLines = DEFAULT_ENABLED_LINES,
  icons,
  iconSegments = DEFAULT_ICON_SEGMENTS.businesses,
  selection = null,
  onSelectEntity,
}: BusinessAutocompleteViewProps) {
  const look = resolveLook(lookInput ?? {});
  // One layout for every row, from the places the host filled, as drawn: the
  // head's, as it has always been, and the whole row's, lines included.
  const layout = drawnRowLayout(
    resolveRowLayout(layoutInput as RowLayoutInput),
  );
  const rowLayout: Readonly<Record<string, string | null>> = drawnLayout(
    BUSINESS_ROW,
    resolveLayout(BUSINESS_ROW, layoutInput),
  );
  const text = resolveMessages(messageOverrides);
  const cx = classes(unstyled, classNames);
  const hasFooter = isSearching || error !== null || roundTripMs !== null;
  // A row that lists lines under it, or whose business is not itself a pick,
  // is a group of lines; any other is the one option a row has always been.
  // In the host's order: the lines are drawn in it, each relation once
  // (`groupedLines`).
  const listed = (list ?? []).filter(relation =>
    ROUTES.businesses.includes.includes(relation),
  );
  const grouped = listed.length > 0 || !enabledLines.includes("business");
  const rowLines = grouped
    ? suggestions.map(row => groupedLines(row, listed, enabledLines))
    : [];
  // Every line of a group is an option, in the order drawn, the business
  // first: one that is not a pick is a disabled one.
  const items: (BusinessSuggestion | OptionItem)[] = grouped
    ? rowLines.flatMap((lines, rowIndex) => [
        { option: lines.head.option, label: suggestions[rowIndex]!.label },
        ...lines.lists.flatMap(list =>
          list.lines.map(({ item, option }) => ({ option, label: item.label })),
        ),
      ])
    : suggestions;
  const combobox = useSuggestionCombobox<BusinessSuggestion | OptionItem>({
    id,
    items,
    inputValue: value,
    onInputChange,
    onPick: item => {
      if (!("option" in item)) {
        onSelect(item);
        return;
      }
      const { option } = item;
      if (option === null) {
        return;
      }
      if (option.kind === "row") {
        onSelect(option.row);
      } else if (option.kind === "entity" && option.row.type === "business") {
        onSelectEntity?.(option.pick, option.row);
      }
    },
    isItemDisabled: item => "option" in item && item.option === null,
    hasFooter,
    open,
    rowCount: suggestions.length,
  });
  const withIcon: ReadonlySet<string> = new Set(iconSegments);
  const iconOf: IconOf = (segment, entity, role) =>
    withIcon.has(segment) && (
      <SegmentIcon
        icons={icons}
        entity={entity}
        role={role}
        className={cx("icon", "bl-ac-icon")}
      />
    );
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
  const selectionId = `${id}-selection`;
  const inputProps = combobox.getInputProps({
    ref: inputRef,
    name: inputName,
    onFocus: onInputFocus,
    onBlur: onInputBlur,
    autoComplete: "off",
    ...(selection !== null ? { "aria-describedby": selectionId } : {}),
  });

  let optionIndex = 0;
  /** A field of a line under a business, as drawn in `place`. */
  const lineField = (place: string, related: RelatedItem): ReactNode => {
    const name = rowLayout[place] ?? null;
    if (name === null || related.role === null) return null;
    const role =
      name === "addressRole"
        ? text.addressRoles[related.role]
        : text.personRoles[related.role];
    return (
      <span
        className={cx("role", "bl-ac-role")}
        data-place={place}
        data-testid={`grouped-${name}`}
      >
        {role}
      </span>
    );
  };
  /**
   * An officer's or an address's line under a business: its name, with its
   * icon where the host asks, and the role at the right. Every line is an
   * option; one that is not a pick is disabled, and the keys pass over it.
   */
  const listedLine = (
    line: EntityType,
    related: RelatedItem,
    option: GroupedOption | null,
    key: string,
  ) => {
    // An option either way: a disabled one is marked so and passed over.
    const index = optionIndex++;
    const props = combobox.getItemProps({
      item: { option, label: related.label },
      index,
    });
    const trailingBadge = lineField(`${line}TrailingBadge`, related);
    const trailing = lineField(`${line}Trailing`, related);
    return (
      <div
        {...props}
        key={key}
        className={cx("groupLine", "bl-ac-group-line")}
        data-line={line}
        data-testid={`${line}-line`}
        data-enabled={option !== null ? "true" : undefined}
        data-highlighted={highlightedIndex === index ? "true" : undefined}
        data-matched={related.matched ? "true" : undefined}
      >
        <span className={cx("corner", "bl-ac-group-lead")} data-corner="lead">
          {iconOf(
            line === "person" ? "personName" : "addressName",
            related.type,
            related.role,
          )}
          <span className={cx("lineName", "bl-ac-line-name")}>
            {related.label}
          </span>
          {lineField(`${line}Badge`, related)}
        </span>
        {(trailingBadge || trailing) && (
          <span
            className={cx("corner", "bl-ac-group-trailing")}
            data-corner="trailing"
          >
            {trailingBadge}
            {trailing}
          </span>
        )}
      </div>
    );
  };

  const menu = useRef<HTMLDivElement>(null);
  const roleColumnStyle = useRoleColumn(
    menu,
    rowLines.flatMap(lines =>
      lines.lists.flatMap(list =>
        list.lines.map(({ item: related }) =>
          related.role === null
            ? null
            : list.relation === "addresses"
              ? text.addressRoles[related.role]
              : text.personRoles[related.role],
        ),
      ),
    ),
    menuVisible,
  );

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
        ref={menu}
      >
        {/* The listbox holds the options and nothing else; the count row sits
            below it. Always mounted, as downshift requires of its menu. */}
        <div
          className={cx("list", "bl-ac-list")}
          style={roleColumnStyle}
          {...combobox.getMenuProps()}
        >
          {hasRows &&
            grouped &&
            suggestions.map((item, rowIndex) => {
              const lines = rowLines[rowIndex]!;
              const headId = `${id}-group-${rowIndex}`;
              const head = lines.head.option;
              const headIndex = optionIndex++;
              const highlighted = highlightedIndex === headIndex;
              const defaultRow = (
                <DefaultRow
                  item={item}
                  layout={layout}
                  look={look}
                  tokens={tokens}
                  text={text}
                  cx={cx}
                  stateFilter={appliedFilters?.state}
                  nameId={headId}
                  iconOf={iconOf}
                />
              );
              // What each list leaves out, which no option says: read as the
              // group's description.
              const describedBy = lines.lists.flatMap(list =>
                list.notShown > 0 ? [`${headId}-more-${list.relation}`] : [],
              );
              return (
                <div
                  key={item.token}
                  role="group"
                  aria-labelledby={headId}
                  aria-describedby={describedBy.join(" ") || undefined}
                  className={cx("group", "bl-ac-group")}
                  data-testid="business-group"
                >
                  <div
                    {...combobox.getItemProps({
                      item: { option: head, label: item.label },
                      index: headIndex,
                    })}
                    className={cx("row", "bl-ac-row")}
                    data-highlighted={highlighted ? "true" : undefined}
                    data-enabled={head !== null ? "true" : undefined}
                    data-testid="business-suggestion"
                  >
                    {renderRow
                      ? renderRow({
                          item,
                          index: rowIndex,
                          highlighted,
                          defaultRow,
                        })
                      : defaultRow}
                  </div>
                  {lines.lists.map(list => (
                    <div key={list.relation} data-list={list.relation}>
                      {list.lines.map(({ item: related, option }, itemIndex) =>
                        listedLine(
                          list.line,
                          related,
                          option,
                          `${list.line}-${itemIndex}`,
                        ),
                      )}
                      {list.notShown > 0 && (
                        <div
                          id={`${headId}-more-${list.relation}`}
                          className={cx("more", "bl-ac-more")}
                        >
                          {text.moreNotShown(list.notShown)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
          {hasRows &&
            !grouped &&
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
                  iconOf={iconOf}
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
      {/* After the menu, which floats over it: it sits right under the field. */}
      {selection !== null && (
        <div
          id={selectionId}
          className={cx("selection", "bl-ac-selection")}
          data-type={selection.type}
          data-testid="grouped-selection"
        >
          {selection.label}
        </div>
      )}
    </div>
  );
}
