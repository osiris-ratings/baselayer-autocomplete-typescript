import type { Relation, Route } from "./entities";
import type { RouteUnservedReason } from "./wire";

/**
 * Every failure the client reports, as one class with a discriminant. Hosts
 * branch on `kind`; the other fields carry what the answer said.
 */
export type AutocompleteErrorKind =
  /**
   * `q` or `limit` outside what the autocomplete service accepts; nothing was
   * sent.
   */
  | "query_invalid"
  /** The deployment cannot mint sessions (503 code 481); `until` ends it. */
  | "session_unavailable"
  /** A mint was refused and asked for a wait; `until` and `scope` say how long and why. */
  | "mint_backoff"
  /** A mint failed outright (401, 402, 403, 422, 5xx, the network); `until` is the floor before the next. */
  | "mint_refused"
  /** Two fresh grants were refused in a row; minting is off until `until`. */
  | "auth_braked"
  /**
   * The session's scope leaves out the route, an `include` member or a
   * filter's relation; `route`, `relation` and `param` say which. Refused
   * before sending when the SDK can tell, else the autocomplete service's 403
   * (code 501 or 502). Never retried: a new session has the same scope.
   */
  | "out_of_scope"
  /**
   * The deployment has the route but cannot answer it yet (a 503 whose
   * `metadata.reason` says why); `unserved` says what it has and needs. Not
   * retried: it lasts until the deployment is upgraded.
   */
  | "route_unserved"
  /** The autocomplete service refused and no recovery applied. */
  | "request_failed"
  /** A body did not match the wire types. */
  | "contract";

export type MintScope = "window" | "day";

/** Why a deployment cannot answer a route yet, what it has, and what it needs. */
export interface RouteUnserved {
  reason: RouteUnservedReason;
  /** The index's schema, or the token version the deployment seals; null when not said. */
  current: number | null;
  /** The least the route needs of the same; null when not said. */
  required: number | null;
}

export interface AutocompleteErrorFields {
  kind: AutocompleteErrorKind;
  message: string;
  /** HTTP status when there was one; 0 for a network failure. */
  status?: number | null;
  /** The catalog code from the envelope. */
  code?: number | null;
  /** The autocomplete service's `metadata.reason`. */
  reason?: string | null;
  /** Epoch ms at which a cooldown ends. */
  until?: number | null;
  /** Which mint pool refused. */
  scope?: MintScope | null;
  retryAfterMs?: number | null;
  /** The envelope's own message, or a validation message, when there was one. */
  userMessage?: string | null;
  /** On `out_of_scope`: the route asked. */
  route?: Route | null;
  /** On `out_of_scope`: the relation the scope leaves out, if not the route. */
  relation?: Relation | null;
  /** On `out_of_scope`: the parameter that touched it (`include`, a filter). */
  param?: string | null;
  /** On `route_unserved`: why, what the deployment has, and what it needs. */
  unserved?: RouteUnserved | null;
  cause?: unknown;
}

export class AutocompleteError extends Error {
  readonly kind: AutocompleteErrorKind;
  readonly status: number | null;
  readonly code: number | null;
  readonly reason: string | null;
  readonly until: number | null;
  readonly scope: MintScope | null;
  readonly retryAfterMs: number | null;
  readonly userMessage: string | null;
  readonly route: Route | null;
  readonly relation: Relation | null;
  readonly param: string | null;
  readonly unserved: RouteUnserved | null;

  constructor(fields: AutocompleteErrorFields) {
    super(
      fields.message,
      fields.cause === undefined ? undefined : { cause: fields.cause },
    );
    this.name = "AutocompleteError";
    this.kind = fields.kind;
    this.status = fields.status ?? null;
    this.code = fields.code ?? null;
    this.reason = fields.reason ?? null;
    this.until = fields.until ?? null;
    this.scope = fields.scope ?? null;
    this.retryAfterMs = fields.retryAfterMs ?? null;
    this.userMessage = fields.userMessage ?? null;
    this.route = fields.route ?? null;
    this.relation = fields.relation ?? null;
    this.param = fields.param ?? null;
    this.unserved = fields.unserved ?? null;
  }
}

/**
 * `instanceof`, and by shape as well: a bundler that ends up with two copies
 * of the core must still recognize one copy's errors in the other.
 */
export function isAutocompleteError(
  error: unknown,
): error is AutocompleteError {
  return (
    error instanceof AutocompleteError ||
    (error instanceof Error &&
      error.name === "AutocompleteError" &&
      typeof (error as { kind?: unknown }).kind === "string")
  );
}

/** `true` for the `AbortError` a canceled fetch or wait rejects with. */
export function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: unknown }).name === "AbortError"
  );
}

export function abortError(): Error {
  // DOMException exists in every browser and in Node 17+.
  return new DOMException("Aborted", "AbortError");
}
