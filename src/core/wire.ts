/**
 * The wire shapes of `GET /autocomplete/{route}` and the error envelope, as
 * the autocomplete service serves them: snake_case, nulls spelled out. Every
 * route answers the same envelope and the same row, and each entity type adds
 * its own fields to the row (see `entities.ts`).
 *
 * Hand-written types and a small structural validator rather than a schema
 * library. Three shapes do not justify a validator dependency in a snippet
 * customers embed on their own pages, and every host would have to agree on
 * its version.
 *
 * Every closed value (`match`, `type`, `sources.*.status`, `role`,
 * `structure`) is a typed union pinned to the contract's enum, and a value
 * this build does not know is refused as a contract error: the SDK learns a
 * value before the autocomplete service sends it. One liberty is kept: the
 * keys the contract leaves out of `required` (`matched_name`,
 * `RelatedItem.token`, `role`, `RelatedSet.count`, `RelatedSet.matched`,
 * `structure`) may be absent as well as null; either reads as null.
 */

import {
  ENTITY_OF,
  ENTITY_TYPES,
  ROUTES,
  type EntityType,
  type IncludeOf,
  type Relation,
  type Route,
} from "./entities";

/** The relations `GET /autocomplete/businesses` can expand. */
export type Include = IncludeOf<"businesses">;

/** How a name fits the typed one, in the contract's order. */
export const MATCH_GRADES = ["exact", "strong", "partial"] as const;

/**
 * How the best of a row's names fits the typed name: `exact` is the name
 * itself, `strong` starts with it or has it at a later word, and `partial`
 * has every word of it. Order rows by position, never by this.
 */
export type MatchGrade = (typeof MATCH_GRADES)[number];

/** What came of a relation the request could expand, in the contract's order. */
export const SOURCE_STATUSES = ["ok", "not_requested", "unavailable"] as const;

export type SourceStatus = (typeof SOURCE_STATUSES)[number];

/** The roles a related item stands in, in the contract's order. */
export const RELATED_ROLES = [
  "officer",
  "agent",
  "principal",
  "mailing",
] as const;

/**
 * The role a related item stands in. A business's people and a person's
 * businesses: `officer` or `agent`. An address: the role it was filed under
 * (`principal`, `mailing`, `agent`, `officer`), or the role of the person
 * standing at it.
 */
export type RelatedRole = (typeof RELATED_ROLES)[number];

/** Why a deployment cannot answer a route it has yet, in the contract's order. */
export const ROUTE_UNSERVED_REASONS = [
  "index_too_old",
  "token_version_too_old",
] as const;

/**
 * `index_too_old`: the index it serves predates the route. `token_version_too_old`:
 * the tokens it seals are older than the route needs.
 */
export type RouteUnservedReason = (typeof ROUTE_UNSERVED_REASONS)[number];

export interface RelatedItem {
  /** Always the entity its relation holds: a `business` under `businesses`. */
  type: EntityType;
  /**
   * An opaque handle. A business's is a `business_token` `POST /searches`
   * redeems; a person's or an address's is redeemed nowhere yet.
   */
  token: string | null;
  label: string;
  /** Null when the filing names none. */
  role: RelatedRole | null;
  /** This item is why the row is here. */
  matched: boolean;
}

export interface RelatedSet {
  /** Total before the head cap; null when the relation was not requested. */
  count: number | null;
  /** How many satisfied a relation filter; null when none applied. */
  matched: number | null;
  truncated: boolean;
  items: RelatedItem[];
}

/**
 * One part of a name as the autocomplete service split it: a word a typed token
 * starts, or the text between such words. The parts concatenate to the name
 * they mark.
 */
export interface HighlightPart {
  text: string;
  matched: boolean;
}

/** What every row carries, whatever the route. */
export interface SuggestionBase<T extends EntityType, R extends Route> {
  type: T;
  /**
   * An opaque handle for the entity, sealed by the autocomplete service. A
   * business's is passed back verbatim as `business_token` on `POST /searches`.
   */
  token: string;
  label: string;
  /** The indexed name that matched, when it is not `label`. */
  matched_name: string | null;
  /** Order the rows by position, never by this. */
  match: MatchGrade;
  related: Record<IncludeOf<R>, RelatedSet>;
  /**
   * The name that matched, split into parts, the words a typed token starts
   * marked. Empty when the query reached the row some other way.
   */
  highlight: HighlightPart[];
}

/**
 * The legal structures the autocomplete service knows, in the order its
 * contract lists them.
 */
export const BUSINESS_STRUCTURES = [
  "SOLE_PROPRIETORSHIP",
  "GENERAL_PARTNERSHIP",
  "LLC",
  "LLP",
  "LLLP",
  "LP",
  "C_CORPORATION",
  "S_CORPORATION",
  "B_CORPORATION",
  "NONPROFIT",
  "COOPERATIVE",
  "TRUST",
  "PROFESSIONAL_ASSOCIATION",
  "PROFESSIONAL_CORPORATION",
  "TRADE_NAME",
  "BANK",
  "CREDIT_UNION",
  "INSURANCE",
  "OTHER",
] as const;

