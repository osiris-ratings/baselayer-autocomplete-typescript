import { ROUTES, type IncludeOf, type Relation, type Route } from "./entities";
import type { RelatedRole } from "./wire";

/** A person's role on a business. */
export type PersonRole = Extract<RelatedRole, "officer" | "agent">;

/**
 * Narrowing filters on `GET /autocomplete/businesses`: exactly the set the
 * autocomplete service serves today, which answers 422 to any other parameter.
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

/**
 * Narrowing filters on `GET /autocomplete/people`. A name or an address is
 * free text of at most 256 characters; an empty one filters nothing. The
 * business filters hold together: one business meets them all.
 */
export interface PeopleFilters {
  business?: {
    /** Keeps the people who hold a role on a business in any of these states. */
    state?: string[];
    /**
     * Keeps the people who hold a role on a business whose name fits, matched
     * as on the businesses route.
     */
    name?: string;
  };
  address?: {
    /**
     * Keeps the people who filed from an address that fits, or hold a role on
     * a business whose own principal or mailing office fits, matched as `q` is
     * on the addresses route. A registered agent never matches, either way.
     */
    text?: string;
  };
}

/**
 * Narrowing filters on `GET /autocomplete/addresses`. A name is free text of
 * at most 256 characters; an empty one filters nothing.
 */
export interface AddressesFilters {
  /** The address's own state, any of these. */
  state?: string[];
  /** Keeps the addresses a person whose name fits filed from. */
  person?: { name?: string };
  /**
   * Keeps the addresses a business whose name fits has as its own principal
   * or mailing office (never its registered agent's), matched as on the
   * businesses route.
   */
  business?: { name?: string };
}

export interface FiltersByRelation {
  businesses: Filters;
  people: PeopleFilters;
  addresses: AddressesFilters;
}

/** One keystroke's query on a route. */
export interface RouteQuery<R extends Route> {
  /** The text as typed. */
  q: string;
  /** 1 to 20; omitted, the autocomplete service answers 10. */
  limit?: number;
  /**
   * Omitted, the autocomplete service expands the route's default relations.
   */
  include?: IncludeOf<R>[];
  /** Subject to the grant's `filterMinStem`; see `onShortStem`. */
  filters?: FiltersByRelation[R];
}

/** A query on `GET /autocomplete/businesses`. */
export type Query = RouteQuery<"businesses">;

/** What to do with filters on a query shorter than the grant's filter stem. */
export type ShortStemPolicy = "withhold" | "send" | "throw";

/** The autocomplete service's own floor and ceiling on `q`. */
export const MIN_Q_CHARS = 2;
export const MAX_Q_CHARS = 256;

const METACHARACTERS = new Set(["%", "_", "*", "?"]);

/**
 * A character that is, or NFKC-folds to, one of the autocomplete service's
 * pattern metacharacters.
 */
function foldsToMetacharacter(character: string): boolean {
  if (METACHARACTERS.has(character)) {
    return true;
  }
  const folded = character.normalize("NFKC");
  return folded.length === 1 && METACHARACTERS.has(folded);
}

/**
 * `q` as the autocomplete service measures its floor: trimmed, pattern
 * metacharacters removed.
 */
export function strippedQuery(q: string): string {
  return Array.from(q.trim())
    .filter(character => !foldsToMetacharacter(character))
    .join("");
}

const COMBINING_MARK = /\p{M}/gu;
const ALPHANUMERIC = /[\p{L}\p{N}]/u;

/**
 * The autocomplete service's `depunct`: folded (NFD, marks dropped,
 * lower-cased), `&` read as `and`, every run of non-alphanumerics one space,
 * trimmed. The filter stem is measured on this.
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

/**
 * Characters of `q` the autocomplete service compares against the grant's
 * filter stem.
 */
export function stemLength(q: string): number {
  return Array.from(depunct(strippedQuery(q))).length;
}

export interface FilterParam {
  /** The query parameter. */
  param: string;
  /** Where its value sits in the route's filters. */
  path: readonly [string] | readonly [string, string];
  /** The relation it narrows by, which the session's scope must grant; null for a direct one. */
  relation: Relation | null;
}

/**
 * The filter parameters each route takes, in the one order they are sent.
 * The autocomplete service parses strictly (an unknown or repeated parameter is
 * a 422), and a fixed order keeps one query one URL.
 */
export const FILTER_PARAMS = {
  businesses: [
    { param: "state", path: ["state"], relation: null },
    { param: "domicile_state", path: ["domicileState"], relation: null },
    { param: "person.name", path: ["person", "name"], relation: "people" },
    { param: "person.role", path: ["person", "role"], relation: "people" },
    { param: "address.text", path: ["address", "text"], relation: "addresses" },
    { param: "address.city", path: ["address", "city"], relation: "addresses" },
    {
      param: "address.postal_code",
      path: ["address", "postalCode"],
      relation: "addresses",
    },
    {
      param: "address.state",
      path: ["address", "state"],
      relation: "addresses",
    },
  ],
  people: [
    {
      param: "business.state",
      path: ["business", "state"],
      relation: "businesses",
    },
    {
      param: "business.name",
      path: ["business", "name"],
      relation: "businesses",
    },
    { param: "address.text", path: ["address", "text"], relation: "addresses" },
  ],
  addresses: [
    { param: "state", path: ["state"], relation: null },
    { param: "person.name", path: ["person", "name"], relation: "people" },
    {
      param: "business.name",
      path: ["business", "name"],
      relation: "businesses",
    },
  ],
} as const satisfies Record<Route, readonly FilterParam[]>;

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

/** A filter a query sets: its parameter, the value it sends, and its relation. */
export interface SetFilter {
  param: string;
  value: string;
  relation: Relation | null;
}

/** The filters a query on `route` sets, in order; any the route does not take are ignored. */
export function setFilters(
  route: Route,
  filters: object | undefined,
): SetFilter[] {
  if (filters === undefined) {
    return [];
  }
  const record = filters as Record<string, unknown>;
  const out: SetFilter[] = [];
  for (const { param, path, relation } of FILTER_PARAMS[route]) {
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
      out.push({ param, value: text, relation });
    }
  }
  return out;
}

/** The filter parameters a query on `route` sends, in order. */
export function filterParams(
  route: Route,
  filters: object | undefined,
): [string, string][] {
  return setFilters(route, filters).map(({ param, value }) => [param, value]);
}

/** Whether a query on `route` carries any filter that route takes. */
export function hasFilters(route: Route, filters: object | undefined): boolean {
  return setFilters(route, filters).length > 0;
}

/**
 * The request URL for a route. Parameters are emitted once each, in a fixed
 * order, and only when set: the autocomplete service parses strictly and
 * answers 422 to an unknown or repeated one.
 */
export function buildSuggestUrl<R extends Route>(
  baseUrl: string,
  route: R,
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
    for (const [param, value] of filterParams(route, query.filters)) {
      params.set(param, value);
    }
  }
  return `${baseUrl.replace(/\/+$/, "")}${ROUTES[route].path}?${params.toString()}`;
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
 * What a failed reply asks the client to do, from the autocomplete service's
 * contract: every 401 means the grant is missing, invalid or expired, so
 * re-mint; a spent session budget (480) re-mints, and so does a session refused
 * for changing its query too many times (482): both say the session is done,
 * not the keystroke; `rate_limited` waits out `Retry-After`; anything else is
 * final.
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
