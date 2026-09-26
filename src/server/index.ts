/**
 * `@baselayer-sdk/autocomplete/server`: the one piece of the SDK that runs on a
 * customer's backend.
 *
 * A browser must never hold an API key, so the grant the page needs is minted
 * here, server to server, and handed back. Three rules make that safe, and
 * this module is them in code:
 *
 * 1. Forward the page's `Origin`. The API binds the grant to whatever Origin
 *    it receives, and the tier refuses the grant from any other page. A mint
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

export interface MintForOriginOptions {
  /** Your Baselayer API key. Read it from your secret store; never ship it to a browser. */
  apiKey: string;
  /** The `Origin` of the page that asked, from the incoming request. */
  origin: string;
  apiBaseUrl?: string;
  fetch?: typeof fetch;
  signal?: AbortSignal;
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
 * organization is not enabled for autocomplete, a 503 when the deployment
 * cannot mint.
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
  const base = (options.apiBaseUrl ?? DEFAULT_API_BASE_URL).replace(/\/+$/, "");
  const fetchImpl: typeof fetch =
    options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const response = await fetchImpl(`${base}${SESSIONS_PATH}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "X-API-Key": options.apiKey,
      Origin: options.origin,
    },
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
    const result = await mintForOrigin({
      apiKey: options.apiKey,
      origin,
      ...(options.apiBaseUrl !== undefined
        ? { apiBaseUrl: options.apiBaseUrl }
        : {}),
      ...(options.fetch !== undefined ? { fetch: options.fetch } : {}),
      signal: request.signal,
    });
    return toResponse(result);
  };
}
