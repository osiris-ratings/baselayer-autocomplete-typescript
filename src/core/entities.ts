/**
 * The entities autocomplete searches, and a route per entity: one
 * `GET /autocomplete/{route}` per entity type, each row a `type` of that
 * entity, each route expanding its own set of related entities.
 *
 * The route and relation names, and which relations each route's rows carry,
 * are the session scope's contract (`contracts/autocomplete-scope.json`): the
 * API, the autocomplete service and this SDK all carry them, and a test pins
 * these tables to it.
 */

/** The routes a session's scope may name, in the order the SDK lists them. */
export const ROUTE_NAMES = ["businesses", "people", "addresses"] as const;

/** A route: the path segment after `/autocomplete/`. */
export type Route = (typeof ROUTE_NAMES)[number];

/** The relations a row may carry, in the order the SDK lists them. */
export const RELATIONS = ["businesses", "people", "addresses"] as const;

/** The singular value on a row: what the row is. */
export type EntityType = "business" | "person" | "address";

/** The plural token: an `include` value, a `sources` key, a `related` key. */
export type Relation = (typeof RELATIONS)[number];

/**
 * The relations each route's rows may carry, and so the only ones a session's
 * scope may grant it.
 */
export const LEGAL_RELATIONS = {
  businesses: ["people", "addresses"],
  people: ["businesses", "addresses"],
  addresses: ["businesses", "people"],
} as const satisfies Record<Route, readonly Relation[]>;

export const RELATION_OF = {
  business: "businesses",
  person: "people",
  address: "addresses",
} as const satisfies Record<EntityType, Relation>;

export const ENTITY_OF = {
  businesses: "business",
  people: "person",
  addresses: "address",
} as const satisfies Record<Relation, EntityType>;

export interface RouteSpec {
  path: string;
  entity: EntityType;
  /** The relations the route can expand, and so the keys of its `sources` and `related`. */
  includes: readonly Relation[];
  /** What it expands when `include` is omitted. */
  defaultInclude: readonly Relation[];
  /** Answered by the autocomplete service today. */
  served: boolean;
}

export const ROUTES = {
  businesses: {
    path: "/autocomplete/businesses",
    entity: "business",
    includes: LEGAL_RELATIONS.businesses,
    defaultInclude: ["people", "addresses"],
    served: true,
  },
  people: {
    path: "/autocomplete/people",
    entity: "person",
    includes: LEGAL_RELATIONS.people,
    defaultInclude: ["businesses"],
    served: false,
  },
  addresses: {
    path: "/autocomplete/addresses",
    entity: "address",
    includes: LEGAL_RELATIONS.addresses,
    defaultInclude: ["businesses"],
    served: false,
  },
} as const satisfies Record<Route, RouteSpec>;

/** The relations a route can expand. */
export type IncludeOf<R extends Route> = (typeof ROUTES)[R]["includes"][number];
