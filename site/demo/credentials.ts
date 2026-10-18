import {
  LEGAL_RELATIONS,
  parseMintResponse,
  ROUTE_NAMES,
  type MintFunction,
  type Route,
} from "@baselayer-sdk/autocomplete";

/**
 * What the page asks of each session it mints, all of it in the mint's
 * `scope`. A field left empty is not set, and a mint that sets nothing sends no
 * body at all.
 */
export interface SessionSettings {
  /**
   * `scope.routes`: the routes the session may query, each with every
   * relation it carries. None: every route the key may reach.
   */
  routes: readonly Route[];
  /** `scope.max_limit`, 1 to 20: the most rows a request may ask for. */
  maxLimit: number | null;
  /**
   * `scope.match_profile`: any name the API knows, typed or picked. Not in the
   * API's published contract.
   */
  matchProfile: string;
}

export const NO_SESSION_SETTINGS: SessionSettings = {
  routes: [],
  maxLimit: null,
  matchProfile: "",
};

/** The mint's JSON body for `settings`, or null when none is set. */
export function mintBody({
  routes,
  maxLimit,
  matchProfile,
}: SessionSettings): string | null {
  const profile = matchProfile.trim();
  const scope = {
    // The API's own order, whichever order they were ticked in.
    ...(routes.length > 0
      ? {
          routes: Object.fromEntries(
            ROUTE_NAMES.filter(route => routes.includes(route)).map(route => [
              route,
              [...LEGAL_RELATIONS[route]],
            ]),
          ),
        }
      : {}),
    ...(maxLimit !== null ? { max_limit: maxLimit } : {}),
    ...(profile !== "" ? { match_profile: profile } : {}),
  };
  return Object.keys(scope).length === 0 ? null : JSON.stringify({ scope });
}

/**
 * The page mints for itself, the way a customer's backend would. Only for
 * trying the SDK: in a real integration the key stays on the server (see
 * docs/mint-endpoint.md). The browser sets `Origin` itself, so the session is
 * bound to this page.
 */
export function keyMint(
  baseUrl: string,
  apiKey: string,
  fetchImpl: (input: string, init?: RequestInit) => Promise<Response> = fetch,
  settings: SessionSettings = NO_SESSION_SETTINGS,
): MintFunction {
  const requestBody = mintBody(settings);
  return async ({ signal }) => {
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}/autocomplete/sessions`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "X-API-Key": apiKey,
          ...(requestBody !== null
            ? { "Content-Type": "application/json" }
            : {}),
        },
        ...(requestBody !== null ? { body: requestBody } : {}),
        credentials: "omit",
        signal,
      });
    } catch (error) {
      if (signal.aborted) {
        throw error;
      }
      throw new Error(
        import.meta.env.DEV
          ? "The API did not answer this page (most likely CORS: it does not admit this origin). Pick “Production, through this dev server”."
          : "The API did not answer this page (most likely CORS: this origin is not allowed to mint).",
      );
    }
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    return parseMintResponse(response.status, response.headers, body);
  };
}

export interface TokenClaims {
  exp: number;
  iat: number;
  bud: number;
  piv: number;
  stem: number;
  ori: string | null;
  org: string;
}

/**
 * The claims of a compact JWS, read without verifying (the autocomplete service
 * verifies).
 */
export function readClaims(token: string): TokenClaims | null {
  const [, payload] = token.trim().split(".");
  if (payload === undefined) {
    return null;
  }
  try {
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const claims = JSON.parse(json) as Partial<TokenClaims>;
    if (
      typeof claims.exp !== "number" ||
      typeof claims.bud !== "number" ||
      typeof claims.stem !== "number"
    ) {
      return null;
    }
    return {
      exp: claims.exp,
      iat: claims.iat ?? 0,
      bud: claims.bud,
      piv: claims.piv ?? 0,
      stem: claims.stem,
      ori: claims.ori ?? null,
      org: claims.org ?? "",
    };
  } catch {
    return null;
  }
}
