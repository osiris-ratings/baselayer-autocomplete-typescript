import {
  MAX_Q_CHARS,
  MIN_Q_CHARS,
  buildSuggestUrl,
  hasFilters,
  recoveryFor,
  stemLength,
  strippedQuery,
  type Query,
  type Recovery,
  type RouteQuery,
  type ShortStemPolicy,
} from "./businesses";
import { ROUTE_NAMES, type Relation, type Route } from "./entities";
import {
  charsUntilFilters,
  fallbackFilterRules,
  parseFilterRules,
  personNameCount,
  stemCount,
  type FilterRule,
} from "./filter-gate";
import {
  AutocompleteError,
  abortError,
  isAbortError,
  type RouteUnserved,
} from "./errors";
import type { MintFunction } from "./mint";
import {
  DEFAULT_SESSION_SCOPE,
  MAX_LIMIT,
  parseSessionScope,
  relationNamed,
  routeNamed,
  scopeViolation,
  type SessionScope,
} from "./scope";
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
  ROUTE_UNSERVED_REASONS,
  filterStemRefused,
  firstValidationMessage,
  parseErrorEnvelope,
  parseSuggestResponse,
  unaskedResponse,
  type SuggestResponse,
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
  /**
   * The API host the autocomplete service answers on, e.g.
   * `https://api.baselayer.com`.
   */
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
  /**
   * Filters on a query shorter than the grant's stem: the query waits, asked
   * of no one (default), is asked without them, is sent with them anyway, or is
   * refused locally.
   */
  onShortStem?: ShortStemPolicy;
}

export interface SearchResult<R extends Relation = "businesses"> {
  response: SuggestResponse<R>;
  /** `X-Autocomplete-Index` of the artifact that answered. */
  indexTag: string | null;
  requestId: string | null;
  serverTiming: string | null;
  /** The round trip of the reply that succeeded, not the recovery before it. */
  roundTripMs: number;
  recovery: Recovery;
  /** The query carried filters and the stem was too short for them: asked without. */
  filtersWithheld: boolean;
  /**
   * The query carried filters and its text was too short for them: not asked,
   * or asked and refused by the service for that. `response` is then empty,
   * not the autocomplete service's answer, and `indexTag` is null. Absent reads as false: a result built
   * before this field existed has none.
   */
  filtersWaiting?: boolean;
  /** Characters the query still lacks before its filters engage; 0 or absent unless `filtersWaiting`. */
  charsNeeded?: number;
}

/** A search on `GET /autocomplete/businesses`. */
export type SuggestResult = SearchResult<"businesses">;

export interface BrakeState {
  until: number;
}

export interface ClientSnapshot {
  session: SessionPhase;
  brake: BrakeState | null;
  usage: {
    /** Autocomplete requests on the current grant, counted here, every route. */
    requestsSinceMint: number;
    /**
     * The same, per route: the autocomplete service budgets each route's
     * requests on its own (`requestBudget` per route).
     */
    requestsByRoute: Record<Route, number>;
    requestBudget: number | null;
    pivotAllowance: number | null;
    /**
     * How many times the autocomplete service refused a session for pivoting
     * (482).
     */
    pivotsExceededEvents: number;
  };
  lastIndexTag: string | null;
  generation: number;
}

export interface RequestEvent {
  /** The route asked. */
  relation: Relation;
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
  /** Requests on this route on the grant, this one included. */
  requestsOnRoute: number;
  requestBudget: number | null;
  error: AutocompleteError | null;
}

export interface ClientEvents {
  stateChange: (snapshot: ClientSnapshot) => void;
  mint: (event: MintEvent) => void;
  request: (event: RequestEvent) => void;
}

