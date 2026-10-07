/**
 * A session's scope: the routes it may query, the relations a request on each
 * may include or filter by, and the most rows a request may ask for. The mint
 * answers it with the grant, and the autocomplete service refuses anything
 * outside it, so the SDK never sends a request the scope leaves out.
 */

import {
  LEGAL_RELATIONS,
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
 * rows never carry, is dropped: dropping one can only narrow the scope.
 */
export function parseSessionScope(value: unknown): SessionScope | null {
  if (!isRecord(value) || !isRecord(value.routes)) {
    return null;
  }
  const maxLimit = value.max_limit ?? value.maxLimit;
  if (
    typeof maxLimit !== "number" ||
    !Number.isInteger(maxLimit) ||
    maxLimit < 1 ||
    maxLimit > MAX_LIMIT
  ) {
    return null;
  }
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