/** A business's legal structure. */
export type BusinessStructure = (typeof BUSINESS_STRUCTURES)[number];

export interface BusinessSuggestion extends SuggestionBase<
  "business",
  "businesses"
> {
  domicile_state: string;
  states: string[];
  /**
   * The legal structure the domicile registration is filed under, as the
   * autocomplete service spells it (`structureLabel` draws it); null when it is
   * not known.
   */
  structure: BusinessStructure | null;
}

/** A person, with the businesses they hold a role on. A person has no jurisdiction of its own. */
export type PersonSuggestion = SuggestionBase<"person", "people">;

export interface AddressComponents {
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postal_code: string;
}

/** An address, with the businesses filed at it. */
export interface AddressSuggestion extends SuggestionBase<
  "address",
  "addresses"
> {
  components: AddressComponents;
}

export interface SuggestionByRelation {
  businesses: BusinessSuggestion;
  people: PersonSuggestion;
  addresses: AddressSuggestion;
}

/** A row from any route. */
export type Suggestion = SuggestionByRelation[Route];

export interface Source {
  status: SourceStatus;
}

export interface SuggestResponse<R extends Route = "businesses"> {
  query: string;
  found: number;
  /** The count stopped at the cap: `found` is a floor, drawn as `500+`. */
  found_capped: boolean;
  /**
   * The autocomplete service did not finish looking, so a matching entity may
   * be missing. Absent or null reads as `false`: an autocomplete service that
   * predates the field is complete by definition.
   */
  truncated: boolean;
  /** One per relation the route can expand; read it before an empty `related`. */
  sources: Record<IncludeOf<R>, Source>;
  suggestions: SuggestionByRelation[R][];
}

export type BusinessesResponse = SuggestResponse<"businesses">;

/**
 * The catalog envelope the API and the autocomplete service answer refusals
 * with.
 */
export interface ErrorEnvelope {
  code: number;
  message: string;
  metadata: Record<string, unknown> | null;
}

/** Thrown by the parsers below; the client turns it into `kind: "contract"`. */
export class ContractViolation extends Error {
  constructor(
    readonly path: string,
    expected: string,
  ) {
    super(`${path}: expected ${expected}`);
    this.name = "ContractViolation";
  }
}

type Json = unknown;

function isObject(value: Json): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function object(value: Json, path: string): Record<string, unknown> {
  if (!isObject(value)) {
    throw new ContractViolation(path, "an object");
  }
  return value;
}

function string(value: Json, path: string): string {
  if (typeof value !== "string") {
    throw new ContractViolation(path, "a string");
  }
  return value;
}

function nonEmptyString(value: Json, path: string): string {
  const text = string(value, path);
  if (text.length === 0) {
    throw new ContractViolation(path, "a non-empty string");
  }
  return text;
}

function boolean(value: Json, path: string): boolean {
  if (typeof value !== "boolean") {
    throw new ContractViolation(path, "a boolean");
  }
  return value;
}

function count(value: Json, path: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new ContractViolation(path, "a non-negative integer");
  }
  return value;
}

function array<T>(
  value: Json,
  path: string,
  item: (v: Json, p: string) => T,
): T[] {
  if (!Array.isArray(value)) {
    throw new ContractViolation(path, "an array");
  }
  return value.map((entry, index) => item(entry, `${path}[${index}]`));
}

/** One of `values`, or a contract error naming them. */
function oneOf<T extends string>(values: readonly T[]) {
  return (value: Json, path: string): T => {
    if (typeof value !== "string" || !values.includes(value as T)) {
      throw new ContractViolation(path, `one of ${values.join(", ")}`);
    }
    return value as T;
  };
}

const matchGrade = oneOf(MATCH_GRADES);
const sourceStatus = oneOf(SOURCE_STATUSES);
const relatedRole = oneOf(RELATED_ROLES);
const businessStructure = oneOf(BUSINESS_STRUCTURES);
const entityType = oneOf(ENTITY_TYPES);

/** Absent or null reads as null; anything else must parse. */
function nullable<T>(
  value: Json,
  path: string,
  parse: (v: Json, p: string) => T,
): T | null {
  return value === undefined || value === null ? null : parse(value, path);
}

function relatedItem(
  value: Json,
  path: string,
  holds: EntityType,
): RelatedItem {
  const o = object(value, path);
  const type = entityType(o.type, `${path}.type`);
  if (type !== holds) {
    throw new ContractViolation(`${path}.type`, `"${holds}"`);
  }
  return {
    type,
    token: nullable(o.token, `${path}.token`, string),
    label: string(o.label, `${path}.label`),
    role: nullable(o.role, `${path}.role`, relatedRole),
    matched: boolean(o.matched, `${path}.matched`),
  };
}