export interface AutocompleteClient {
  /** Business suggestions for one keystroke, recovering at most once. */
  suggest(
    query: Query,
    options?: { signal?: AbortSignal },
  ): Promise<SuggestResult>;
  /**
   * Suggestions for one keystroke on any route, recovering at most once. One
   * session serves every route its scope allows; its budget is counted per
   * route by the autocomplete service. A route, an `include` member or a
   * filter the scope leaves out is refused before anything is sent.
   */
  search<R extends Relation>(
    relation: R,
    query: RouteQuery<R>,
    options?: { signal?: AbortSignal },
  ): Promise<SearchResult<R>>;
  /**
   * The characters a query still lacks before the client would ask it, when
   * the grant in hand already says so: its filters need more text than it has
   * and `onShortStem` is `wait`. Synchronous, and 0 when the query would be
   * asked, when a filter is outside the scope (`search` refuses that), and
   * while no grant is held, which only a mint can tell. Optional so that a
   * client written before it existed, a test double say, is still a client.
   */
  charsToFilters?<R extends Relation>(
    relation: R,
    query: RouteQuery<R>,
  ): number;
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
  /**
   * The policy for a filtered query too short for its filters, as the client
   * was configured with it. Optional, so a client written before it existed is
   * still a client; the hooks read it to know whether a query may wait.
   */
  readonly onShortStem?: ShortStemPolicy | undefined;
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
    // A release before scopes stored none: that grant reads as the default.
    const scope =
      stored.grant?.scope === undefined
        ? DEFAULT_SESSION_SCOPE
        : parseSessionScope(stored.grant.scope);
    if (
      stored.origin !== pageOrigin() ||
      typeof stored.grant?.sessionToken !== "string" ||
      typeof stored.grant.expiresAt !== "number" ||
      now >= stored.grant.expiresAt ||
      scope === null
    ) {
      store.removeItem(key);
      return null;
    }
    // The rules are read again, not trusted: storage is the page's to change.
    const { filterRules: storedRules, ...rest } = stored.grant;
    const filterRules = parseFilterRules(storedRules);
    return {
      ...rest,
      scope,
      ...(filterRules !== undefined ? { filterRules } : {}),
    };
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
  metadata: Record<string, unknown> | null;
  /** The stem a 422 says the filters wait for; null when it says none. */
  filterStem: number | null;
}

async function readFailure(response: ResponseLike): Promise<Failure> {
  const fallback = `Autocomplete unavailable (HTTP ${response.status})`;
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return {
      message: fallback,
      userMessage: null,
      reason: null,
      code: null,
      metadata: null,
      filterStem: null,
    };
  }
  const envelope = parseErrorEnvelope(body);
  if (envelope === null) {
    return {
      message: fallback,
      userMessage: null,
      reason: null,
      code: null,
      metadata: null,
      filterStem: null,
    };
  }
  const reason = envelope.metadata?.reason;
  // A 422 says what failed in `metadata.errors`; its own message is generic.
  const said = firstValidationMessage(envelope) ?? envelope.message;
  return {
    message: said.length > 0 ? said : fallback,
    userMessage: said.length > 0 ? said : null,
    reason: typeof reason === "string" ? reason : null,
    code: envelope.code,
    metadata: envelope.metadata,
    filterStem: filterStemRefused(envelope),
  };
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

function noRequests(): Record<Route, number> {
  return Object.fromEntries(ROUTE_NAMES.map(route => [route, 0])) as Record<
    Route,
    number
  >;
}

/** A 503's reading as a route the deployment cannot answer yet, or null. */
function routeUnservedOf(
  metadata: Record<string, unknown> | null,
): RouteUnserved | null {
  const reason = ROUTE_UNSERVED_REASONS.find(
    known => known === metadata?.reason,
  );
  if (reason === undefined) {
    return null;
  }
  const integer = (value: unknown) =>
    typeof value === "number" && Number.isInteger(value) ? value : null;
  return {
    reason,
    current: integer(metadata?.current),
    required: integer(metadata?.required),
  };
}

/** The scope codes the autocomplete service refuses a request with, on a 403. */
const OUT_OF_SCOPE_CODES = new Set([501, 502]);

/**
 * The refusal for a query its session's scope cannot serve, before anything is
 * sent: a route, an `include` member or a filter it leaves out, or a `limit`
 * past its most. Null when the scope allows the query.
 */
