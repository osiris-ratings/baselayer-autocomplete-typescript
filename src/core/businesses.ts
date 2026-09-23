import type { Include } from "./wire";

/** Narrowing filters on `GET /autocomplete/businesses`. */
export interface Filters {
  /** Any state the family is registered in; sent as ONE comma-joined `state`. */
  state?: string[];
  /** The root registration's state. */
  domicileState?: string;
  person?: { name?: string; role?: "officer" | "agent" };
  address?: {
    text?: string;
    city?: string;
    postalCode?: string;
    state?: string;
  };
}

export interface Query {
  /** The business name as typed. */
  q: string;
  /** 1 to 20; omitted, the tier answers 10. */
  limit?: number;
  /** Omitted, the tier includes people and addresses. */
  include?: Include[];
  /** Subject to the grant's `filterMinStem`; see `onShortStem`. */
  filters?: Filters;
}

/** What to do with filters on a query shorter than the grant's filter stem. */
export type ShortStemPolicy = "withhold" | "send" | "throw";

/** The tier's own floor and ceiling on `q`. */
export const MIN_Q_CHARS = 2;
export const MAX_Q_CHARS = 256;
export const MAX_LIMIT = 20;

const METACHARACTERS = new Set(["%", "_", "*", "?"]);

/** A character that is, or NFKC-folds to, one of the tier's pattern metacharacters. */
function foldsToMetacharacter(character: string): boolean {
  if (METACHARACTERS.has(character)) {
    return true;
  }
  const folded = character.normalize("NFKC");
  return folded.length === 1 && METACHARACTERS.has(folded);
}

/** `q` as the tier measures its floor: trimmed, pattern metacharacters removed. */
export function strippedQuery(q: string): string {
  return Array.from(q.trim())
    .filter(character => !foldsToMetacharacter(character))
    .join("");
}

const COMBINING_MARK = /\p{M}/gu;
const ALPHANUMERIC = /[\p{L}\p{N}]/u;

/**
 * The tier's `depunct`: folded (NFD, marks dropped, lower-cased), `&` read as
 * `and`, every run of non-alphanumerics one space, trimmed. The filter stem is
 * measured on this.
 */
export function depunct(text: string): string {
  const folded = text
    .normalize("NFD")
    .replace(COMBINING_MARK, "")
    .toLowerCase()
    .replace(/&/g, " and ");
  let out = "";
  let lastSpace = true;
  for (const character of folded) {
    if (ALPHANUMERIC.test(character)) {
      out += character;
      lastSpace = false;
    } else if (!lastSpace) {
      out += " ";
      lastSpace = true;
    }
  }
  return out.trim();
}

/** Characters of `q` the tier compares against the grant's filter stem. */
export function stemLength(q: string): number {
  return Array.from(depunct(strippedQuery(q))).length;
}

export function hasFilters(filters: Filters | undefined): boolean {
  if (filters === undefined) {
    return false;
  }
  const { state, domicileState, person, address } = filters;
  return (
    (state !== undefined && state.length > 0) ||
    nonEmpty(domicileState) ||
    nonEmpty(person?.name) ||
    person?.role !== undefined ||
    nonEmpty(address?.text) ||
    nonEmpty(address?.city) ||
    nonEmpty(address?.postalCode) ||
    nonEmpty(address?.state)
  );
}

function nonEmpty(value: string | undefined): value is string {
  return value !== undefined && value.trim().length > 0;
}

/**
 * The request URL. Parameters are emitted once each, in a fixed order, and
 * only when set: the tier parses strictly and answers 422 to an unknown or
 * repeated one.
 */
export function buildBusinessesUrl(
  baseUrl: string,
  query: Query,
  { withFilters = true }: { withFilters?: boolean } = {},
): string {
  const params = new URLSearchParams();
  params.set("q", query.q.trim());
  if (query.limit !== undefined) {
    params.set("limit", String(query.limit));
  }
  if (query.include !== undefined) {
    params.set("include", query.include.join(","));
  }
  const filters = withFilters ? query.filters : undefined;
  if (filters !== undefined) {
    if (filters.state !== undefined && filters.state.length > 0) {
      params.set("state", filters.state.join(","));
    }
    if (nonEmpty(filters.domicileState)) {
      params.set("domicile_state", filters.domicileState);
    }
    if (nonEmpty(filters.person?.name)) {
      params.set("person.name", filters.person.name);
    }
    if (filters.person?.role !== undefined) {
      params.set("person.role", filters.person.role);
    }
    const address = filters.address;
    if (nonEmpty(address?.text)) {
      params.set("address.text", address.text);
    }
    if (nonEmpty(address?.city)) {
      params.set("address.city", address.city);
    }
    if (nonEmpty(address?.postalCode)) {
      params.set("address.postal_code", address.postalCode);
    }
    if (nonEmpty(address?.state)) {
      params.set("address.state", address.state);
    }
  }
  return `${baseUrl.replace(/\/+$/, "")}/autocomplete/businesses?${params.toString()}`;
}

export type Recovery = "remint" | "wait" | "none";

/**
 * What a failed reply asks the client to do, from the tier's contract: every
 * 401 means the grant is missing, invalid or expired, so re-mint; a spent
 * session budget (480) re-mints, and so does a session refused for changing
 * its query too many times (482): both say the session is done, not the
 * keystroke; `rate_limited` waits out `Retry-After`; anything else is final.
 */
export function recoveryFor(status: number, reason: string | null): Recovery {
  if (status === 401) {
    return "remint";
  }
  if (status !== 429) {
    return "none";
  }
  switch (reason) {
    case "session_budget_spent":
    case "session_pivots_exceeded":
      return "remint";
    case "rate_limited":
      return "wait";
    default:
      return "none";
  }
}
