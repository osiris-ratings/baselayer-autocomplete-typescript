// The business search the demo's third step runs: `POST /searches` for a pick's
// `business_token`, answered synchronously, then the search as the API returns
// it. The call and its types live here and not in the SDK, which does not
// submit searches: that is your backend's to do.
//
// The wire types are written by hand from the API's public OpenAPI document
// and hold only what the page reads. Every field is optional or nullable, so
// one the API adds, drops or leaves null cannot break the page.

import {
  BUSINESS_TOKEN_TTL_SECONDS,
  parseErrorEnvelope,
  type BusinessStructure,
} from "@baselayer-sdk/autocomplete";

type FetchImpl = (input: string, init?: RequestInit) => Promise<Response>;

export type TaskState =
  "PENDING" | "EXECUTING" | "COMPLETED" | "FAILED" | "CANCELLED";

const STATES: readonly string[] = [
  "PENDING",
  "EXECUTING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
];

/** Whether the search has stopped: nothing in it will change. */
export function isTerminal(state: TaskState): boolean {
  return state === "COMPLETED" || state === "FAILED" || state === "CANCELLED";
}

export type MatchType = "NO_MATCH" | "SIMILAR" | "EXACT";
export type AddressMatchType =
  "NO_MATCH" | "CITY" | "STATE" | "SIMILAR" | "EXACT";

/** Baselayer's ratings: a business search carries `kyb` and `risk`. */
export interface Score {
  type: "fraud" | "risk" | "kyb";
  score: number;
  /** `A`, `B`, `C` or `F`. */
  rating: string;
}

/** What one watchlist found; `count` 0 is a list that was screened and clear. */
export interface WatchlistHit {
  /** The list's short code: `OFAC`, `IEO`, `FBI`, `CSL`, `CNS`, `OIG`, `BFC`. */
  code?: string;
  name: string;
  count: number;
  details?: Record<string, unknown>[] | null;
}

export interface Address {
  street: string;
  city: string;
  state: string;
  zip: string;
  rdi?: "Residential" | "Commercial" | null;
  deliverable?: boolean | null;
  cmra?: boolean | null;
}

export interface AddressWithSources extends Address {
  /** `SOS` or `Online`. */
  sources?: string[];
}

export interface Officer {
  name: string;
  titles?: string[];
  states?: string[];
  /** `SOS` or `Online`. */
  sources?: string[];
}

/** One filing with a Secretary of State. */
export interface Registration {
  id: string;
  name: string;
  issue_date?: string | null;
  dissolution_date?: string | null;
  file_number: string;
  state: string;
  address?: Address | null;
  registration_type?: "foreign" | "domestic" | "unknown" | null;
  status: "active" | "inactive" | "unknown";
  standing?: string | null;
  registered_agent?: { name: string; address?: Address | null } | null;
  officers?: { name: string; titles?: string[] }[];
}

export interface SecRegistration {
  cik: string;
  tickers?: string[];
  exchanges?: string[];
  sec_edgar_url?: string;
}

/** The business the search identified. */
export interface Business {
  id: string;
  name: string;
  structure?: BusinessStructure | null;
  addresses?: AddressWithSources[];
  phone_numbers?: string[];
  email?: string | null;
  website?: string | null;
  incorporation_state?: string | null;
  /** `YYYY-MM-DD`. */
  incorporation_date?: string | null;
  months_in_business?: number | null;
  primary_address?: Address | null;
  alternative_names?: string[];
  registrations?: Registration[];
  business_officers?: Officer[];
  watchlist_hits?: WatchlistHit[];
  sec_registrations?: SecRegistration[];
}

