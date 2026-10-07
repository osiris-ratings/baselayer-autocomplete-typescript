/**
 * `@baselayer-sdk/autocomplete/server`: the one piece of the SDK that runs on a
 * customer's backend.
 *
 * A browser must never hold an API key, so the grant the page needs is minted
 * here, server to server, and handed back. Three rules make that safe, and
 * this module is them in code:
 *
 * 1. Forward the page's `Origin`. The API binds the grant to whatever Origin
 * it receives, and the autocomplete service refuses the grant from any other
 * page. A mint
 *    without one produces an unbound grant that works from anywhere.
 * 2. Pass the answer through unchanged: the status, the JSON body and
 *    `Retry-After`. The browser SDK reads all three to decide whether to wait
 *    silently, tell the user, or step aside.
 * 3. Never forward cookies, and never log the key.
 */

export const DEFAULT_API_BASE_URL = "https://api.baselayer.com";
export const SESSIONS_PATH = "/autocomplete/sessions";

/** Response headers passed back to the browser; everything else is dropped. */
const PASSED_HEADERS = ["retry-after", "x-request-id"] as const;

/**
 * The relations each route's rows may carry: the session scope contract's
 * table, kept here so this module needs nothing from the browser core.
 */
export const SCOPE_RELATIONS = {
  businesses: ["people", "addresses"],
  people: ["businesses", "addresses"],
  addresses: ["businesses", "people"],
} as const;

/** The most suggestions a session may ever ask for. */
export const MAX_SCOPE_LIMIT = 20;

/** Each route a session may query, and the relations a request on it may touch. */
export type ScopeRoutes = {
  [
    R in keyof typeof SCOPE_RELATIONS
  ]?: readonly (typeof SCOPE_RELATIONS)[R][number][];
};

/**
 * What a session may search, narrowed from everything your organization may:
 * a session leaked from the page can do no more than this. Either half left
 * out narrows nothing on that side.
 */
export interface SessionScopeRequest {
  /**
   * Each route the session may query, and the relations a request on it may
   * include or filter by. The API refuses a route your organization may not
   * reach (403, code 501) and a relation it may not reach there (403, code
   * 502).
   */
  routes?: ScopeRoutes;
  /** The most suggestions a request may ask for, 1 to 20. */
  maxLimit?: number;
}

/** The body that asks the API for `scope`, or none without one. */
function scopeBody(scope: SessionScopeRequest | undefined): string | null {
  if (scope === undefined) {
    return null;
  }
  const { routes, maxLimit } = scope;
  if (routes !== undefined && Object.keys(routes).length === 0) {
    // A session that may query nothing; the API refuses it with a 422.
    throw new Error("mintForOrigin: scope.routes names no route");
  }
  if (
    maxLimit !== undefined &&
    (!Number.isInteger(maxLimit) || maxLimit < 1 || maxLimit > MAX_SCOPE_LIMIT)
  ) {
    throw new Error(
      `mintForOrigin: scope.maxLimit must be a whole number from 1 to ${MAX_SCOPE_LIMIT}`,
    );
  }
  return JSON.stringify({
    scope: {
      ...(routes !== undefined ? { routes } : {}),
      ...(maxLimit !== undefined ? { max_limit: maxLimit } : {}),
    },
  });
}

export interface MintForOriginOptions {
  /** Your Baselayer API key. Read it from your secret store; never ship it to a browser. */
  apiKey: string;
  /** The `Origin` of the page that asked, from the incoming request. */
  origin: string;
  apiBaseUrl?: string;
  fetch?: typeof fetch;
  signal?: AbortSignal;
  /** Narrows what the session may search; left out, everything your organization may. */
  scope?: SessionScopeRequest;
}

export interface MintPassThrough {
  status: number;
  /** `Retry-After` and `X-Request-ID` when the API sent them, plus `Content-Type`. */
  headers: Record<string, string>;
  /** The API's JSON body, untouched; null when it sent none. */
  body: unknown;
}

/**
 * Mint one autocomplete session for the page at `origin`.
 *
 * Every answer comes back as it is, success or refusal: a 201 grant, a 429
 * with its `Retry-After` and pool scope, a 403 when the key or the
 * organization is not enabled for autocomplete, or `scope` asks for more than
 * it may reach, a 503 when the deployment cannot mint.
 */
