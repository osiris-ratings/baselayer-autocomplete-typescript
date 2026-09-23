import type { MintScope } from "./errors";
import { parseErrorEnvelope } from "./wire";

/**
 * The mint contract. The SDK never learns how a host authenticates: it calls a
 * `MintFunction` whenever it needs a grant, and treats every host alike from
 * there on. The console's is its axios instance with the Keycloak bearer; a
 * customer's is `defaultMint(url)` against an endpoint on their own backend,
 * which mints with their API key (see `@baselayer/autocomplete/server`).
 */

/** Why the SDK is asking for a grant. */
export type MintReason = "cold" | "refresh" | "forced" | "prewarm";

export interface MintContext {
  reason: MintReason;
  /**
   * Aborted when the client is reset (a sign-out), never by a keystroke: the
   * mint is single-flighted across every caller on the page.
   */
  signal: AbortSignal;
}

/** What `POST /autocomplete/sessions` granted, camelCased. */
export interface MintedGrant {
  /** The compact JWS the tier verifies; opaque to the SDK. */
  sessionToken: string;
  /** Seconds until the tier stops honouring the grant. */
  expiresIn: number;
  /** Requests the grant is good for, per route. */
  requestBudget: number;
  /** Changes of query the tier allows before it refuses the session. */
  pivotAllowance: number;
  /** Characters of `q` the narrowing filters wait for. */
  filterMinStem: number;
}

export type MintOutcome =
  | { kind: "granted"; grant: MintedGrant }
  | {
      kind: "refused";
      /** HTTP status; 0 for a network failure, 201 for a malformed grant. */
      status: number;
      code: number | null;
      retryAfterSeconds: number | null;
      /** Which pool a 429 named; null for anything else. */
      scope: MintScope | null;
      message: string | null;
    };

export type MintFunction = (context: MintContext) => Promise<MintOutcome>;

/** `Headers`, axios's headers, or a plain record. */
export type HeadersLike =
  { get(name: string): unknown } | Record<string, unknown> | null | undefined;

/** The mint's 429 names the organization's day in `metadata.scope` with this. */
export const MINT_DAY_SCOPE = "autocomplete_session_mint_day:organization";

export function readHeader(headers: HeadersLike, name: string): string | null {
  if (headers === null || headers === undefined) {
    return null;
  }
  const getter = (headers as { get?: unknown }).get;
  if (typeof getter === "function") {
    const value: unknown = getter.call(headers, name);
    return value === null || value === undefined ? null : String(value);
  }
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === wanted && value !== undefined && value !== null) {
      return Array.isArray(value) ? String(value[0]) : String(value);
    }
  }
  return null;
}

function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function nonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function grantFrom(body: unknown): MintedGrant | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }
  const b = body as Record<string, unknown>;
  const token = b.session_token ?? b.sessionToken;
  const expiresIn = b.expires_in ?? b.expiresIn;
  const requestBudget = b.request_budget ?? b.requestBudget;
  const pivotAllowance = b.pivot_allowance ?? b.pivotAllowance;
  const filterMinStem = b.filter_min_stem ?? b.filterMinStem;
  if (
    typeof token !== "string" ||
    token.length === 0 ||
    !positiveInteger(expiresIn) ||
    !positiveInteger(requestBudget) ||
    !nonNegativeInteger(pivotAllowance) ||
    !positiveInteger(filterMinStem)
  ) {
    return null;
  }
  return {
    sessionToken: token,
    expiresIn,
    requestBudget,
    pivotAllowance,
    filterMinStem,
  };
}

/**
 * The one place a mint's answer is interpreted. `defaultMint` and every host
 * adapter call it with the status, the headers and the parsed JSON body (null
 * when there was none). Snake_case and camelCase bodies both parse, so an
 * adapter whose HTTP client camelCases responses need not undo it.
 *
 * A 201 with a body that is not a grant is a refusal, so the client backs off
 * instead of caching garbage.
 */
export function parseMintResponse(
  status: number,
  headers: HeadersLike,
  body: unknown,
): MintOutcome {
  if (status >= 200 && status < 300) {
    const grant = grantFrom(body);
    if (grant !== null) {
      return { kind: "granted", grant };
    }
  }
  const envelope = parseErrorEnvelope(body);
  // The code alone is enough to act on (503 code 481 is the step-aside), even
  // from a body too thin to be a full envelope.
  const bareCode =
    typeof body === "object" &&
    body !== null &&
    Number.isInteger((body as { code?: unknown }).code)
      ? (body as { code: number }).code
      : null;
  const retryAfter = Number(readHeader(headers, "Retry-After"));
  const scopeName = envelope?.metadata?.scope;
  return {
    kind: "refused",
    status,
    code: envelope?.code ?? bareCode,
    retryAfterSeconds:
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null,
    scope:
      status !== 429 ? null : scopeName === MINT_DAY_SCOPE ? "day" : "window",
    message: envelope?.message ?? null,
  };
}

export interface DefaultMintOptions {
  fetch?: typeof fetch;
  /**
   * `same-origin` by default: the mint URL is the host's own backend, and its
   * session cookie is how that backend knows who is asking.
   */
  credentials?: RequestCredentials;
  /** Extra request headers, such as a CSRF token; called on every mint. */
  headers?: () => Record<string, string> | Promise<Record<string, string>>;
}

/**
 * A `MintFunction` that POSTs to `mintUrl` on the host's own backend and reads
 * the answer the way `parseMintResponse` does. The backend passes the API's
 * status, body and `Retry-After` through unchanged.
 */
export function defaultMint(
  mintUrl: string,
  options: DefaultMintOptions = {},
): MintFunction {
  const fetchImpl: typeof fetch =
    options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  return async ({ signal }) => {
    const extra = options.headers ? await options.headers() : {};
    const response = await fetchImpl(mintUrl, {
      method: "POST",
      headers: { Accept: "application/json", ...extra },
      credentials: options.credentials ?? "same-origin",
      signal,
    });
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    return parseMintResponse(response.status, response.headers, body);
  };
}
