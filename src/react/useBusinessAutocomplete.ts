import { useEffect, useMemo, useRef, useState } from "react";

import type { Filters } from "@baselayer/autocomplete";
import type { AutocompleteClient } from "@baselayer/autocomplete";
import {
  isAutocompleteError,
  type AutocompleteErrorKind,
} from "@baselayer/autocomplete";
import type { BusinessSuggestion, Include } from "@baselayer/autocomplete";

import { useResolvedClient } from "./context";
import { resolveMessages, type AutocompleteMessages } from "./messages";

/** Characters before a keystroke goes to the tier. */
export const MIN_QUERY_CHARS = 3;
/** One window per keystroke; a keystroke inside it cancels the pending one. */
export const DEBOUNCE_MS = 250;
/** Rows per keystroke: five two-line cells plus the count row fit a field. */
export const DEFAULT_LIMIT = 5;

export interface UseBusinessAutocompleteOptions {
  /** The business name as typed. */
  query: string;
  enabled: boolean;
  /** Else the one from `<AutocompleteClientProvider>`. */
  client?: AutocompleteClient;
  /** Narrowing filters; held back while the name is shorter than the grant's stem. */
  filters?: Filters;
  limit?: number;
  include?: Include[];
  minChars?: number;
  debounceMs?: number;
  messages?: Partial<AutocompleteMessages>;
}

export interface BusinessAutocompleteState {
  suggestions: BusinessSuggestion[];
  found: number;
  foundCapped: boolean;
  /**
   * The tier did not finish looking, so `suggestions` may be missing a match
   * and `found: 0` is not evidence of absence.
   */
  truncated: boolean;
  indexTag: string | null;
  roundTripMs: number | null;
  isSearching: boolean;
  /** What the footer says, or null. */
  error: string | null;
  /**
   * The API said it cannot mint sessions (503 code 481). Not an error for a
   * footer: the host falls back to its plain input for the cooldown.
   */
  unavailable: boolean;
  errorKind: AutocompleteErrorKind | null;
  filtersWithheld: boolean;
  requestId: string | null;
}

export const EMPTY_AUTOCOMPLETE_STATE: BusinessAutocompleteState =
  Object.freeze({
    suggestions: [],
    found: 0,
    foundCapped: false,
    truncated: false,
    indexTag: null,
    roundTripMs: null,
    isSearching: false,
    error: null,
    unavailable: false,
    errorKind: null,
    filtersWithheld: false,
    requestId: null,
  }) as BusinessAutocompleteState;

const UNAVAILABLE_STATE: BusinessAutocompleteState = Object.freeze({
  ...EMPTY_AUTOCOMPLETE_STATE,
  unavailable: true,
  errorKind: "session_unavailable",
}) as BusinessAutocompleteState;

/**
 * Debounced suggestions for a business-name field.
 *
 * One debounce window per keystroke, an AbortController so a superseded
 * request can neither apply its rows nor keep the spinner alive, and the
 * previous rows left in place while the next request is in flight so the list
 * does not blink on every key. Every cooldown the client learns (the
 * deployment cannot mint, a spent pool) arms a timer that brings the
 * suggestions back the moment it ends, not on the next keystroke.
 */
