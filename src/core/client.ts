import {
  MAX_LIMIT,
  MAX_Q_CHARS,
  MIN_Q_CHARS,
  buildBusinessesUrl,
  hasFilters,
  recoveryFor,
  stemLength,
  strippedQuery,
  type Query,
  type Recovery,
  type ShortStemPolicy,
} from "./businesses";
import { AutocompleteError, abortError, isAbortError } from "./errors";
import type { MintFunction } from "./mint";
import {
  DEFAULT_REQUEST_POLICY,
  DEFAULT_SESSION_POLICY,
  type RequestPolicy,
  type SessionPolicy,
} from "./policy";
import {
  SessionManager,
  type Grant,
  type MintEvent,
  type SessionPhase,
} from "./session";
import {
  ContractViolation,
  firstValidationMessage,
  parseBusinessesResponse,
  parseErrorEnvelope,
  type BusinessesResponse,
} from "./wire";

/** The subset of `Response` the client reads; `fetch` satisfies it. */
export interface ResponseLike {
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
}

export type FetchLike = (
  url: string,
  init: {
    headers: Record<string, string>;
    signal?: AbortSignal;
    credentials: "omit";
  },
) => Promise<ResponseLike>;

export interface AutocompleteClientConfig {
  /** The API host the tier answers on, e.g. `https://api.baselayer.com`. */
  baseUrl: string;
  /** How a grant is obtained; see `defaultMint` and the host adapters. */
  mint: MintFunction;
  fetch?: FetchLike;
  now?: () => number;
  /**
   * Where the grant lives. `memory` (default) is one grant per tab, gone on
   * reload. `sessionStorage` keeps it across reloads of the same tab, saving a
   * billable mint per reload, at the price of a short-lived, Origin-bound
   * credential in storage.
   */
  persistGrant?: "memory" | "sessionStorage";
  storageKey?: string;
  session?: Partial<SessionPolicy>;
  request?: Partial<RequestPolicy>;
  /** Filters on a query shorter than the grant's stem: dropped (default), sent, or refused locally. */
  onShortStem?: ShortStemPolicy;
}

export interface SuggestResult {
  response: BusinessesResponse;
  /** `X-Autocomplete-Index` of the artifact that answered. */
  indexTag: string | null;
  requestId: string | null;
  serverTiming: string | null;
  /** The round trip of the reply that succeeded, not the recovery before it. */
  roundTripMs: number;
  recovery: Recovery;
  /** The query carried filters and the stem was too short for them. */
  filtersWithheld: boolean;
}

export interface BrakeState {
  until: number;
}

export interface ClientSnapshot {
  session: SessionPhase;
  brake: BrakeState | null;
  usage: {
    /** Tier requests on the current grant, counted here. */
    requestsSinceMint: number;
    requestBudget: number | null;
    pivotAllowance: number | null;
    /** How many times the tier refused a session for pivoting (482). */
    pivotsExceededEvents: number;
  };
  lastIndexTag: string | null;
  generation: number;
}

export interface RequestEvent {
  q: string;
  filtersWithheld: boolean;
  /** The final reply's status; 0 when none arrived. */
  status: number;
  roundTripMs: number | null;
  indexTag: string | null;
  requestId: string | null;
  serverTiming: string | null;
  recovery: Recovery;
  requestsSinceMint: number;
  requestBudget: number | null;
  error: AutocompleteError | null;
}

export interface ClientEvents {
  stateChange: (snapshot: ClientSnapshot) => void;
  mint: (event: MintEvent) => void;
  request: (event: RequestEvent) => void;
}

export interface AutocompleteClient {
  /** Suggestions for one keystroke, recovering at most once. */
  suggest(
    query: Query,
    options?: { signal?: AbortSignal },
  ): Promise<SuggestResult>;
  /** The current grant, minting or refreshing when needed. */
  getSession(options?: { force?: boolean }): Promise<Grant>;
  /** Mint ahead of the first keystroke; failures are not reported. */
  prewarm(): void;
  /** Sign-out: disown any mint in flight, forget the grant and every cooldown. */
  reset(): void;
  /** Synchronous and referentially stable between changes. */
  getSnapshot(): ClientSnapshot;
  on<E extends keyof ClientEvents>(
    event: E,
    handler: ClientEvents[E],
  ): () => void;
  readonly baseUrl: string;
}

interface StoredGrant {
  grant: Grant;
  origin: string | null;
}

function pageOrigin(): string | null {
  try {
    return typeof location === "undefined" ? null : location.origin;
  } catch {
    return null;
  }
}

function storage(): Storage | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

