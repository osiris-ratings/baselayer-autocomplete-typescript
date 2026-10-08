/**
 * A session's scope: the routes it may query, the relations a request on each
 * may include or filter by, and the most rows a request may ask for. The mint
 * answers it with the grant, and the autocomplete service refuses anything
 * outside it, so the SDK never sends a request the scope leaves out.
 */

import { FILTER_PARAMS, setFilters, type FilterParam } from "./businesses";
import {
  LEGAL_RELATIONS,
  RELATIONS,
  ROUTE_NAMES,
  type Relation,
  type Route,
} from "./entities";

/** The most rows any session may ask for, and what a scope never exceeds. */
export const MAX_LIMIT = 20;

/** The relations a route's rows may carry. */
export type RelationsOf<R extends Route> = (typeof LEGAL_RELATIONS)[R][number];

/** Each route a session may query, and the relations a request on it may touch. */
export type ScopeRoutes = { [R in Route]?: readonly RelationsOf<R>[] };

export interface SessionScope {
  routes: ScopeRoutes;
  /** The most suggestions a request may ask for; a larger `limit` is a 422. */
  maxLimit: number;
}

/**
 * What a grant without a scope may search: the businesses route with its
 * people and addresses, and 20 rows, as the autocomplete service reads it.
 */
export const DEFAULT_SESSION_SCOPE: Readonly<SessionScope> = Object.freeze({
  routes: Object.freeze({
    businesses: LEGAL_RELATIONS.businesses,
  }),
  maxLimit: MAX_LIMIT,
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * A scope as the mint answers it (snake_case or camelCase), or null when it is
 * malformed. A route or a relation this build does not know, or one its route's
 * rows never carry, is dropped, and most rows past `MAX_LIMIT` reads as
 * `MAX_LIMIT`: either can only narrow the scope.
 */
export function parseSessionScope(value: unknown): SessionScope | null {
  if (!isRecord(value) || !isRecord(value.routes)) {
    return null;
  }
  const answeredLimit = value.max_limit ?? value.maxLimit;
  if (
    typeof answeredLimit !== "number" ||
    !Number.isInteger(answeredLimit) ||
    answeredLimit < 1
  ) {
    return null;
  }
  // Past what this build knows, it reads as its own most: an API that raised
  // its cap must narrow an older SDK, never take its typeahead down.
  const maxLimit = Math.min(answeredLimit, MAX_LIMIT);
  const answered = value.routes;
  const routes: Record<string, readonly Relation[]> = {};
  for (const route of ROUTE_NAMES) {
    const relations = answered[route];
    if (relations === undefined) {
      continue;
    }
    if (
      !Array.isArray(relations) ||
      !relations.every(relation => typeof relation === "string")
    ) {
      return null;
    }
    const legal: readonly Relation[] = LEGAL_RELATIONS[route];
    routes[route] = legal.filter(relation => relations.includes(relation));
  }
  return { routes: routes as ScopeRoutes, maxLimit };
}

/** What a request asks for that its session's scope leaves out. */
export interface ScopeViolation {
  route: Route;
  /** The relation it touches, or null when the route itself is left out. */
  relation: Relation | null;
  /** `include` or the filter parameter that touches it; null for the route. */
  param: string | null;
}

/**
 * The first thing a request on `route` asks for that `scope` leaves out (the
 * route, an `include` member, a filter on a relation), or null when the scope
 * allows all of it. The autocomplete service answers each with a 403.
 */
export function scopeViolation(
  scope: SessionScope,
  route: Route,
  request: { include?: readonly Relation[]; filters?: object },
): ScopeViolation | null {
  const granted: readonly Relation[] | undefined = scope.routes[route];
  if (granted === undefined) {
    return { route, relation: null, param: null };
  }
  for (const relation of request.include ?? []) {
    if (!granted.includes(relation)) {
      return { route, relation, param: "include" };
    }
  }
  for (const { param, relation } of setFilters(route, request.filters)) {
    if (relation !== null && !granted.includes(relation)) {
      return { route, relation, param };
    }
  }
  return null;
}

/** `value` when it names a route, else null. */
export function routeNamed(value: unknown): Route | null {
  return ROUTE_NAMES.find(route => route === value) ?? null;
}

/** `value` when it names a relation, else null. */
export function relationNamed(value: unknown): Relation | null {
  return RELATIONS.find(relation => relation === value) ?? null;
}

/**
 * The searches a page may offer under `scope`, in the SDK's order: businesses,
 * and people or addresses where the scope grants their businesses, since a
 * pick from either is one of those businesses.
 */
export function offeredRoutes(scope: SessionScope): Route[] {
  return ROUTE_NAMES.filter(route => {
    const granted: readonly Relation[] | undefined = scope.routes[route];
    return (
      granted !== undefined &&
      (route === "businesses" || granted.includes("businesses"))
    );
  });
}

/**
 * The filters a request on `route` may send under `scope`: its direct ones,
 * and the relation ones whose relation the scope grants there.
 */
export function allowedFilters(
  scope: SessionScope,
  route: Route,
): FilterParam[] {
  const granted: readonly Relation[] | undefined = scope.routes[route];
  if (granted === undefined) {
    return [];
  }
  const params: readonly FilterParam[] = FILTER_PARAMS[route];
  return params.filter(
    ({ relation }) => relation === null || granted.includes(relation),
  );
}
