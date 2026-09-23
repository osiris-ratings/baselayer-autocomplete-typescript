/**
 * Every failure the client reports, as one class with a discriminant. Hosts
 * branch on `kind`; the other fields carry what the answer said.
 */
export type AutocompleteErrorKind =
  /** `q` or `limit` outside what the tier accepts; nothing was sent. */
  | "query_invalid"
  /** The deployment cannot mint sessions (503 code 481); `until` ends it. */
  | "session_unavailable"
  /** A mint was refused and asked for a wait; `until` and `scope` say how long and why. */
  | "mint_backoff"
  /** A mint failed outright (401, 402, 403, 422, 5xx, the network); `until` is the floor before the next. */
  | "mint_refused"
  /** Two fresh grants were refused in a row; minting is off until `until`. */
  | "auth_braked"
  /** The tier refused and no recovery applied. */
  | "request_failed"
  /** A body did not match the wire types. */
  | "contract";

export type MintScope = "window" | "day";

export interface AutocompleteErrorFields {
  kind: AutocompleteErrorKind;
  message: string;
  /** HTTP status when there was one; 0 for a network failure. */
  status?: number | null;
  /** The catalog code from the envelope. */
  code?: number | null;
  /** The tier's `metadata.reason`. */
  reason?: string | null;
  /** Epoch ms at which a cooldown ends. */
  until?: number | null;
  /** Which mint pool refused. */
  scope?: MintScope | null;
  retryAfterMs?: number | null;
  /** The envelope's own message, or a validation message, when there was one. */
  userMessage?: string | null;
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
