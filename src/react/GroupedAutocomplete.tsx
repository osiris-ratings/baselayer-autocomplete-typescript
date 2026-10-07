import {
  useEffect,
  useRef,
  type ReactElement,
  type ReactNode,
  type Ref,
} from "react";

import {
  ADDRESS_ROW,
  PERSON_ROW,
  ROUTES,
  businessPickFrom,
  defaultMint,
  drawnLayout,
  formatFound,
  groupedLines,
  groupedOptions,
  partsFor,
  queryTokens,
  requestFor,
  resolveLayout,
  resolveLook,
  type AddressRowLayout,
  type AddressRowLayoutInput,
  type AddressSuggestion,
  type AutocompleteClient,
  type BusinessPick,
  type EntityPick,
  type EntityType,
  type FiltersByRelation,
  type GroupedOption,
  type GroupedRequest,
  type IncludeOf,
  type LookInput,
  type MintFunction,
  type PersonRowLayout,
  type PersonRowLayoutInput,
  type PersonSuggestion,
  type RelatedItem,
  type RelatedSet,
  type Relation,
  type SuggestionByRelation,
} from "@baselayer-sdk/autocomplete";

import type { MintTiming } from "./BusinessAutocomplete";
import { useAutocompleteClient, useResolvedClient } from "./context";
import { resolveMessages, type AutocompleteMessages } from "./messages";
import { useEntityAutocomplete } from "./useBusinessAutocomplete";
import { useSuggestionCombobox } from "./useBusinessCombobox";
import {
  StateSquares,
  classes,
  lookVariables,
  marked,
  type SlotName,
} from "./viewParts";

/** The routes whose rows lead to businesses: a person, an address. */
type GroupedRoute = "people" | "addresses";

type GroupedRow = PersonSuggestion | AddressSuggestion;

/** How a host lays out each route's rows: `PERSON_ROW`'s places, or `ADDRESS_ROW`'s. */
interface LayoutInputByRoute {
  people: PersonRowLayoutInput;
  addresses: AddressRowLayoutInput;
}

/** A pickable line as the combobox holds it: what it hands, and its name. */
interface OptionItem {
  option: GroupedOption;
  label: string;
}

/**
 * Where a pick goes. A business always goes to `onPick`; a person or an
 * address can be picked only where `pickable` names it, and goes to
 * `onPickEntity`, which is then required.
 */
type PickTargets =
  | {
      /** Which lines can be picked, by type. Default: businesses. */
      pickable?: readonly "business"[] | undefined;
      onPickEntity?: ((pick: EntityPick) => void) | undefined;
    }
  | {
      pickable: readonly EntityType[];
      /** A person or an address picked: the row itself, or one it lists. */
      onPickEntity(pick: EntityPick): void;
    };

interface GroupedCommonProps<R extends GroupedRoute> {
  id: string;
  /** The text typed: a person's name, or an address. */
  value: string;
  onChange(value: string): void;
  /**
   * A business picked from under a person or an address. The field keeps what
   * was typed: put `pick.businessName` in your business name field.
   */
  onPick(pick: BusinessPick): void;
  /**
   * The relations listed under each row, a line per item: businesses by
   * default; a person's addresses, an address's people. A relation the
   * session's scope does not grant is left out.
   */
  include?: readonly IncludeOf<R>[];
  /**
   * The field each place of a row's lines shows (`PERSON_ROW`, `ADDRESS_ROW`).
   * The request asks for whatever it draws.
   */
  layout?: LayoutInputByRoute[R];
  onFocus?: () => void;
  onBlur?: () => void;
  name?: string;
  inputRef?: Ref<HTMLInputElement>;
  /** Off, the field is a plain input and nothing is asked. Default on. */
  enabled?: boolean;
  /** When the session is minted: on focus, on the first keystroke (the default), or with the first request. */
  mintOn?: MintTiming;
  filters?: FiltersByRelation[R];
  limit?: number;
  minChars?: number;
  debounceMs?: number;
  look?: LookInput;
  messages?: Partial<AutocompleteMessages>;
  label?: ReactNode;
  renderLabel?: (labelProps: Record<string, unknown>) => ReactElement;
  renderInput?: (inputProps: Record<string, unknown>) => ReactElement;
  classNames?: Partial<Record<SlotName, string>>;
  unstyled?: boolean;
  /** Hold the menu open whatever focus does: a style preview. */
  open?: boolean;
  /**
   * The menu as wide as the input (the default), or, `false`, as wide as
   * `--bl-ac-menu-width` from 48em up.
   */
  menuFollowsInputWidth?: boolean;
  /** The deployment cannot mint (503 code 481), or can again. */
  onUnavailable?: (state: { unavailable: boolean }) => void;
}

