import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from "react";

import {
  createAutocompleteClient,
  type AutocompleteClient,
  type AutocompleteClientConfig,
} from "@baselayer/autocomplete";

const ClientContext = createContext<AutocompleteClient | null>(null);

/** Hands one client to every hook and component below it. */
export function AutocompleteClientProvider({
  client,
  children,
}: {
  client: AutocompleteClient;
  children: ReactNode;
}) {
  return (
    <ClientContext.Provider value={client}>{children}</ClientContext.Provider>
  );
}

/** The client passed in, else the provider's; throws when there is neither. */
export function useResolvedClient(
  client?: AutocompleteClient,
): AutocompleteClient {
  const provided = useContext(ClientContext);
  const resolved = client ?? provided;
  if (resolved === null) {
    throw new Error(
      "No autocomplete client: pass `client`, or render inside <AutocompleteClientProvider>",
    );
  }
  return resolved;
}

/**
 * A client created once for the component's life. It is re-created only when
 * `baseUrl` or the identity of `mint` changes, so a host should keep `mint`
 * stable (module scope, or `useCallback`).
 */
export function useAutocompleteClient(
  config: AutocompleteClientConfig,
): AutocompleteClient {
  const ref = useRef<{
    client: AutocompleteClient;
    baseUrl: string;
    mint: AutocompleteClientConfig["mint"];
  } | null>(null);
  if (
    ref.current === null ||
    ref.current.baseUrl !== config.baseUrl ||
    ref.current.mint !== config.mint
  ) {
    ref.current?.client.reset();
    ref.current = {
      client: createAutocompleteClient(config),
      baseUrl: config.baseUrl,
      mint: config.mint,
    };
  }
  const client = ref.current.client;
  // A client made here is this component's alone: reset it when it goes, so a
  // mint still in flight is disowned rather than left to write back.
  useEffect(() => () => client.reset(), [client]);
  return client;
}