export async function mintForOrigin(
  options: MintForOriginOptions,
): Promise<MintPassThrough> {
  if (options.apiKey.length === 0) {
    throw new Error("mintForOrigin: apiKey is empty");
  }
  if (options.origin.length === 0) {
    // An unbound grant works from any page; refuse to make one for a browser.
    throw new Error("mintForOrigin: origin is required");
  }
  const requestBody = scopeBody(options.scope);
  const base = (options.apiBaseUrl ?? DEFAULT_API_BASE_URL).replace(/\/+$/, "");
  const fetchImpl: typeof fetch =
    options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const response = await fetchImpl(`${base}${SESSIONS_PATH}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "X-API-Key": options.apiKey,
      Origin: options.origin,
      ...(requestBody !== null ? { "Content-Type": "application/json" } : {}),
    },
    ...(requestBody !== null ? { body: requestBody } : {}),
    ...(options.signal !== undefined ? { signal: options.signal } : {}),
  });
  const text = await response.text();
  let body: unknown = null;
  if (text.length > 0) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  for (const name of PASSED_HEADERS) {
    const value = response.headers.get(name);
    if (value !== null) {
      headers[name === "retry-after" ? "Retry-After" : "X-Request-ID"] = value;
    }
  }
  return { status: response.status, headers, body };
}

/** A pass-through as a WHATWG `Response`, for fetch-style route handlers. */
export function toResponse(result: MintPassThrough): Response {
  const noBody = result.status === 204 || result.status === 304;
  return new Response(noBody ? null : JSON.stringify(result.body), {
    status: result.status,
    headers: { ...result.headers, "Cache-Control": "no-store" },
  });
}

export interface MintHandlerOptions {
  apiKey: string;
  apiBaseUrl?: string;
  /**
   * The page origins allowed to mint. A request from anywhere else is refused
   * 403 before the API is called, so a stranger's page cannot spend your
   * organization's session pool through your endpoint.
   */
  allowedOrigins?: string[] | ((origin: string) => boolean);
  fetch?: typeof fetch;
  /**
   * Narrows what each session may search: one scope for every mint, or a
   * function of the incoming request (the signed-in user's plan, say) that
   * may answer none.
   */
  scope?:
    | SessionScopeRequest
    | ((
        request: Request,
      ) =>
        | SessionScopeRequest
        | undefined
        | Promise<SessionScopeRequest | undefined>);
}

function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, "").toLowerCase();
}

function refusal(status: number, message: string): Response {
  return new Response(
    JSON.stringify({ code: status, message, metadata: null }),
    {
      status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    },
  );
}

/**
 * A `(request: Request) => Promise<Response>` handler for your mint endpoint:
 * a Next.js route handler or a Cloudflare Worker as it is, a Hono route or a
 * Remix action handing it the request (see docs/mint-endpoint.md); Express
 * mints with `mintForOrigin` instead. Put it behind your own authentication,
 * the way the rest of your backend is.
 */
export function createMintHandler(
  options: MintHandlerOptions,
): (request: Request) => Promise<Response> {
  const allowed = options.allowedOrigins;
  const allows =
    allowed === undefined
      ? () => true
      : typeof allowed === "function"
        ? allowed
        : (() => {
            const set = new Set(allowed.map(normalizeOrigin));
            return (origin: string) => set.has(normalizeOrigin(origin));
          })();
  return async request => {
    if (request.method !== "POST") {
      return refusal(405, "Use POST to mint an autocomplete session");
    }
    const origin = request.headers.get("Origin");
    if (origin === null || origin.length === 0) {
      return refusal(
        400,
        "The request carries no Origin to bind the session to",
      );
    }
    if (!allows(origin)) {
      return refusal(403, "This origin may not mint autocomplete sessions");
    }
    const scope =
      typeof options.scope === "function"
        ? await options.scope(request)
        : options.scope;
    const result = await mintForOrigin({
      apiKey: options.apiKey,
      origin,
      ...(scope !== undefined ? { scope } : {}),
      ...(options.apiBaseUrl !== undefined
        ? { apiBaseUrl: options.apiBaseUrl }
        : {}),
      ...(options.fetch !== undefined ? { fetch: options.fetch } : {}),
      signal: request.signal,
    });
    return toResponse(result);
  };
}