function relatedSet(value: Json, path: string, relation: Relation): RelatedSet {
  const o = object(value, path);
  return {
    count: nullable(o.count, `${path}.count`, count),
    matched: nullable(o.matched, `${path}.matched`, count),
    truncated: boolean(o.truncated, `${path}.truncated`),
    items: array(o.items, `${path}.items`, (v, p) =>
      relatedItem(v, p, ENTITY_OF[relation]),
    ),
  };
}

function highlightPart(value: Json, path: string): HighlightPart {
  const o = object(value, path);
  return {
    text: string(o.text, `${path}.text`),
    matched: boolean(o.matched, `${path}.matched`),
  };
}

function relations<K extends Relation, T>(
  keys: readonly K[],
  value: Json,
  path: string,
  parse: (v: Json, p: string, key: K) => T,
): Record<K, T> {
  const o = object(value, path);
  const out = {} as Record<K, T>;
  for (const key of keys) {
    out[key] = parse(o[key], `${path}.${key}`, key);
  }
  return out;
}

function addressComponents(value: Json, path: string): AddressComponents {
  const o = object(value, path);
  return {
    line1: string(o.line1, `${path}.line1`),
    line2: nullable(o.line2, `${path}.line2`, string),
    city: string(o.city, `${path}.city`),
    state: string(o.state, `${path}.state`),
    postal_code: string(o.postal_code, `${path}.postal_code`),
  };
}

/** The fields each entity type adds to the row. */
const OWN_FIELDS: {
  [R in Route]: (
    o: Record<string, unknown>,
    path: string,
  ) => Omit<SuggestionByRelation[R], keyof SuggestionBase<EntityType, R>>;
} = {
  businesses: (o, path) => ({
    domicile_state: string(o.domicile_state, `${path}.domicile_state`),
    states: array(o.states, `${path}.states`, string),
    structure: nullable(o.structure, `${path}.structure`, businessStructure),
  }),
  people: () => ({}),
  addresses: (o, path) => ({
    components: addressComponents(o.components, `${path}.components`),
  }),
};

function suggestion<R extends Route>(
  relation: R,
  value: Json,
  path: string,
): SuggestionByRelation[R] {
  const o = object(value, path);
  const type = ENTITY_OF[relation];
  if (o.type !== type) {
    throw new ContractViolation(`${path}.type`, `"${type}"`);
  }
  return {
    type,
    token: nonEmptyString(o.token, `${path}.token`),
    label: string(o.label, `${path}.label`),
    matched_name: nullable(o.matched_name, `${path}.matched_name`, string),
    match: matchGrade(o.match, `${path}.match`),
    ...OWN_FIELDS[relation](o, path),
    related: relations(
      ROUTES[relation].includes,
      o.related,
      `${path}.related`,
      relatedSet,
    ),
    highlight: array(o.highlight, `${path}.highlight`, highlightPart),
  } as SuggestionByRelation[R];
}

function source(value: Json, path: string): Source {
  const o = object(value, path);
  return { status: sourceStatus(o.status, `${path}.status`) };
}

/**
 * The body of a 200 from `GET /autocomplete/{relation}`, validated. Unknown
 * keys are dropped, so the value a caller sees is exactly this type; unknown
 * enum values are kept as the strings they are.
 */
export function parseSuggestResponse<R extends Route>(
  relation: R,
  body: Json,
): SuggestResponse<R> {
  const o = object(body, "response");
  const truncated = nullable(o.truncated, "response.truncated", boolean);
  return {
    query: string(o.query, "response.query"),
    found: count(o.found, "response.found"),
    found_capped: boolean(o.found_capped, "response.found_capped"),
    truncated: truncated ?? false,
    sources: relations(
      ROUTES[relation].includes,
      o.sources,
      "response.sources",
      source,
    ),
    suggestions: array(o.suggestions, "response.suggestions", (v, p) =>
      suggestion(relation, v, p),
    ),
  } as SuggestResponse<R>;
}

/** The body of a 200 from `GET /autocomplete/businesses`, validated. */
export function parseBusinessesResponse(body: Json): BusinessesResponse {
  return parseSuggestResponse("businesses", body);
}

/** The catalog envelope, or null when the body is not one. */
export function parseErrorEnvelope(body: Json): ErrorEnvelope | null {
  if (!isObject(body)) {
    return null;
  }
  const { code, message, metadata } = body;
  if (
    typeof code !== "number" ||
    !Number.isInteger(code) ||
    typeof message !== "string"
  ) {
    return null;
  }
  if (metadata !== undefined && metadata !== null && !isObject(metadata)) {
    return null;
  }
  return { code, message, metadata: metadata ?? null };
}

/** The first `detail[].msg` of a pydantic-style 422, or null. */
export function firstValidationMessage(body: Json): string | null {
  if (!isObject(body) || !Array.isArray(body.detail)) {
    return null;
  }
  const [first] = body.detail as unknown[];
  return isObject(first) && typeof first.msg === "string" ? first.msg : null;
}
