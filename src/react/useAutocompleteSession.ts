import { useCallback, useState, useSyncExternalStore } from "react";

import type {
  AutocompleteClient,
  ClientSnapshot,
  SessionScope,
} from "@baselayer-sdk/autocomplete";

import { useResolvedClient } from "./context";

export interface AutocompleteSessionView {
  snapshot: ClientSnapshot;
  /** The deployment cannot mint (503 code 481): step aside for a plain input. */
  unavailable: boolean;
  unavailableUntil: number | null;
  prewarm(): void;
  reset(): void;
}

/** The client's session state, re-rendering on every change. */
export function useAutocompleteSession(
  client?: AutocompleteClient,
): AutocompleteSessionView {
  const resolved = useResolvedClient(client);
  const subscribe = useCallback(
    (onChange: () => void) => resolved.on("stateChange", onChange),
    [resolved],
  );
  const snapshot = useSyncExternalStore(
    subscribe,
    resolved.getSnapshot,
    resolved.getSnapshot,
  );
  const unavailableUntil =
    snapshot.session.phase === "unavailable" ? snapshot.session.until : null;
  return {
    snapshot,
    unavailable: unavailableUntil !== null,
    unavailableUntil,
    prewarm: resolved.prewarm,
    reset: resolved.reset,
  };
}

/**
 * The scope of the session's latest grant, kept while the next one is
 * minted, since the rows on screen were asked for under it; undefined before
 * the first grant. What a row lists is drawn only where it grants it.
 */
export function useSessionScope(
  client: AutocompleteClient,
): SessionScope | undefined {
  const { snapshot } = useAutocompleteSession(client);
  const [scope, setScope] = useState<SessionScope | undefined>(undefined);
  const current =
    snapshot.session.phase === "ready" ? snapshot.session.grant.scope : scope;
  if (current !== scope) {
    setScope(current);
  }
  return current;
}