export function useBusinessAutocomplete({
  query,
  enabled,
  client,
  filters,
  limit = DEFAULT_LIMIT,
  include,
  minChars = MIN_QUERY_CHARS,
  debounceMs = DEBOUNCE_MS,
  messages,
}: UseBusinessAutocompleteOptions): BusinessAutocompleteState {
  const resolved = useResolvedClient(client);
  const text = resolveMessages(messages);
  const [state, setState] = useState(EMPTY_AUTOCOMPLETE_STATE);
  // Bumped when a cooldown ends, so the effect re-reads it then: left alone,
  // `unavailable` would outlive the cooldown for as long as nothing is typed.
  const [cooldownsEnded, setCooldownsEnded] = useState(0);
  const trimmedQuery = query.trim();
  // Filters and include arrive as fresh objects on every render; the effect
  // keys on what they say, not on their identity.
  const filtersKey = JSON.stringify(filters ?? null);
  const includeKey = include?.join(",") ?? "";
  const stableFilters = useMemo(
    () =>
      filtersKey === "null" ? undefined : (JSON.parse(filtersKey) as Filters),
    [filtersKey],
  );
  const stableInclude = useMemo(
    () =>
      includeKey === "" ? undefined : (includeKey.split(",") as Include[]),
    [includeKey],
  );
  // Read through a ref, so a host passing a fresh messages object (or inline
  // functions) on every render does not refire the request.
  const textRef = useRef(text);
  textRef.current = text;

  useEffect(() => {
    // Fires the moment a cooldown ends. The +1 clears `now < until`.
    const armCooldownEnd = (until: number) =>
      setTimeout(
        () => setCooldownsEnded(count => count + 1),
        Math.max(0, until - Date.now()) + 1,
      );
    // Learnt by an earlier keystroke or by the prewarm on focus: while the API
    // cannot mint there is nothing to ask the tier with. Checked ahead of the
    // length floor so the fallback does not flap with every short query.
    const session = resolved.getSnapshot().session;
    if (enabled && session.phase === "unavailable") {
      setState(UNAVAILABLE_STATE);
      const cooldownId = armCooldownEnd(session.until);
      return () => clearTimeout(cooldownId);
    }
    if (!enabled || trimmedQuery.length < minChars) {
      setState(EMPTY_AUTOCOMPLETE_STATE);
      return;
    }
    const controller = new AbortController();
    let cooldownId: ReturnType<typeof setTimeout> | undefined;
    const timeoutId = setTimeout(async () => {
      // A new request retires the previous failure, and `unavailable` is reset
      // rather than carried forward, so an ended cooldown cannot keep the host
      // on its plain input.
      setState(previous => ({
        ...previous,
        isSearching: true,
        error: null,
        errorKind: null,
        unavailable: false,
      }));
      try {
        const result = await resolved.suggest(
          {
            q: trimmedQuery,
            limit,
            ...(stableInclude !== undefined ? { include: stableInclude } : {}),
            ...(stableFilters !== undefined ? { filters: stableFilters } : {}),
          },
          { signal: controller.signal },
        );
        if (controller.signal.aborted) {
          return;
        }
        setState({
          suggestions: result.response.suggestions,
          found: result.response.found,
          foundCapped: result.response.found_capped,
          truncated: result.response.truncated,
          indexTag: result.indexTag,
          roundTripMs: result.roundTripMs,
          isSearching: false,
          error: null,
          unavailable: false,
          errorKind: null,
          filtersWithheld: result.filtersWithheld,
          requestId: result.requestId,
        });
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        const { dayLimit, unavailable, authUnavailable, httpFallback } =
          textRef.current;
        if (!isAutocompleteError(error)) {
          setState({ ...EMPTY_AUTOCOMPLETE_STATE, error: unavailable });
          return;
        }
        switch (error.kind) {
          case "session_unavailable":
            setState(UNAVAILABLE_STATE);
            cooldownId = armCooldownEnd(error.until ?? Date.now());
            return;
          case "mint_backoff":
            // The window's refusal is a wait of minutes nobody can act on, so
            // the footer says nothing; the day's is the plan's reach, spent
            // until tomorrow, which the user should hear. Either way a timer
            // brings the suggestions back when the wait ends.
            setState({
              ...EMPTY_AUTOCOMPLETE_STATE,
              error: error.scope === "day" ? dayLimit : null,
              errorKind: error.kind,
            });
            cooldownId = armCooldownEnd(error.until ?? Date.now());
            return;
          case "query_invalid":
            setState({ ...EMPTY_AUTOCOMPLETE_STATE, errorKind: error.kind });
            return;
          case "auth_braked":
            setState({
              ...EMPTY_AUTOCOMPLETE_STATE,
              error: authUnavailable,
              errorKind: error.kind,
            });
            return;
          case "request_failed":
            // Nothing of the previous reply survives: its round trip and index
            // described an answer, and beside this error they describe nothing.
            setState({
              ...EMPTY_AUTOCOMPLETE_STATE,
              error:
                error.userMessage ??
                (error.status !== null && error.status > 0
                  ? httpFallback(error.status)
                  : unavailable),
              errorKind: error.kind,
            });
            return;
          case "mint_refused":
          case "contract":
            setState({
              ...EMPTY_AUTOCOMPLETE_STATE,
              error: unavailable,
              errorKind: error.kind,
            });
            return;
        }
      }
    }, debounceMs);
    return () => {
      controller.abort();
      clearTimeout(timeoutId);
      if (cooldownId !== undefined) {
        clearTimeout(cooldownId);
      }
    };
  }, [
    resolved,
    enabled,
    trimmedQuery,
    cooldownsEnded,
    minChars,
    debounceMs,
    limit,
    stableFilters,
    stableInclude,
  ]);

  return state;
}