function readStoredGrant(key: string, now: number): Grant | null {
  const store = storage();
  if (store === null) {
    return null;
  }
  try {
    const raw = store.getItem(key);
    if (raw === null) {
      return null;
    }
    const stored = JSON.parse(raw) as StoredGrant;
    if (
      stored.origin !== pageOrigin() ||
      typeof stored.grant?.sessionToken !== "string" ||
      typeof stored.grant.expiresAt !== "number" ||
      now >= stored.grant.expiresAt
    ) {
      store.removeItem(key);
      return null;
    }
    return stored.grant;
  } catch {
    return null;
  }
}

function writeStoredGrant(key: string, grant: Grant | null): void {
  const store = storage();
  if (store === null) {
    return;
  }
  try {
    if (grant === null) {
      store.removeItem(key);
    } else {
      store.setItem(
        key,
        JSON.stringify({ grant, origin: pageOrigin() } satisfies StoredGrant),
      );
    }
  } catch {
    // Storage full or blocked: the grant simply lives in memory.
  }
}

function clock(): () => number {
  const perf = (globalThis as { performance?: { now(): number } }).performance;
  return perf !== undefined ? () => perf.now() : () => Date.now();
}

interface Failure {
  message: string;
  userMessage: string | null;
  reason: string | null;
  code: number | null;
}

async function readFailure(response: ResponseLike): Promise<Failure> {
  const fallback = `Autocomplete unavailable (HTTP ${response.status})`;
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { message: fallback, userMessage: null, reason: null, code: null };
  }
  const envelope = parseErrorEnvelope(body);
  if (envelope !== null) {
    const reason = envelope.metadata?.reason;
    return {
      message: envelope.message.length > 0 ? envelope.message : fallback,
      userMessage: envelope.message.length > 0 ? envelope.message : null,
      reason: typeof reason === "string" ? reason : null,
      code: envelope.code,
    };
  }
  const detail = firstValidationMessage(body);
  return detail !== null
    ? { message: detail, userMessage: detail, reason: null, code: null }
    : { message: fallback, userMessage: null, reason: null, code: null };
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    // An abort that already happened fires no event: without this the
    // keystroke that superseded this one would still sit out the wait.
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const abort = () => {
      clearTimeout(timeoutId);
      reject(abortError());
    };
    const timeoutId = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", abort, { once: true });
  });
}

type Listeners = { [E in keyof ClientEvents]: Set<ClientEvents[E]> };

/**
 * The client a host creates once per page (or per signed-in identity) and
 * hands to the React binding, or drives directly.
 */