function outOfScope(
  route: Route,
  query: RouteQuery<Route>,
  scope: SessionScope,
): AutocompleteError | null {
  const violation = scopeViolation(scope, route, {
    ...(query.include !== undefined ? { include: query.include } : {}),
    ...(query.filters !== undefined ? { filters: query.filters } : {}),
  });
  if (violation !== null) {
    return new AutocompleteError({
      kind: "out_of_scope",
      message:
        violation.relation === null
          ? `This session may not search ${route}`
          : `This session may not reach ${violation.relation} on ${route} (${violation.param})`,
      ...violation,
    });
  }
  if (query.limit !== undefined && query.limit > scope.maxLimit) {
    return new AutocompleteError({
      kind: "query_invalid",
      message: `limit must be at most ${scope.maxLimit}, this session's most`,
    });
  }
  return null;
}

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
  const shortStem = config.onShortStem ?? "wait";
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
  let requestsByRoute = noRequests();
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
          requestsByRoute = noRequests();
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
        requestsByRoute: { ...requestsByRoute },
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

  function validate(query: RouteQuery<Relation>): void {
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

  async function search<R extends Relation>(
    relation: R,
    query: RouteQuery<R>,
    { signal }: { signal?: AbortSignal } = {},
  ): Promise<SearchResult<R>> {
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
      // Checked against the grant in hand, which a re-mint may have replaced.
      const refused = outOfScope(relation, query, grant.scope);
      if (refused !== null) {
        throw refused;
      }
      const missing = missingChars(relation, query, grant);
      if (missing > 0 && shortStem === "throw") {
        throw new AutocompleteError({
          kind: "query_invalid",
          message: `Filters need a query of at least ${grant.filterMinStem} characters`,
        });
      }
      if (missing > 0 && shortStem === "wait") {
        return {
          response: unaskedResponse(relation, query.q),
          indexTag: null,
          requestId: null,
          serverTiming: null,
          roundTripMs: 0,
          recovery: attempted,
          filtersWithheld: false,
          filtersWaiting: true,
          charsNeeded: missing,
        };
      }
      filtersWithheld = missing > 0 && shortStem === "withhold";
      const url = buildSuggestUrl(baseUrl, relation, query, {
        withFilters: !filtersWithheld,
      });
      const startedAt = elapsed();
      requestsSinceMint += 1;
      requestsByRoute[relation] += 1;
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
            relation,
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
        let parsed: SuggestResponse<R>;
        try {
          body = await response.json();
          parsed = parseSuggestResponse(relation, body);
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
              relation,
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
            relation,
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
          filtersWaiting: false,
          charsNeeded: 0,
        };
      }
      const failure = await readFailure(response);
      if (failure.reason === "session_pivots_exceeded") {
        pivotsExceededEvents += 1;
      }
      if (
        shortStem === "wait" &&
        response.status === 422 &&
        failure.filterStem !== null &&
        hasFilters(relation, query.filters)
      ) {
        // The service still refuses what the client let through (a business
        // name too wide for a short name, a count that drifted, a stem since
        // changed): not an outage, only the filters waiting. It refused the
        // request before admitting it, so none was spent.
        requestsSinceMint = Math.max(0, requestsSinceMint - 1);
        requestsByRoute[relation] = Math.max(0, requestsByRoute[relation] - 1);
        const rule = ruleFor(relation, grant);
        const counted = (rule.count === "stem" ? stemCount : personNameCount)(
          query.q,
        );
        emitRequest(
          requestEvent(
            relation,
            query,
            response.status,
            roundTripMs,
            response,
            attempted,
            false,
            grant,
            null,
          ),
        );
        return {
          response: unaskedResponse(relation, query.q),
          indexTag: null,
          requestId: response.headers.get("X-Request-ID"),
          serverTiming: response.headers.get("Server-Timing"),
          roundTripMs,
          recovery: attempted,
          filtersWithheld: false,
          filtersWaiting: true,
          charsNeeded: Math.max(1, failure.filterStem - counted),
        };
      }
      const recovery = recoveryFor(response.status, failure.reason);
      if (attempted !== "none" || recovery === "none") {
        // A re-mint that did not help is what the brake counts: the grant was
        // fresh and the autocomplete service still refused it.
        if (attempted === "remint" && recovery === "remint") {
          recordAuthFailure();
        }
        const outside =
          response.status === 403 &&
          failure.code !== null &&
          OUT_OF_SCOPE_CODES.has(failure.code);
        const unserved =
          response.status === 503 ? routeUnservedOf(failure.metadata) : null;
        const error = new AutocompleteError({
          kind: outside
            ? "out_of_scope"
            : unserved !== null
              ? "route_unserved"
              : "request_failed",
          message: failure.message,
          status: response.status,
          code: failure.code,
          reason: failure.reason,
          userMessage: failure.userMessage,
          retryAfterMs: headerRetryAfterMs(response),
          ...(outside
            ? {
                // The mint names the route, the service the parameter.
                route: routeNamed(failure.metadata?.route) ?? relation,
                relation: relationNamed(failure.metadata?.relation),
                param:
                  typeof failure.metadata?.param === "string"
                    ? failure.metadata.param
                    : null,
              }
            : {}),
          ...(unserved !== null ? { route: relation, unserved } : {}),
        });
        emitRequest(
          requestEvent(
            relation,
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

  /** The service's rule for `relation` filters under `grant`. */
  function ruleFor(relation: Relation, grant: Grant): FilterRule {
    return (
      grant.filterRules?.[relation] ??
      fallbackFilterRules(grant.filterMinStem)[relation]
    );
  }

  /**
   * Characters the filters of `query` need beyond what its text has. `wait`
   * reads the service's rules; `withhold` and `throw` keep the one stem and
   * count they always had.
   */
  function missingChars<R extends Relation>(
    relation: R,
    query: RouteQuery<R>,
    grant: Grant,
  ): number {
    if (shortStem === "wait") {
      return charsUntilFilters(relation, query, ruleFor(relation, grant));
    }
    return hasFilters(relation, query.filters)
      ? Math.max(0, grant.filterMinStem - stemLength(query.q))
      : 0;
  }

  function charsToFilters<R extends Relation>(
    relation: R,
    query: RouteQuery<R>,
  ): number {
    if (shortStem !== "wait") {
      return 0;
    }
    const held = session.phase();
    if (held.phase !== "ready") {
      return 0;
    }
    return outOfScope(relation, query, held.grant.scope) === null
      ? missingChars(relation, query, held.grant)
      : 0;
  }

  function headerRetryAfterMs(response: ResponseLike): number | null {
    const seconds = Number(response.headers.get("Retry-After"));
    return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null;
  }

  function requestEvent(
    relation: Relation,
    query: RouteQuery<Relation>,
    status: number,
    roundTripMs: number | null,
    response: ResponseLike | null,
    recovery: Recovery,
    filtersWithheld: boolean,
    grant: Grant,
    error: AutocompleteError | null,
  ): RequestEvent {
    return {
      relation,
      q: query.q,
      filtersWithheld,
      status,
      roundTripMs,
      indexTag: response?.headers.get(requestPolicy.indexHeader) ?? null,
      requestId: response?.headers.get("X-Request-ID") ?? null,
      serverTiming: response?.headers.get("Server-Timing") ?? null,
      recovery,
      requestsSinceMint,
      requestsOnRoute: requestsByRoute[relation],
      requestBudget: grant.requestBudget,
      error,
    };
  }

  return {
    baseUrl,
    suggest: (query, options) => search("businesses", query, options),
    search,
    onShortStem: shortStem,
    charsToFilters,
    getSession: options => session.getSession(options),
    prewarm: () => {
      void session.getSession({ prewarm: true }).catch(() => undefined);
    },
    reset: () => {
      consecutiveAuthFailures = 0;
      authBrakeUntil = 0;
      requestsSinceMint = 0;
      requestsByRoute = noRequests();
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
