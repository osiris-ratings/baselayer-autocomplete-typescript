import { ROUTES, type IncludeOf, type Relation } from "./entities";

/** A person's role on a business: what `sos_officers` records. */
export type PersonRole = "officer" | "agent";
/** Which side of a lien a party is on. */
export type LienPartyRole = "debtor" | "secured_party";
/** What an address is to the entity that holds it. */
export type AddressRole = "principal" | "mailing" | "agent" | "officer";
export type LienStatus = "active" | "lapsed" | "terminated";

/**
 * Narrowing filters on `GET /autocomplete/businesses`: exactly the set the
 * tier serves today, which answers 422 to any other parameter.
 */
export interface Filters {
  /** Any state the family is registered in; sent as ONE comma-joined `state`. */
  state?: string[];
  /** The root registration's state. */
  domicileState?: string;
  person?: { name?: string; role?: PersonRole };
  address?: {
    text?: string;
    city?: string;
    postalCode?: string;
    state?: string;
  };
}

interface BusinessRelationFilter {
  name?: string;
  state?: string[];
}

interface AddressRelationFilter {
  text?: string;
  city?: string;
  postalCode?: string[];
  state?: string[];
  role?: AddressRole[];
}

/** Not served yet: the working specification's filters on `/autocomplete/people`. */
export interface PeopleFilters {
  state?: string[];
  business?: BusinessRelationFilter;
  address?: AddressRelationFilter;
  lien?: { state?: string[]; status?: LienStatus[]; role?: LienPartyRole[] };
}

/** Not served yet: the working specification's filters on `/autocomplete/addresses`. */
export interface AddressesFilters {
  state?: string[];
  business?: BusinessRelationFilter;
  person?: { name?: string; role?: PersonRole[] };
}

/** Not served yet: the working specification's filters on `/autocomplete/liens`. */
export interface LiensFilters {
  /** The filing state. */
  state?: string[];
  business?: BusinessRelationFilter;
  person?: { name?: string; role?: LienPartyRole[] };
  address?: AddressRelationFilter;
  /** The row's own status: on this route the lien is the row. */
  lien?: { status?: LienStatus[] };
}

export interface FiltersByRelation {
  businesses: Filters;
  people: PeopleFilters;
  addresses: AddressesFilters;
  liens: LiensFilters;
}

/** One keystroke's query on a route. */
export interface RouteQuery<R extends Relation> {
  /** The text as typed. */
  q: string;
  /** 1 to 20; omitted, the tier answers 10. */
  limit?: number;
  /** Omitted, the tier expands the route's default relations. */
  include?: IncludeOf<R>[];
  /** Subject to the grant's `filterMinStem`; see `onShortStem`. */
  filters?: FiltersByRelation[R];
}

/** A query on `GET /autocomplete/businesses`. */
export type Query = RouteQuery<"businesses">;

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

/**
 * Every filter parameter a route can take, in the one order they are sent.
 * The tier parses strictly (an unknown or repeated parameter is a 422), and
 * a fixed order keeps one query one URL.
 */
const FILTER_PARAMS: {
  param: string;
  path: readonly [string] | readonly [string, string];
}[] = [
  { param: "state", path: ["state"] },
  { param: "domicile_state", path: ["domicileState"] },
  { param: "person.name", path: ["person", "name"] },
  { param: "person.role", path: ["person", "role"] },
  { param: "business.name", path: ["business", "name"] },
  { param: "business.state", path: ["business", "state"] },
  { param: "address.text", path: ["address", "text"] },
  { param: "address.city", path: ["address", "city"] },
  { param: "address.postal_code", path: ["address", "postalCode"] },
  { param: "address.state", path: ["address", "state"] },
  { param: "address.role", path: ["address", "role"] },
  { param: "lien.state", path: ["lien", "state"] },
  { param: "lien.status", path: ["lien", "status"] },
  { param: "lien.role", path: ["lien", "role"] },
];

/** The value a parameter carries: trimmed text, or a non-empty comma list. */
function paramValue(value: unknown): string | null {
  if (typeof value === "string") {
    return value.trim().length > 0 ? value : null;
  }
  if (Array.isArray(value)) {
    const items = value.filter(
      (item): item is string => typeof item === "string" && item.trim() !== "",
    );
    return items.length > 0 ? items.join(",") : null;
  }
  return null;
}

/** The filter parameters a query sends, in order. */
export function filterParams(filters: object | undefined): [string, string][] {
  if (filters === undefined) {
    return [];
  }
  const record = filters as Record<string, unknown>;
  const out: [string, string][] = [];
  for (const { param, path } of FILTER_PARAMS) {
    const [head, field] = path;
    const holder = record[head];
    const value =
      field === undefined
        ? holder
        : typeof holder === "object" && holder !== null
          ? (holder as Record<string, unknown>)[field]
          : undefined;
    const text = paramValue(value);
    if (text !== null) {
      out.push([param, text]);
    }
  }
  return out;
}

/** Whether a query carries any filter, on any route. */
export function hasFilters(filters: object | undefined): boolean {
  return filterParams(filters).length > 0;
}

/**
 * The request URL for a route. Parameters are emitted once each, in a fixed
 * order, and only when set: the tier parses strictly and answers 422 to an
 * unknown or repeated one.
 */
export function buildSuggestUrl<R extends Relation>(
  baseUrl: string,
  relation: R,
  query: RouteQuery<R>,
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
  if (withFilters) {
    for (const [param, value] of filterParams(query.filters)) {
      params.set(param, value);
    }
  }
  return `${baseUrl.replace(/\/+$/, "")}${ROUTES[relation].path}?${params.toString()}`;
}

/** The request URL for `GET /autocomplete/businesses`. */
export function buildBusinessesUrl(
  baseUrl: string,
  query: Query,
  options: { withFilters?: boolean } = {},
): string {
  return buildSuggestUrl(baseUrl, "businesses", query, options);
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