export function createAutocompleteClient(
  config: AutocompleteClientConfig,
): AutocompleteClient {
  const now = config.now ?? (() => Date.now());
  const sessionPolicy: SessionPolicy = {
    ...DEFAULT_SESSION_POLICY,
    ...config.session,
  };
  const requestPolicy: RequestPolicy = {
    ...DEFAULT_REQUEST_POLICY,
    ...config.request,
  };
  const fetchImpl: FetchLike =
    config.fetch ?? ((url, init) => globalThis.fetch(url, init));
  const shortStem = config.onShortStem ?? "withhold";
  const storageKey = config.storageKey ?? "bl.autocomplete.grant.v1";
  const persist = config.persistGrant === "sessionStorage";
  const elapsed = clock();
  const baseUrl = config.baseUrl.replace(/\/+$/, "");

  const listeners: Listeners = {
    stateChange: new Set(),
    mint: new Set(),
    request: new Set(),
  };
  let consecutiveAuthFailures = 0;
  let authBrakeUntil = 0;
  let requestsSinceMint = 0;
  let pivotsExceededEvents = 0;
  let lastIndexTag: string | null = null;
  let snapshot: ClientSnapshot | null = null;
  let brakeTimer: ReturnType<typeof setTimeout> | null = null;

  const changed = () => {
    snapshot = null;
    if (listeners.stateChange.size > 0) {
      const current = getSnapshot();
      listeners.stateChange.forEach(handler => handler(current));
    }
  };

  const session = new SessionManager(
    config.mint,
    sessionPolicy,
    {
      now,
      onMint: event => {
        if (event.grant !== null) {
          requestsSinceMint = 0;
        }
        listeners.mint.forEach(handler => handler(event));
      },
      onChange: changed,
      onGrant: grant => {
        if (persist) {
          writeStoredGrant(storageKey, grant);
        }
      },
    },
    persist ? readStoredGrant(storageKey, now()) : null,
  );

  function getSnapshot(): ClientSnapshot {
    const phase = session.phase();
    // Time moves phases on its own (a cooldown ends, a grant expires), so the
    // cache is keyed on what the phase IS, not only on the last change.
    if (
      snapshot !== null &&
      samePhase(snapshot.session, phase) &&
      brakeCurrent(snapshot)
    ) {
      return snapshot;
    }
    const grant = phase.phase === "ready" ? phase.grant : null;
    snapshot = {
      session: phase,
      brake: now() < authBrakeUntil ? { until: authBrakeUntil } : null,
      usage: {
        requestsSinceMint,
        requestBudget: grant?.requestBudget ?? null,
        pivotAllowance: grant?.pivotAllowance ?? null,
        pivotsExceededEvents,
      },
      lastIndexTag,
      generation: session.generation,
    };
    return snapshot;
  }

  function brakeCurrent(cached: ClientSnapshot): boolean {
    const braked = now() < authBrakeUntil;
    return braked === (cached.brake !== null);
  }

  function recordAuthFailure(): void {
    consecutiveAuthFailures += 1;
    if (consecutiveAuthFailures >= requestPolicy.authFailuresBeforeBrake) {
      consecutiveAuthFailures = 0;
      authBrakeUntil = now() + requestPolicy.authBrakeMs;
      if (brakeTimer !== null) {
        clearTimeout(brakeTimer);
      }
      brakeTimer = setTimeout(() => {
        brakeTimer = null;
        changed();
      }, requestPolicy.authBrakeMs + 1);
      (brakeTimer as { unref?: () => void }).unref?.();
      changed();
    }
  }

  function retryAfterMs(response: ResponseLike): number {
    const header = response.headers.get("Retry-After");
    const seconds =
      header === null
        ? requestPolicy.defaultRetryAfterMs / 1000
        : Number(header);
    if (!Number.isFinite(seconds) || seconds <= 0) {
      return requestPolicy.maxRetryAfterMs;
    }
    return Math.min(seconds * 1000, requestPolicy.maxRetryAfterMs);
  }

  function validate(query: Query): void {
    const stripped = strippedQuery(query.q);
    const length = Array.from(query.q.trim()).length;
    if (Array.from(stripped).length < MIN_Q_CHARS || length > MAX_Q_CHARS) {
      throw new AutocompleteError({
        kind: "query_invalid",
        message: `q must be ${MIN_Q_CHARS} to ${MAX_Q_CHARS} characters`,
      });
    }
    if (
      query.limit !== undefined &&
      (!Number.isInteger(query.limit) ||
        query.limit < 1 ||
        query.limit > MAX_LIMIT)
    ) {
      throw new AutocompleteError({
        kind: "query_invalid",
        message: `limit must be an integer from 1 to ${MAX_LIMIT}`,
      });
    }
  }

  // Every request that got an answer moved `requestsSinceMint` (and perhaps
  // `lastIndexTag` or `pivotsExceededEvents`), so the snapshot is stale by the
  // time its event goes out, refused or not.
  function emitRequest(event: RequestEvent): void {
    changed();
    listeners.request.forEach(handler => handler(event));
  }

  async function suggest(
    query: Query,
    { signal }: { signal?: AbortSignal } = {},
  ): Promise<SuggestResult> {
    validate(query);
    if (now() < authBrakeUntil) {
      throw new AutocompleteError({
        kind: "auth_braked",
        message: "Autocomplete unavailable: the session could not be verified",
        status: 401,
        reason: "auth_unavailable",
        until: authBrakeUntil,
      });
    }
    const filtered = hasFilters(query.filters);
    let grant = await session.getSession();
    // What this call already tried, not merely that it tried something. The
    // brake counts one thing, a grant just re-minted and refused again, and a
    // boolean could not tell that from a rate limit waited out and followed
    // by an ordinary expiry, which says nothing about auth at all.
    let attempted: Recovery = "none";
    let filtersWithheld = false;
    for (;;) {
      if (signal?.aborted) {
        throw abortError();
      }
      const shortStem_ = filtered && stemLength(query.q) < grant.filterMinStem;
      if (shortStem_ && shortStem === "throw") {
        throw new AutocompleteError({
          kind: "query_invalid",
          message: `Filters need a query of at least ${grant.filterMinStem} characters`,
        });
      }
      filtersWithheld = shortStem_ && shortStem === "withhold";
      const url = buildBusinessesUrl(baseUrl, query, {
        withFilters: !filtersWithheld,
      });
      const startedAt = elapsed();
      requestsSinceMint += 1;
      let response: ResponseLike;
      try {
        response = await fetchImpl(url, {
          headers: {
            Accept: "application/json",
            [requestPolicy.sessionHeader]: grant.sessionToken,
          },
          ...(signal !== undefined ? { signal } : {}),
          credentials: "omit",
        });
      } catch (error) {
        if (isAbortError(error)) {
          throw error;
        }
        const failure = new AutocompleteError({
          kind: "request_failed",
          message: "Autocomplete unavailable",
          status: 0,
          cause: error,
        });
        emitRequest(
          requestEvent(
            query,
            0,
            null,
            null,
            attempted,
            filtersWithheld,
            grant,
            failure,
          ),
        );
        throw failure;
      }
      const roundTripMs = Math.round(elapsed() - startedAt);
      if (response.ok) {
        consecutiveAuthFailures = 0;
        let body: unknown;
        let parsed: BusinessesResponse;
        try {
          body = await response.json();
          parsed = parseBusinessesResponse(body);
        } catch (error) {
          if (isAbortError(error)) {
            throw error;
          }
          const failure = new AutocompleteError({
            kind: "contract",
            message:
              error instanceof ContractViolation
                ? `Unexpected autocomplete response: ${error.message}`
                : "Unexpected autocomplete response",
            status: response.status,
            cause: error,
          });
          emitRequest(
            requestEvent(
              query,
              response.status,
              roundTripMs,
              response,
              attempted,
              filtersWithheld,
              grant,
              failure,
            ),
          );
          throw failure;
        }
        const indexTag = response.headers.get(requestPolicy.indexHeader);
        lastIndexTag = indexTag;
        emitRequest(
          requestEvent(
            query,
            response.status,
            roundTripMs,
            response,
            attempted,
            filtersWithheld,
            grant,
            null,
          ),
        );
        return {
          response: parsed,
          indexTag,
          requestId: response.headers.get("X-Request-ID"),
          serverTiming: response.headers.get("Server-Timing"),
          roundTripMs,
          recovery: attempted,
          filtersWithheld,
        };
      }
      const failure = await readFailure(response);
      if (failure.reason === "session_pivots_exceeded") {
        pivotsExceededEvents += 1;
      }
      const recovery = recoveryFor(response.status, failure.reason);
      if (attempted !== "none" || recovery === "none") {
        // A re-mint that did not help is what the brake counts: the grant was
        // fresh and the tier still refused it.
        if (attempted === "remint" && recovery === "remint") {
          recordAuthFailure();
        }
        const error = new AutocompleteError({
          kind: "request_failed",
          message: failure.message,
          status: response.status,
          code: failure.code,
          reason: failure.reason,
          userMessage: failure.userMessage,
          retryAfterMs: headerRetryAfterMs(response),
        });
        emitRequest(
          requestEvent(
            query,
            response.status,
            roundTripMs,
            response,
            attempted,
            filtersWithheld,
            grant,
            error,
          ),
        );
        throw error;
      }
      attempted = recovery;
      if (recovery === "remint") {
        grant = await session.getSession({ force: true });
      } else {
        await wait(retryAfterMs(response), signal);
      }
    }
  }

  function headerRetryAfterMs(response: ResponseLike): number | null {
    const seconds = Number(response.headers.get("Retry-After"));
    return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null;
  }

  function requestEvent(
    query: Query,
    status: number,
    roundTripMs: number | null,
    response: ResponseLike | null,
    recovery: Recovery,
    filtersWithheld: boolean,
    grant: Grant,
    error: AutocompleteError | null,
  ): RequestEvent {
    return {
      q: query.q,
      filtersWithheld,
      status,
      roundTripMs,
      indexTag: response?.headers.get(requestPolicy.indexHeader) ?? null,
      requestId: response?.headers.get("X-Request-ID") ?? null,
      serverTiming: response?.headers.get("Server-Timing") ?? null,
      recovery,
      requestsSinceMint,
      requestBudget: grant.requestBudget,
      error,
    };
  }

  return {
    baseUrl,
    suggest,
    getSession: options => session.getSession(options),
    prewarm: () => {
      void session.getSession({ prewarm: true }).catch(() => undefined);
    },
    reset: () => {
      consecutiveAuthFailures = 0;
      authBrakeUntil = 0;
      requestsSinceMint = 0;
      pivotsExceededEvents = 0;
      lastIndexTag = null;
      if (brakeTimer !== null) {
        clearTimeout(brakeTimer);
        brakeTimer = null;
      }
      session.reset();
    },
    getSnapshot,
    on: (event, handler) => {
      const set = listeners[event] as Set<typeof handler>;
      set.add(handler);
      return () => {
        set.delete(handler);
      };
    },
  };
}

function samePhase(a: SessionPhase, b: SessionPhase): boolean {
  if (a.phase !== b.phase) {
    return false;
  }
  switch (a.phase) {
    case "ready":
      return (
        b.phase === "ready" &&
        a.grant === b.grant &&
        a.refreshing === b.refreshing
      );
    case "minting":
      return b.phase === "minting" && a.reason === b.reason;
    case "backoff":
      return b.phase === "backoff" && a.until === b.until;
    case "unavailable":
      return b.phase === "unavailable" && a.until === b.until;
    case "idle":
      return true;
  }
}
