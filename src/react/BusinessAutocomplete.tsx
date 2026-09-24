import {
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type Ref,
} from "react";

import type { Filters } from "@baselayer/autocomplete";
import type { AutocompleteClient } from "@baselayer/autocomplete";
import type { LookInput, RowParts } from "@baselayer/autocomplete";
import { defaultMint, type MintFunction } from "@baselayer/autocomplete";
import { BUSINESS_TOKEN_TTL_SECONDS } from "@baselayer/autocomplete";
import { includeForParts, resolveParts } from "@baselayer/autocomplete";
import type { BusinessSuggestion } from "@baselayer/autocomplete";

import {
  BusinessAutocompleteView,
  type RowRenderProps,
  type SlotName,
} from "./BusinessAutocompleteView";
import { useAutocompleteClient, useResolvedClient } from "./context";
import type { AutocompleteMessages } from "./messages";
import { useBusinessAutocomplete } from "./useBusinessAutocomplete";

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
}

interface CommonProps {
  id: string;
  value: string;
  /** Typing only; a pick reports through `onPick`. */
  onChange(value: string): void;
  onPick(suggestion: BusinessSuggestion, pick: Pick): void;
  onFocus?: () => void;
  onBlur?: () => void;
  name?: string;
  inputRef?: Ref<HTMLInputElement>;
  /** Off, the field is a plain input and nothing is asked. Default on. */
  enabled?: boolean;
  /** When the session is minted: on focus (the default), keystroke or request. */
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
   * Which parts of a row show besides its title, which always does: the flags,
   * the subtitle and the secondary subtitle. Each shows unless set to `false`.
   */
  parts?: Partial<RowParts>;
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
 * suggestions and its pick. A pick fills the field with the family's canonical
 * name and hands the host the `business_token`; editing the name afterwards
 * is the host's cue to drop it.
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
  mintOn = "focus",
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
  parts,
  menuFollowsInputWidth,
  onUnavailable,
}: CommonProps & { client: AutocompleteClient }) {
  const client = useResolvedClient(given);
  // A pick writes the suggestion's label into the field; querying that exact
  // label again would only reopen the menu on the row just chosen.
  const [pickedLabel, setPickedLabel] = useState<string | null>(null);
  // The parts drawn decide what is fetched: a part left out is not asked for.
  // With none needing a related entity the tier's default stands, since it
  // refuses an empty include.
  const include = includeForParts(resolveParts(parts));
  const { unavailable, errorKind, filtersWithheld, requestId, ...state } =
    useBusinessAutocomplete({
      client,
      query: value,
      enabled: enabled && value !== pickedLabel,
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
        setPickedLabel(null);
        if (mintOn === "keystroke" && enabled && next !== "") {
          client.prewarm();
        }
        onChange(next);
      }}
      onSelect={suggestion => {
        const pickedAt = Date.now();
        setPickedLabel(suggestion.label);
        onChange(suggestion.label);
        onPick(suggestion, {
          businessToken: suggestion.token,
          pickedAt,
          expiresAt: pickedAt + BUSINESS_TOKEN_TTL_SECONDS * 1000,
        });
      }}
      onInputFocus={() => {
        if (mintOn === "focus" && enabled) {
          client.prewarm();
        }
        onFocus?.();
      }}
      onInputBlur={onBlur}
      {...state}
      look={look}
      messages={messages}
      label={label}
      renderLabel={renderLabel}
      renderInput={renderInput}
      renderRow={renderRow}
      classNames={classNames}
      unstyled={unstyled}
      open={open}
      parts={parts}
      menuFollowsInputWidth={menuFollowsInputWidth}
    />
  );
}