/** One of: a client, a `mint` function, or a `mintUrl` on the host's backend. */
type Source =
  | {
      client: AutocompleteClient;
      mint?: never;
      mintUrl?: never;
      baseUrl?: never;
    }
  | { mint: MintFunction; baseUrl: string; client?: never; mintUrl?: never }
  | { mintUrl: string; baseUrl: string; client?: never; mint?: never };

export type PersonAutocompleteProps = GroupedCommonProps<"people"> &
  PickTargets &
  Source;
export type AddressAutocompleteProps = GroupedCommonProps<"addresses"> &
  PickTargets &
  Source;

/**
 * Find a business through a person: type a name, and each person who fits
 * comes with the businesses they hold a role on, each one a pick.
 */
export function PersonAutocomplete(props: PersonAutocompleteProps) {
  return <Grouped route="people" {...props} />;
}

/**
 * Find a business through an address: type an address, and each one that fits
 * comes with the businesses filed there, each one a pick.
 */
export function AddressAutocomplete(props: AddressAutocompleteProps) {
  return <Grouped route="addresses" {...props} />;
}

type ConnectedProps<R extends GroupedRoute> = GroupedCommonProps<R> &
  PickTargets & { route: R };

function Grouped<R extends GroupedRoute>(props: ConnectedProps<R> & Source) {
  const { client, mint, mintUrl, baseUrl, ...common } = props;
  if (client !== undefined) {
    return <Connected {...common} client={client} />;
  }
  return (
    <OwnClient
      {...common}
      baseUrl={baseUrl as string}
      mint={mint ?? defaultMint(mintUrl as string)}
    />
  );
}

function OwnClient<R extends GroupedRoute>({
  baseUrl,
  mint,
  ...common
}: ConnectedProps<R> & { baseUrl: string; mint: MintFunction }) {
  // The first mint function is kept for the component's life, so an inline
  // `mint` or a re-rendered `mintUrl` does not re-create the client.
  const mintRef = useRef(mint);
  const client = useAutocompleteClient({ baseUrl, mint: mintRef.current });
  return <Connected {...common} client={client} />;
}

/** The layout as a route's rows draw it. */
function drawnFor(
  route: GroupedRoute,
  input: PersonRowLayoutInput | AddressRowLayoutInput | undefined,
): PersonRowLayout | AddressRowLayout {
  return route === "people"
    ? drawnLayout(
        PERSON_ROW,
        resolveLayout(PERSON_ROW, input as PersonRowLayoutInput | undefined),
      )
    : drawnLayout(
        ADDRESS_ROW,
        resolveLayout(ADDRESS_ROW, input as AddressRowLayoutInput),
      );
}

/** `requestFor` on either route. */
function requestOf(
  route: GroupedRoute,
  layout: PersonRowLayout | AddressRowLayout,
  include: readonly Relation[] | undefined,
): GroupedRequest<GroupedRoute> {
  return route === "people"
    ? requestFor(
        "people",
        layout as PersonRowLayout,
        include as IncludeOf<"people">[] | undefined,
      )
    : requestFor(
        "addresses",
        layout as AddressRowLayout,
        include as IncludeOf<"addresses">[] | undefined,
      );
}

