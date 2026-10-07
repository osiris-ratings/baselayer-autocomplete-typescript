import {
  useEffect,
  useRef,
  type ReactElement,
  type ReactNode,
  type Ref,
} from "react";

import {
  businessPickFrom,
  defaultMint,
  formatFound,
  partsFor,
  pickableBusinesses,
  queryTokens,
  resolveLook,
  type AutocompleteClient,
  type BusinessPick,
  type FiltersByRelation,
  type IncludeOf,
  type LookInput,
  type MintFunction,
  type PickableBusiness,
  type SuggestionByRelation,
} from "@baselayer-sdk/autocomplete";

import type { MintTiming } from "./BusinessAutocomplete";
import { useAutocompleteClient, useResolvedClient } from "./context";
import { resolveMessages, type AutocompleteMessages } from "./messages";
import { useEntityAutocomplete } from "./useBusinessAutocomplete";
import { useSuggestionCombobox } from "./useBusinessCombobox";
import {
  classes,
  lookVariables,
  marked,
  type ClassFor,
  type SlotName,
} from "./viewParts";

/** The routes whose rows lead to businesses: a person, an address. */
type GroupedRoute = "people" | "addresses";

/** One business to pick, under the row it is reached through. */
interface BusinessOption<R extends GroupedRoute> {
  row: SuggestionByRelation[R];
  business: PickableBusiness;
  /** The business's name: what the combobox reads. */
  label: string;
}

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

export type PersonAutocompleteProps = GroupedCommonProps<"people"> & Source;
export type AddressAutocompleteProps = GroupedCommonProps<"addresses"> & Source;

/**
 * Find a business through a person: type a name, and each person who fits
 * comes with the businesses they hold a role on, each one a pick.
 */
export function PersonAutocomplete(props: PersonAutocompleteProps) {
  return <Grouped route="people" {...props} />;
}

/**
 * Find a business through an address: type an address, and each one that fits
 * comes with how many businesses are filed there and the first of them, each
 * one a pick.
 */
export function AddressAutocomplete(props: AddressAutocompleteProps) {
  return <Grouped route="addresses" {...props} />;
}

function Grouped<R extends GroupedRoute>(
  props: GroupedCommonProps<R> & Source & { route: R },
) {
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
}: GroupedCommonProps<R> & { route: R; baseUrl: string; mint: MintFunction }) {
  // The first mint function is kept for the component's life, so an inline
  // `mint` or a re-rendered `mintUrl` does not re-create the client.
  const mintRef = useRef(mint);
  const client = useAutocompleteClient({ baseUrl, mint: mintRef.current });
  return <Connected {...common} client={client} />;
}

function Connected<R extends GroupedRoute>({
  route,
  client: given,
  value,
  onChange,
  onPick,
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
}: GroupedCommonProps<R> & { route: R; client: AutocompleteClient }) {
  const client = useResolvedClient(given);
  const { unavailable, ...state } = useEntityAutocomplete<R>({
    relation: route,
    client,
    query: value,
    enabled,
    // The businesses are what a pick spends; nothing else is drawn.
    include: ["businesses"] as IncludeOf<R>[],
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
      onSelect={(row, business) =>
        onPick(businessPickFrom(row, business, Date.now()))
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
  /** A business picked from under `row`; `businessPickFrom` makes the pick. */
  onSelect(row: SuggestionByRelation[R], business: PickableBusiness): void;
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
 * (`useEntityAutocomplete` on the people route).
 */
export function PersonAutocompleteView(props: PersonAutocompleteViewProps) {
  return <GroupedView {...props} route="people" />;
}

/**
 * The styled address typeahead, with the state supplied by the host
 * (`useEntityAutocomplete` on the addresses route).
 */
export function AddressAutocompleteView(props: AddressAutocompleteViewProps) {
  return <GroupedView {...props} route="addresses" />;
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
  const rows: SuggestionByRelation[GroupedRoute][] = suggestions;
  const options: BusinessOption<GroupedRoute>[] = rows.flatMap(row =>
    pickableBusinesses(row).map(business => ({
      row,
      business,
      label: business.label,
    })),
  );
  const hasFooter = isSearching || error !== null || roundTripMs !== null;
  const combobox = useSuggestionCombobox({
    id,
    items: options,
    inputValue: value,
    onInputChange,
    onPick: ({ row, business }) =>
      onSelect(row as SuggestionByRelation[R], business),
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

  const labelProps = combobox.getLabelProps() as Record<string, unknown>;
  const inputProps = combobox.getInputProps({
    ref: inputRef,
    name: inputName,
    onFocus: onInputFocus,
    onBlur: onInputBlur,
    autoComplete: "off",
  });

  let optionIndex = 0;
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
            rows.map((row, rowIndex) => {
              const headId = `${id}-group-${rowIndex}`;
              const countId = `${headId}-count`;
              const moreId = `${headId}-more`;
              const pickable = pickableBusinesses(row);
              const { count } = row.related.businesses;
              const notShown = (count ?? pickable.length) - pickable.length;
              const parts = look.matchEmphasis !== "plain" ? row.highlight : [];
              return (
                <div
                  key={row.token}
                  role="group"
                  aria-labelledby={headId}
                  // How many it leads to, and how many the row leaves out:
                  // what the options alone do not say.
                  aria-describedby={
                    [
                      count !== null ? countId : null,
                      notShown > 0 ? moreId : null,
                    ]
                      .filter(Boolean)
                      .join(" ") || undefined
                  }
                  className={cx("group", "bl-ac-group")}
                  data-testid={`${entity}-suggestion`}
                >
                  <div className={cx("groupHead", "bl-ac-group-head")}>
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
                    </span>
                    {count !== null && (
                      <span
                        id={countId}
                        className={cx("groupCount", "bl-ac-group-count")}
                      >
                        {route === "people"
                          ? text.businessesOfPerson(count)
                          : text.businessesAtAddress(count)}
                      </span>
                    )}
                  </div>
                  {pickable.map(business => {
                    const index = optionIndex++;
                    const highlighted = combobox.highlightedIndex === index;
                    return (
                      <BusinessRow
                        key={business.token}
                        business={business}
                        role={
                          business.role === null
                            ? null
                            : route === "people"
                              ? text.personBusinessRoles[business.role]
                              : text.addressBusinessRoles[business.role]
                        }
                        highlighted={highlighted}
                        cx={cx}
                        itemProps={combobox.getItemProps({
                          item: { row, business, label: business.label },
                          index,
                        })}
                      />
                    );
                  })}
                  {notShown > 0 && (
                    <div id={moreId} className={cx("more", "bl-ac-more")}>
                      {text.moreBusinesses(notShown)}
                    </div>
                  )}
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

function BusinessRow({
  business,
  role,
  highlighted,
  cx,
  itemProps,
}: {
  business: PickableBusiness;
  role: string | null;
  highlighted: boolean;
  cx: ClassFor;
  itemProps: Record<string, unknown>;
}) {
  return (
    <div
      {...itemProps}
      className={cx("option", "bl-ac-option")}
      data-highlighted={highlighted ? "true" : undefined}
      data-matched={business.matched ? "true" : undefined}
      data-testid="business-option"
    >
      <span className={cx("optionName", "bl-ac-option-name")}>
        {business.label}
      </span>
      {role !== null && (
        <span className={cx("role", "bl-ac-role")}>{role}</span>
      )}
    </div>
  );
}
