/**
 * The entities autocomplete searches, and a route per entity, as the working
 * specification lays them out: one `GET /autocomplete/{relation}` per entity
 * type, each row a `type` of that entity, each route expanding its own set of
 * related entities.
 *
 * Only `businesses` is served today. The others are here so a route going
 * live is a row flipping to `served`, not a new shape for every host: their
 * row types and filters are the specification's and may still move.
 */

/** The singular value on a row: what the row is. */
export type EntityType = "business" | "person" | "address" | "lien";

/** The plural token: the route's path segment, an `include` value, a `sources` key. */
export type Relation = "businesses" | "people" | "addresses" | "liens";

export const RELATION_OF = {
  business: "businesses",
  person: "people",
  address: "addresses",
  lien: "liens",
} as const satisfies Record<EntityType, Relation>;

export const ENTITY_OF = {
  businesses: "business",
  people: "person",
  addresses: "address",
  liens: "lien",
} as const satisfies Record<Relation, EntityType>;

export interface RouteSpec {
  path: string;
  entity: EntityType;
  /** The relations the route can expand, and so the keys of its `sources` and `related`. */
  includes: readonly Relation[];
  /** What it expands when `include` is omitted. */
  defaultInclude: readonly Relation[];
  /** Answered by the tier today. */
  served: boolean;
}

export const ROUTES = {
  businesses: {
    path: "/autocomplete/businesses",
    entity: "business",
    includes: ["people", "addresses", "liens"],
    defaultInclude: ["people", "addresses"],
    served: true,
  },
  people: {
    path: "/autocomplete/people",
    entity: "person",
    includes: ["businesses", "addresses", "liens"],
    defaultInclude: ["businesses"],
    served: false,
  },
  addresses: {
    path: "/autocomplete/addresses",
    entity: "address",
    includes: ["businesses", "people"],
    defaultInclude: ["businesses"],
    served: false,
  },
  liens: {
    path: "/autocomplete/liens",
    entity: "lien",
    includes: ["businesses", "people", "addresses"],
    defaultInclude: ["businesses", "people"],
    served: false,
  },
} as const satisfies Record<Relation, RouteSpec>;

/** The relations a route can expand. */
export type IncludeOf<R extends Relation> =
  (typeof ROUTES)[R]["includes"][number];