function Connected<R extends GroupedRoute>({
  route,
  client: given,
  value,
  onChange,
  onPick,
  onPickEntity,
  include,
  layout,
  onFocus,
  onBlur,
  name,
  enabled = true,
  mintOn = "keystroke",
  filters,
  limit,
  minChars,
  debounceMs,
  messages,
  onUnavailable,
  ...view
}: ConnectedProps<R> & { client: AutocompleteClient }) {
  const client = useResolvedClient(given);
  // What the rows draw decides what is asked for; the hook drops whatever the
  // session's scope does not grant.
  const request = requestOf(route, drawnFor(route, layout), include);
  const { unavailable, ...state } = useEntityAutocomplete<R>({
    relation: route,
    client,
    query: value,
    enabled,
    include: request.include as IncludeOf<R>[],
    ...(filters !== undefined ? { filters } : {}),
    ...(limit !== undefined ? { limit } : {}),
    ...(minChars !== undefined ? { minChars } : {}),
    ...(debounceMs !== undefined ? { debounceMs } : {}),
    ...(messages !== undefined ? { messages } : {}),
  });
  const reported = useRef(false);
  useEffect(() => {
    if (unavailable !== reported.current) {
      reported.current = unavailable;
      onUnavailable?.({ unavailable });
    }
  }, [unavailable, onUnavailable]);

  return (
    <GroupedView
      {...view}
      route={route}
      value={value}
      inputName={name}
      messages={messages}
      include={request.listed as IncludeOf<R>[]}
      layout={layout}
      suggestions={state.suggestions}
      found={state.found}
      foundCapped={state.foundCapped}
      truncated={state.truncated}
      indexTag={state.indexTag}
      roundTripMs={state.roundTripMs}
      isSearching={state.isSearching}
      error={state.error}
      onInputChange={next => {
        if (mintOn === "keystroke" && enabled && next !== "") {
          client.prewarm();
        }
        onChange(next);
      }}
      onSelect={option =>
        option.kind === "business"
          ? onPick(businessPickFrom(option.row, option.business, Date.now()))
          : onPickEntity?.(option.pick)
      }
      onInputFocus={() => {
        if (mintOn === "focus" && enabled) {
          client.prewarm();
        }
        onFocus?.();
      }}
      onInputBlur={onBlur}
    />
  );
}

interface GroupedViewCommonProps<R extends GroupedRoute> {
  id: string;
  /** The input's value; the host owns it. */
  value: string;
  /** Typing only; a pick reports through `onSelect`. */
  onInputChange(value: string): void;
  /**
   * A pickable line picked: a business, with the row it was reached through
   * (`businessPickFrom` makes the `BusinessPick`), or a person or an address.
   */
  onSelect(option: GroupedOption): void;
  onInputFocus?: (() => void) | undefined;
  onInputBlur?: (() => void) | undefined;
  inputName?: string | undefined;
  inputRef?: Ref<HTMLInputElement> | undefined;

  suggestions: SuggestionByRelation[R][];
  found: number;
  foundCapped: boolean;
  truncated: boolean;
  indexTag: string | null;
  roundTripMs: number | null;
  isSearching: boolean;
  error: string | null;
  /** The relations listed under each row, a line per item. Default: businesses. */
  include?: readonly IncludeOf<R>[] | undefined;
  /** Which lines can be picked, by type. Default: businesses. */
  pickable?: readonly EntityType[] | undefined;
  /** The field each place of a row's lines shows. */
  layout?: LayoutInputByRoute[R] | undefined;
  /** Hold the menu open whatever focus does: a style preview. */
  open?: boolean | undefined;
  /**
   * The menu as wide as the input (the default), or, `false`, as wide as
   * `--bl-ac-menu-width` from 48em up.
   */
  menuFollowsInputWidth?: boolean | undefined;
  look?: LookInput | undefined;
  messages?: Partial<AutocompleteMessages> | undefined;
  label?: ReactNode;
  renderLabel?:
    ((labelProps: Record<string, unknown>) => ReactElement) | undefined;
  renderInput?:
    ((inputProps: Record<string, unknown>) => ReactElement) | undefined;
  classNames?: Partial<Record<SlotName, string>> | undefined;
  unstyled?: boolean | undefined;
}

export type PersonAutocompleteViewProps = GroupedViewCommonProps<"people">;
export type AddressAutocompleteViewProps = GroupedViewCommonProps<"addresses">;

/**
 * The styled people typeahead, with the state supplied by the host
 * (`useEntityAutocomplete` on the people route, asking for what
 * `requestFor` says).
 */
export function PersonAutocompleteView(props: PersonAutocompleteViewProps) {
  return <GroupedView {...props} route="people" />;
}

/**
 * The styled address typeahead, with the state supplied by the host
 * (`useEntityAutocomplete` on the addresses route, asking for what
 * `requestFor` says).
 */
export function AddressAutocompleteView(props: AddressAutocompleteViewProps) {
  return <GroupedView {...props} route="addresses" />;
}

/** A line of a row: its head, or one item of a listed relation. */
type LineOf =
  { line: "head"; row: GroupedRow } | { line: EntityType; item: RelatedItem };

function optionLabel(option: GroupedOption): string {
  return option.kind === "business" ? option.business.label : option.pick.label;
}

