import { useCallback, useSyncExternalStore } from "react";

import type {
  AutocompleteClient,
  ClientSnapshot,
} from "@baselayer/autocomplete";

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
