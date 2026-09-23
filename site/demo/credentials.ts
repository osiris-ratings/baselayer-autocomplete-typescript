import {
  parseMintResponse,
  type MintFunction,
  type MintOutcome,
} from "@baselayer/autocomplete";

/**
 * API-key mode: the page mints for itself, the way a customer's backend
 * would. Only for trying the SDK: in a real integration the key stays on the
 * server (see docs/mint-endpoint.md). The browser sets `Origin` itself, so the
 * session is bound to this page.
 */
export function keyMint(
  baseUrl: string,
  apiKey: string,
  fetchImpl: (input: string, init?: RequestInit) => Promise<Response> = fetch,
): MintFunction {
  return async ({ signal }) => {
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}/autocomplete/sessions`, {
        method: "POST",
        headers: { Accept: "application/json", "X-API-Key": apiKey },
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
          : "The API did not answer this page (most likely CORS: this origin is not allowed to mint). Use a session token instead.",
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

/** The claims of a compact JWS, read without verifying (the tier verifies). */
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

/**
 * Token mode: a session minted elsewhere (one curl, below) and pasted here, so
 * the key never touches the browser. It cannot be refreshed; once it expires
 * or its budget is spent, paste a new one.
 */
export function tokenMint(token: string): MintFunction {
  let used = false;
  return async (): Promise<MintOutcome> => {
    const claims = readClaims(token);
    const remaining =
      claims === null ? 0 : claims.exp - Math.floor(Date.now() / 1000);
    if (claims === null || remaining <= 0 || used) {
      return {
        kind: "refused",
        status: 401,
        code: null,
        retryAfterSeconds: 3600,
        scope: null,
        message:
          claims === null
            ? "That is not a session token"
            : "This session token has expired or been spent; paste a new one",
      };
    }
    used = true;
    return {
      kind: "granted",
      grant: {
        sessionToken: token.trim(),
        expiresIn: remaining,
        // What the API would have sent: its `expires_at` is the token's `exp`.
        expiresAtUtc: new Date(claims.exp * 1000).toISOString(),
        requestBudget: claims.bud,
        pivotAllowance: claims.piv,
        filterMinStem: claims.stem,
      },
    };
  };
}