/** `POST /searches` and `GET /searches/{id}` answer with the same body. */
export interface Search {
  id: string;
  state: TaskState;
  /** For a pick: the business's name, as the API recorded it. */
  name?: string;
  /** For a pick: its first filed address, else its state's code. */
  address?: string;
  search_address?: Address | null;
  /** The officers the search carries; for a pick, the one its token matched. */
  officer_names?: string[] | null;
  business_name_match?: MatchType | null;
  business_address_match?: AddressMatchType | null;
  business_officer_match?: MatchType | null;
  /** True when the business's KYB rating is an A or a B. */
  verified?: boolean | null;
  scores?: Score[] | null;
  watchlist_hits?: WatchlistHit[];
  warnings?: string[];
  /** Why a `FAILED` search failed: `No match found.` for a business that is gone. */
  error?: string | null;
  created_at?: string;
  updated_at?: string | null;
  business?: Business | null;
  console_url?: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The search in a body, or null when it is not one. An id and a state this
 * page knows are all it needs to hold on to; the rest is read leniently.
 */
export function parseSearch(body: unknown): Search | null {
  if (!isObject(body)) {
    return null;
  }
  const { id, state } = body;
  if (typeof id !== "string" || typeof state !== "string") {
    return null;
  }
  return STATES.includes(state) ? (body as unknown as Search) : null;
}

/** How long the API holds the request for a finished search, at most. */
export const SEARCH_WAIT_SECONDS = 90;
/** Past that wait, the page asks after the search this often... */
const POLL_MS = 2_000;
/** ...and gives up on it after this long. */
const POLL_FOR_MS = 120_000;

/**
 * The body: the token alone. `POST /searches` takes a pick's name and address
 * from the token, and refuses it beside either.
 */
export function searchBody(businessToken: string): string {
  return JSON.stringify({ business_token: businessToken });
}

export type SearchOutcome =
  | { kind: "done"; search: Search }
  | {
      kind: "refused";
      status: number;
      code: number | null;
      message: string;
      /** The pick is the problem: stale, or not this organization's. */
      pickAgain: boolean;
    }
  | { kind: "failed"; message: string };

function firstValidationMessage(body: unknown): string | null {
  if (!isObject(body) || !Array.isArray(body["detail"])) {
    return null;
  }
  const [first] = body["detail"] as unknown[];
  return isObject(first) && typeof first["msg"] === "string"
    ? first["msg"]
    : null;
}

/** A refusal of the search, in words someone can act on. */
export function describeSearchRefusal(
  status: number,
  code: number | null,
  message: string | null,
  retryAfterSeconds: number | null = null,
): string {
  if (status === 401) return "The API does not recognize this key.";
  if (status === 402) return "The organization is locked. Contact Baselayer.";
  if (status === 403 && code === 30)
    return "The key lacks the searches.create permission.";
  if (status === 403 && code === 37)
    return "Autocomplete is not enabled for this organization, so a pick cannot be searched.";
  if (status === 422 && code === 3040)
    return "This pick does not belong to this key's organization or environment. Pick the business again.";
  if (status === 422 && code === 3042)
    return `This pick expired: it is good for ${BUSINESS_TOKEN_TTL_SECONDS / 60} minutes. Pick the business again.`;
  if (status === 422 && code === 3023)
    return "That business is no longer on file. Pick another.";
  if (status === 422 && code === 3043)
    return "The key belongs to a sandbox application; use a production application's key.";
  if (status === 429)
    return `The API is limiting this key${retryAfterSeconds !== null ? `; try again in ${retryAfterSeconds} s` : ""}.`;
  if (status === 503 && code === 3041)
    return "This deployment cannot search by pick right now.";
  if (status >= 500) return "The API could not run the search. Try again.";
  return `HTTP ${status}${code !== null ? `, code ${code}` : ""}${message !== null ? `: ${message}` : ""}`;
}

/** A search that did not come back done. */
type Unfinished = Exclude<SearchOutcome, { kind: "done" }>;

function refusal(response: Response, body: unknown): Unfinished {
  const envelope = parseErrorEnvelope(body);
  const code = envelope?.code ?? null;
  const retryAfter = Number(response.headers.get("retry-after"));
  return {
    kind: "refused",
    status: response.status,
    code,
    message: describeSearchRefusal(
      response.status,
      code,
      envelope?.message ?? firstValidationMessage(body),
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null,
    ),
    pickAgain:
      response.status === 422 &&
      (code === 3040 || code === 3042 || code === 3023),
  };
}

type Answered =
  { ok: true; body: unknown } | { ok: false; outcome: Unfinished };

/** One call: its JSON, or what to tell the reader when it did not come. */
async function ask(
  fetchImpl: FetchImpl,
  url: string,
  init: RequestInit,
): Promise<Answered> {
  let response: Response;
  try {
    response = await fetchImpl(url, init);
  } catch (error) {
    if (init.signal?.aborted === true) {
      throw error;
    }
    return {
      ok: false,
      outcome: {
        kind: "failed",
        message:
          "The API did not answer this page (most likely CORS or the network). Debug has the request.",
      },
    };
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return response.ok
    ? { ok: true, body }
    : { ok: false, outcome: refusal(response, body) };
}

function sleepFor(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted === true) {
      reject(signal.reason);
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

/**
 * A random key for the `Idempotency-Key` header. `randomUUID` exists only in
 * secure contexts, so a page served over plain http from a host that is not
 * localhost makes one from random bytes.
 */
export function newIdempotencyKey(): string {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), byte =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

const UNRECOGNIZED =
  "The API answered with something this page does not recognize.";

/**
 * Whether a question about a running search is worth asking again after it
 * failed: the network, a limit or the API's own trouble pass, while a
 * refusal of the key or of the search itself will not change.
 */
function passing(outcome: Unfinished): boolean {
  return (
    outcome.kind === "failed" || outcome.status === 429 || outcome.status >= 500
  );
}

/**
 * A question about a search that exists failed for good. The search keeps
 * running (and is billed), so the words say so, with where to find it: they
 * are not those of a search that could not be run.
 */
function lostTrackOf(search: Search, outcome: Unfinished): Unfinished {
  const why = /[.!?]$/.test(outcome.message)
    ? outcome.message
    : `${outcome.message}.`;
  return {
    kind: "failed",
    message: `Could not ask after the search: ${why} It keeps running; the console has it as ${search.id}.`,
  };
}

export interface RunSearchOptions {
  baseUrl: string;
  apiKey: string;
  businessToken: string;
  fetchImpl: FetchImpl;
  signal?: AbortSignal;
  /**
   * Names the search, so a retried call cannot make a second one: the API
   * answers a call that carries a key it has seen with the search the first
   * call made. A call that passes none gets a key of its own.
   */
  idempotencyKey?: string;
  pollMs?: number;
  pollForMs?: number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

/**
 * Runs the search for a pick and waits for its end. The API holds the request
 * (`Prefer: wait`) until the search finishes; a search it is still running
 * after that wait (a 202, or an older key's default of answering at once) is
 * asked after until it ends. Each call goes through `fetchImpl`, so Debug
 * shows every one. A search that found no business is an outcome, not an
 * error: it comes back `FAILED`, with the API's words in `error`.
 */
export async function runSearch(
  options: RunSearchOptions,
): Promise<SearchOutcome> {
  const { baseUrl, apiKey, businessToken, fetchImpl, signal } = options;
  const sleep = options.sleep ?? sleepFor;
  const pollMs = options.pollMs ?? POLL_MS;
  const pollForMs = options.pollForMs ?? POLL_FOR_MS;
  const read = {
    headers: { Accept: "application/json", "X-API-Key": apiKey },
    credentials: "omit",
    ...(signal !== undefined ? { signal } : {}),
  } satisfies RequestInit;

  const created = await ask(fetchImpl, `${baseUrl}/searches`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
      Prefer: `wait=${SEARCH_WAIT_SECONDS}`,
      "Idempotency-Key": options.idempotencyKey ?? newIdempotencyKey(),
    },
    body: searchBody(businessToken),
    credentials: "omit",
    ...(signal !== undefined ? { signal } : {}),
  });
  if (!created.ok) {
    return created.outcome;
  }
  let search = parseSearch(created.body);
  if (search === null) {
    return { kind: "failed", message: UNRECOGNIZED };
  }

  let waited = 0;
  while (!isTerminal(search.state)) {
    if (waited >= pollForMs) {
      return {
        kind: "failed",
        // Not "after 120 s": the API held the call before the page began to ask.
        message: `The search is still ${search.state.toLowerCase()}: this page asked after it for ${Math.round(pollForMs / 1000)} s and has stopped. It keeps running; the console has it as ${search.id}.`,
      };
    }
    await sleep(pollMs, signal);
    waited += pollMs;
    const status = await ask(
      fetchImpl,
      `${baseUrl}/searches/${encodeURIComponent(search.id)}/status`,
      read,
    );
    if (!status.ok) {
      // The search exists and is running: one failed question does not end
      // the wait (`waited` bounds the asking), unless asking again is futile.
      if (passing(status.outcome)) continue;
      return lostTrackOf(search, status.outcome);
    }
    const polled = parseSearch(status.body);
    if (polled === null) {
      return lostTrackOf(search, { kind: "failed", message: UNRECOGNIZED });
    }
    if (!isTerminal(polled.state)) {
      search = { ...search, state: polled.state };
      continue;
    }
    // The status is the search's state and not the search: fetch it whole.
    const whole = await ask(
      fetchImpl,
      `${baseUrl}/searches/${encodeURIComponent(search.id)}`,
      read,
    );
    if (!whole.ok) {
      if (passing(whole.outcome)) continue;
      return lostTrackOf(search, whole.outcome);
    }
    const finished = parseSearch(whole.body);
    if (finished === null) {
      return lostTrackOf(search, { kind: "failed", message: UNRECOGNIZED });
    }
    search = finished;
  }
  return { kind: "done", search };
}
