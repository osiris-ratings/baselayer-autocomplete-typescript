import {
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type Ref,
} from "react";

import type { Filters } from "@baselayer-sdk/autocomplete";
import type { AutocompleteClient } from "@baselayer-sdk/autocomplete";
import type {
  BusinessRowLayoutInput,
  LookInput,
} from "@baselayer-sdk/autocomplete";
import { defaultMint, type MintFunction } from "@baselayer-sdk/autocomplete";
import { BUSINESS_TOKEN_TTL_SECONDS } from "@baselayer-sdk/autocomplete";
import {
  BUSINESS_ROW,
  drawnLayout,
  requestFor,
  resolveLayout,
  type Include,
} from "@baselayer-sdk/autocomplete";
import {
  matchedOn,
  pickedNameOf,
  type BusinessSuggestion,
  type MatchedOn,
} from "@baselayer-sdk/autocomplete";

import {
  BusinessAutocompleteView,
  type RowRenderProps,
  type SlotName,
} from "./BusinessAutocompleteView";
import { useAutocompleteClient, useResolvedClient } from "./context";
import type { IconSet } from "./icons";
import { usePickedSelection, type PickTargets } from "./selection";
import type { AutocompleteMessages } from "./messages";
import {
  filtersKeyOf,
  useBusinessAutocomplete,
} from "./useBusinessAutocomplete";

/**
 * When the component mints its session. `focus` (the default) mints as the
 * field takes focus, an eager prewarm: the first request pays only for its
 * suggestions, and a focus that types nothing still spends a mint.
 * `keystroke` mints on the first keystroke, a prewarm that overlaps the
 * characters still to come and the pause before asking. `request` mints with
 * the first request, lazily: nothing until there is something to ask, and the
 * first answer waits for the mint.
 */
export const MINT_TIMINGS = ["focus", "keystroke", "request"] as const;
export type MintTiming = (typeof MINT_TIMINGS)[number];

export interface Pick {
  /** The sealed token to send as `business_token` on `POST /searches`. */
  businessToken: string;
  pickedAt: number;
  /** Advisory: `pickedAt + BUSINESS_TOKEN_TTL_SECONDS`. */
  expiresAt: number;
  /**
   * What the picked row matched on besides its name (`matchedOn`): the
   * officers, the address, the states. Empty when only the name matched. A
   * search made from the token needs none of it: the officer a person filter
   * matched is recorded from the token itself.
   */
  matchedOn: MatchedOn[];
}

interface CommonProps {
  id: string;
  value: string;
  /**
   * Typing, and a pick's fill: the name the row matched on (`pickedNameOf`).
   * The pick itself reports through `onPick`.
   */
  onChange(value: string): void;
  onPick(suggestion: BusinessSuggestion, pick: Pick): void;
  onFocus?: () => void;
  onBlur?: () => void;
  name?: string;
  inputRef?: Ref<HTMLInputElement>;
  /** Off, the field is a plain input and nothing is asked. Default on. */
  enabled?: boolean;
  /** When the session is minted: on focus, on the first keystroke (the default), or with the first request. */
  mintOn?: MintTiming;
  filters?: Filters;
  limit?: number;
  minChars?: number;
  debounceMs?: number;
  look?: LookInput;
  messages?: Partial<AutocompleteMessages>;
  label?: ReactNode;
  renderLabel?: (labelProps: Record<string, unknown>) => ReactElement;
  renderInput?: (inputProps: Record<string, unknown>) => ReactElement;
  renderRow?: (props: RowRenderProps) => ReactNode;
  classNames?: Partial<Record<SlotName, string>>;
  unstyled?: boolean;
  /**
   * Hold the menu open whatever focus does: a style preview, a design tool.
   * It still shows only what there is to show.
   */
  open?: boolean;
  /**
   * The field each place of a row shows (`BUSINESS_ROW`: the head's
   * `ROW_PLACES` and `ROW_FIELDS`, the icon before the name, and the lines it
   * lists); a place left out keeps its default field unless it is placed
   * elsewhere, and null leaves a place empty. The placed fields also decide
   * what is fetched, unless `include` says.
   */
  layout?: BusinessRowLayoutInput;
  /**
   * The relations listed under each row, a line per item: the business's
   * officers and agents (`people`), its `addresses`. None by default, and
   * then each row is the one option it has always been.
   */
  list?: Include[];
  /** The icon before each name, per entity; `false` draws none. */
  icons?: IconSet;
  /**
   * After a pick from a line under a row, a line under the field names it
   * (the default), while the field holds the business's name. Off, draw your
   * own from `onPickEntity`.
   */
  showSelection?: boolean;
  /**
   * The related entities the autocomplete service expands for each row: by
   * default what `layout` places (`includeForLayout(layout)`). A host drawing
   * its own rows with `renderRow` names what they read. Empty leaves it to the
   * autocomplete service.
   */
  include?: Include[];
  /**
   * The menu as wide as the input (the default), or, `false`, as wide as
   * `--bl-ac-menu-width` from 48em up.
   */
  menuFollowsInputWidth?: boolean;
  /** The deployment cannot mint (503 code 481), or can again. */
  onUnavailable?: (state: { unavailable: boolean }) => void;
}

/** One of: a client, a `mint` function, or a `mintUrl` on the host's backend. */
export type BusinessAutocompleteProps = CommonProps &
  PickTargets &
  (
    | {
        client: AutocompleteClient;
        mint?: never;
        mintUrl?: never;
        baseUrl?: never;
      }
    | { mint: MintFunction; baseUrl: string; client?: never; mintUrl?: never }
    | { mintUrl: string; baseUrl: string; client?: never; mint?: never }
  );