function GroupedView<R extends GroupedRoute>({
  route,
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
  include,
  pickable,
  layout: layoutInput,
  open = false,
  menuFollowsInputWidth = true,
  look: lookInput,
  messages,
  label,
  renderLabel,
  renderInput,
  classNames,
  unstyled = false,
}: GroupedViewCommonProps<R> & { route: R }) {
  const text = resolveMessages(messages);
  const look = resolveLook(lookInput ?? {});
  const cx = classes(unstyled, classNames);
  const drawnLayout = drawnFor(route, layoutInput);
  const layout: Readonly<Record<string, string | null>> = drawnLayout;
  const { listed } = requestOf(route, drawnLayout, include);
  const rows: GroupedRow[] = suggestions;
  const drawn = rows.map(row => ({
    row,
    lines: groupedLines(row, listed, pickable),
  }));
  const items: OptionItem[] = drawn.flatMap(({ lines }) =>
    groupedOptions(lines).map(option => ({
      option,
      label: optionLabel(option),
    })),
  );
  const hasFooter = isSearching || error !== null || roundTripMs !== null;
  const combobox = useSuggestionCombobox({
    id,
    items,
    inputValue: value,
    onInputChange,
    onPick: item => onSelect(item.option),
    hasFooter,
    open,
  });
  const tokens = queryTokens(value);
  const region = look.matchEmphasisRegion;
  const markClass = cx("mark", "bl-ac-mark");
  const entity = route === "people" ? "person" : "address";
  const hasRows = combobox.isOpen && rows.length > 0;
  const hasCountRow = combobox.isOpen && hasFooter;

  function countRowLabel(): string {
    if (isSearching && rows.length === 0) {
      return text.searching;
    }
    if (truncated) {
      return rows.length === 0 ? text.truncatedNoRows : text.truncatedRows;
    }
    const one = found === 1 && !foundCapped;
    const noun =
      route === "people"
        ? one
          ? text.person
          : text.people
        : one
          ? text.address
          : text.addresses;
    return `${formatFound(found, foundCapped)} ${noun}`;
  }

  /** The role an item's line draws, read the way its line reads it. */
  function roleText(of: LineOf): string | null {
    if (of.line === "head" || of.item.role === null) {
      return null;
    }
    // Under an address, a business holds it in some role; everywhere else
    // the role is a person's.
    return route === "addresses" && of.line === "business"
      ? text.addressRoles[of.item.role]
      : text.personRoles[of.item.role];
  }

  /** The head's counts: every relation the row answers a count for. */
  function countsText(row: GroupedRow): string | null {
    const related: Partial<Record<Relation, RelatedSet>> = row.related;
    const counts = ROUTES[route].includes.flatMap(relation => {
      const count = related[relation]?.count;
      return count === undefined || count === null
        ? []
        : [text.relationCounts[relation](count)];
    });
    return counts.length > 0 ? counts.join(" · ") : null;
  }

  /** A field as drawn in `place` on a line, or nothing where the line has no value for it. */
  function field(
    name: string | null,
    place: string,
    of: LineOf,
    countId: string,
  ): ReactNode {
    switch (name) {
      case "firstAddress": {
        if (of.line !== "head" || of.row.type !== "person") {
          return null;
        }
        const { items, count } = of.row.related.addresses;
        const first = items[0];
        if (first === undefined) {
          return null;
        }
        const more = (count ?? items.length) - 1;
        return (
          <span
            className={cx("address", "bl-ac-address")}
            data-place={place}
            data-testid="grouped-firstAddress"
          >
            {first.label}
            {more > 0 ? ` ${text.more(more)}` : ""}
          </span>
        );
      }
      case "counts": {
        const counts = of.line === "head" ? countsText(of.row) : null;
        return (
          counts !== null && (
            <span
              id={countId}
              className={cx("counts", "bl-ac-group-count")}
              data-place={place}
              data-testid="grouped-counts"
            >
              {counts}
            </span>
          )
        );
      }
      case "address":
        return (
          of.line !== "head" &&
          of.item.address !== null && (
            <span
              className={cx("address", "bl-ac-address")}
              data-place={place}
              data-testid="grouped-address"
            >
              {of.item.address}
            </span>
          )
        );
      case "states":
        return (
          of.line !== "head" &&
          (of.item.states?.length ?? 0) > 0 && (
            <StateSquares
              business={of.item}
              matched={[]}
              cx={cx}
              more={text.more}
              place={place}
            />
          )
        );
      case "role":
      case "addressRole":
      case "personRole": {
        const role = roleText(of);
        return (
          role !== null && (
            <span
              className={cx("role", "bl-ac-role")}
              data-place={place}
              data-testid={`grouped-${name}`}
            >
              {role}
            </span>
          )
        );
      }
      default:
        return null;
    }
  }

  const labelProps = combobox.getLabelProps() as Record<string, unknown>;
  const inputProps = combobox.getInputProps({
    ref: inputRef,
    name: inputName,
    onFocus: onInputFocus,
    onBlur: onInputBlur,
    autoComplete: "off",
  });

  let optionIndex = 0;
  /**
   * One line: its name and badge, then its trailing corner. A pickable line
   * is an option the keys and the pointer move to; any other line is inert.
   */
  function line(
    key: string,
    of: LineOf,
    option: GroupedOption | null,
    name: ReactNode,
    headId: string,
  ) {
    const index = option === null ? null : optionIndex++;
    const highlighted = index !== null && combobox.highlightedIndex === index;
    const countId = `${headId}-count`;
    const at = (place: string) =>
      field(layout[place] ?? null, place, of, countId);
    const badge = at(`${of.line}Badge`);
    const trailingBadge = at(`${of.line}TrailingBadge`);
    const trailing = at(`${of.line}Trailing`);
    const props =
      option === null || index === null
        ? {}
        : combobox.getItemProps({
            item: { option, label: optionLabel(option) },
            index,
          });
    return (
      <div
        {...props}
        key={key}
        className={
          of.line === "head"
            ? cx("groupHead", "bl-ac-group-head")
            : cx("groupLine", "bl-ac-group-line")
        }
        data-line={of.line}
        data-testid={of.line === "head" ? "group-head" : `${of.line}-line`}
        data-pickable={option !== null ? "true" : undefined}
        data-highlighted={highlighted ? "true" : undefined}
        data-matched={
          of.line !== "head" && of.item.matched ? "true" : undefined
        }
      >
        <span className={cx("corner", "bl-ac-group-lead")} data-corner="lead">
          {name}
          {badge}
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
  }

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
        data-open={combobox.menuVisible ? "true" : "false"}
        data-width={menuFollowsInputWidth ? undefined : "fixed"}
        hidden={!combobox.menuVisible}
      >
        <div className={cx("list", "bl-ac-list")} {...combobox.getMenuProps()}>
          {hasRows &&
            drawn.map(({ row, lines }, rowIndex) => {
              const headId = `${id}-group-${rowIndex}`;
              const parts = look.matchEmphasis !== "plain" ? row.highlight : [];
              const counted =
                Object.values(layout).includes("counts") &&
                countsText(row) !== null;
              const moreIds = lines.lists
                .filter(list => list.notShown > 0)
                .map(list => `${headId}-more-${list.relation}`);
              return (
                <div
                  key={row.token}
                  role="group"
                  aria-labelledby={headId}
                  // The counts, and how many each list leaves out: what the
                  // lines alone do not say.
                  aria-describedby={
                    [...(counted ? [`${headId}-count`] : []), ...moreIds].join(
                      " ",
                    ) || undefined
                  }
                  className={cx("group", "bl-ac-group")}
                  data-testid={`${entity}-suggestion`}
                >
                  {line(
                    "head",
                    { line: "head", row },
                    lines.head.option,
                    <span
                      id={headId}
                      className={cx("name", "bl-ac-name")}
                      data-emphasis={look.matchEmphasis}
                      data-region={region}
                    >
                      {marked(
                        row.label,
                        partsFor(row.label, parts, region, tokens),
                        markClass,
                        `${entity}-suggestion-match`,
                      )}
                    </span>,
                    headId,
                  )}
                  {lines.lists.map(list => (
                    <div key={list.relation} data-list={list.relation}>
                      {list.lines.map(({ item, option }, itemIndex) =>
                        line(
                          String(itemIndex),
                          { line: list.line, item },
                          option,
                          <span className={cx("lineName", "bl-ac-line-name")}>
                            {item.label}
                          </span>,
                          headId,
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
        </div>
        {hasCountRow && (
          <div
            className={cx("footer", "bl-ac-footer")}
            data-rows={hasRows ? "true" : undefined}
            data-testid={`${entity}-suggestions-footer`}
            {...combobox.getFooterProps()}
          >
            <span className={cx("count", "bl-ac-count")}>
              {error ?? countRowLabel()}
            </span>
            {look.showDebugInfo && roundTripMs !== null && (
              <span className={cx("debug", "bl-ac-debug")}>
                {roundTripMs} ms{indexTag !== null ? ` · ${indexTag}` : ""}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
