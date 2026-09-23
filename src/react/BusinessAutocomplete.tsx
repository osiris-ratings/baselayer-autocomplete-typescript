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
import type { LookInput } from "@baselayer/autocomplete";
import { defaultMint, type MintFunction } from "@baselayer/autocomplete";
import { BUSINESS_TOKEN_TTL_SECONDS } from "@baselayer/autocomplete";
import type { BusinessSuggestion, Include } from "@baselayer/autocomplete";

import {
  BusinessAutocompleteView,
  type RowRenderProps,
  type SlotName,
} from "./BusinessAutocompleteView";
import { useAutocompleteClient, useResolvedClient } from "./context";
import type { AutocompleteMessages } from "./messages";
import { useBusinessAutocomplete } from "./useBusinessAutocomplete";

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
  /** Mint when the field takes focus, so the first keystroke pays only for suggestions. */
  prewarmOnFocus?: boolean;
  filters?: Filters;
  limit?: number;
  include?: Include[];
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
  prewarmOnFocus = true,
  filters,
  limit,
  include,
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
  onUnavailable,
}: CommonProps & { client: AutocompleteClient }) {
  const client = useResolvedClient(given);
  // A pick writes the suggestion's label into the field; querying that exact
  // label again would only reopen the menu on the row just chosen.
  const [pickedLabel, setPickedLabel] = useState<string | null>(null);
  const { unavailable, errorKind, filtersWithheld, requestId, ...state } =
    useBusinessAutocomplete({
      client,
      query: value,
      enabled: enabled && value !== pickedLabel,
      ...(filters !== undefined ? { filters } : {}),
      ...(limit !== undefined ? { limit } : {}),
      ...(include !== undefined ? { include } : {}),
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
        if (prewarmOnFocus && enabled) {
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
    />
  );
}