/**
 * The typeahead, connected: it owns its client (unless given one), its
 * suggestions and its pick. A pick fills the field with the name the row
 * matched on (`pickedNameOf`: the family's name, or the name it goes by when
 * the row matched that) and hands the host the `business_token`; editing the
 * name afterwards is the host's cue to drop it.
 */
export function BusinessAutocomplete(props: BusinessAutocompleteProps) {
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

function OwnClient({
  baseUrl,
  mint,
  ...common
}: CommonProps & { baseUrl: string; mint: MintFunction }) {
  // The first mint function is kept for the component's life, so an inline
  // `mint` or a re-rendered `mintUrl` does not re-create the client.
  const mintRef = useRef(mint);
  const client = useAutocompleteClient({ baseUrl, mint: mintRef.current });
  return <Connected {...common} client={client} />;
}

function Connected({
  client: given,
  id,
  value,
  onChange,
  onPick,
  onFocus,
  onBlur,
  name,
  inputRef,
  enabled = true,
  mintOn = "keystroke",
  filters,
  limit,
  minChars,
  debounceMs,
  look,
  messages,
  label,
  renderLabel,
  renderInput,
  renderRow,
  classNames,
  unstyled,
  open,
  layout,
  include: includeGiven,
  list,
  pickable,
  onPickEntity,
  icons,
  showSelection = true,
  menuFollowsInputWidth,
  onUnavailable,
}: CommonProps & PickTargets & { client: AutocompleteClient }) {
  const client = useResolvedClient(given);
  // A pick writes the name the row matched on into the field; querying that
  // exact name again would only reopen the menu on the row just chosen.
  // Editing a filter afterwards is a new search for the same name, so the pick
  // remembers the filters it was made under.
  const filtersKey = filtersKeyOf(filters);
  const [picked, setPicked] = useState<{
    name: string;
    filtersKey: string;
  } | null>(null);
  // A pick is of the filters it was made under. Once they change it is over,
  // and putting them back is not a return to it: the name is searched again,
  // and its rows are wanted. Set during the render, so that no frame has the
  // old pick holding the search off under the new filters.
  if (picked !== null && picked.filtersKey !== filtersKey) {
    setPicked(null);
  }
  const justPicked =
    picked !== null &&
    picked.name === value &&
    picked.filtersKey === filtersKey;
  // The fields drawn decide what is fetched unless the host says: a field
  // placed nowhere is not asked for. With none needing a related entity the
  // autocomplete service's default stands, since it refuses an empty include.
  const include =
    includeGiven ??
    requestFor(
      "businesses",
      drawnLayout(BUSINESS_ROW, resolveLayout(BUSINESS_ROW, layout)),
      list,
    ).include;
  const { selection, pick } = usePickedSelection(value, showSelection);
  const {
    unavailable,
    errorKind,
    filtersWithheld,
    appliedFilters,
    requestId,
    ...state
  } = useBusinessAutocomplete({
    client,
    query: value,
    enabled: enabled && !justPicked,
    ...(filters !== undefined ? { filters } : {}),
    ...(limit !== undefined ? { limit } : {}),
    ...(include.length > 0 ? { include } : {}),
    ...(minChars !== undefined ? { minChars } : {}),
    ...(debounceMs !== undefined ? { debounceMs } : {}),
    ...(messages !== undefined ? { messages } : {}),
  });
  void errorKind;
  void filtersWithheld;
  void requestId;
  const reported = useRef(false);
  useEffect(() => {
    if (unavailable !== reported.current) {
      reported.current = unavailable;
      onUnavailable?.({ unavailable });
    }
  }, [unavailable, onUnavailable]);

  return (
    <BusinessAutocompleteView
      id={id}
      value={value}
      inputName={name}
      inputRef={inputRef}
      onInputChange={next => {
        setPicked(null);
        if (mintOn === "keystroke" && enabled && next !== "") {
          client.prewarm();
        }
        onChange(next);
      }}
      onSelect={suggestion => {
        const pickedAt = Date.now();
        const name = pickedNameOf(suggestion);
        setPicked({ name, filtersKey });
        // The business itself picked: the field names it, no line under it.
        pick(name, null);
        onChange(name);
        onPick(suggestion, {
          businessToken: suggestion.token,
          pickedAt,
          expiresAt: pickedAt + BUSINESS_TOKEN_TTL_SECONDS * 1000,
          matchedOn: matchedOn(suggestion, { state: appliedFilters?.state }),
        });
      }}
      onSelectEntity={(entity, suggestion) => {
        // An officer or an address picked: the field takes the business's
        // name, and the line under it names who or what was picked.
        const name = pickedNameOf(suggestion);
        setPicked({ name, filtersKey });
        pick(name, { type: entity.type, label: entity.label });
        onChange(name);
        onPickEntity?.(entity);
      }}
      selection={selection}
      list={list}
      pickable={pickable}
      icons={icons}
      onInputFocus={() => {
        if (mintOn === "focus" && enabled) {
          client.prewarm();
        }
        onFocus?.();
      }}
      onInputBlur={onBlur}
      {...state}
      appliedFilters={appliedFilters}
      look={look}
      messages={messages}
      label={label}
      renderLabel={renderLabel}
      renderInput={renderInput}
      renderRow={renderRow}
      classNames={classNames}
      unstyled={unstyled}
      open={open}
      layout={layout}
      menuFollowsInputWidth={menuFollowsInputWidth}
    />
  );
}
