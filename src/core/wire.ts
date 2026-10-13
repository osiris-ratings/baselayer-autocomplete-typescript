/**
 * The wire shapes of `GET /autocomplete/{route}` and the error envelope, as
 * the autocomplete service serves them: snake_case, nulls spelled out. Each
 * route answers its own entity, a business row, a person row or an address
 * row, and what a row relates to is typed by what the relation holds (see
 * `entities.ts` for the routes).
 *
 * Hand-written types and a small structural validator rather than a schema
 * library. Three shapes do not justify a validator dependency in a snippet
 * customers embed on their own pages, and every host would have to agree on
 * its version.
 *
 * The contract's enums are open: `match`, `structure`, `role`, `listed_as`,
 * `sources.*.status` and a refusal's `reason` may gain values the service
 * sends before this build lists them. Each is typed `Open<Known>`, a value
 * this build lists or any other string, and one it does not list is kept as
 * the service sent it, never refused. What stays closed is each `type`: a row
 * and a related item name the one entity they are, and a relation holds one
 * entity.
 *
 * A key the contract marks `required` must be there, null where it may be
 * null. The keys it leaves out of `required` are `role` and `listed_as`, sent
 * only where the relationship has one, and a 422's `ctx`; an absent one reads
 * as null. A response from before this contract, which named how a business
 * lists an address `role` too, is refused with a message that says so, not
 * half read.
 */

import {
  ENTITY_OF,
  ROUTES,
  type EntityType,
  type IncludeOf,
  type Relation,
  type Route,
} from "./entities";

/** The relations `GET /autocomplete/businesses` can expand. */
export type Include = IncludeOf<"businesses">;

/**
 * A value of an enum the contract leaves open: one of `Known`, or any other
 * string the autocomplete service sends ahead of this build. Compare it to
 * the values you handle and treat the rest as "other", showing it as it is.
 */
export type Open<Known extends string> =
  Known | (string & Record<never, never>);

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

/** The roles a person holds on a business, in the contract's order. */
export const PERSON_ROLES = ["officer", "agent"] as const;

/**
 * The role a person holds on a business: `officer`, or `agent`, the registered
 * agent. Sent on a person listed under a business and on a business listed
 * under a person.
 */
export type PersonRole = (typeof PERSON_ROLES)[number];

/** How an address is listed on a business, in the contract's order. */
export const ADDRESS_LISTINGS = [
  "principal",
  "mailing",
  "registered_office",
  "officer",
] as const;

/**
 * How an address is listed on a business: as its `principal` or `mailing` address,
 * as the office of its registered agent (`registered_office`), or as an officer's
 * (`officer`). Sent on an address listed under a business and on a business
 * listed under an address.
 */
export type AddressListing = (typeof ADDRESS_LISTINGS)[number];

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

/**
 * One part of a name as the autocomplete service split it: a word a typed token
 * starts, or the text between such words. The parts concatenate to the name
 * they mark.
 */
export interface HighlightPart {
  text: string;
  matched: boolean;
}

/**
 * A business listed under a person or an address. Its `token` is a
 * `business_token` that `POST /searches` redeems. Under a person it is a
 * `BusinessOfPerson`, with the role they hold on it; under an address a
 * `BusinessOfAddress`, with how it lists it.
 */
export interface RelatedBusiness {
  type: "business";
  token: string;
  label: string;
  /** This item is why the row is here. */
  matched: boolean;
  /**
   * The other name a matched business goes by (a DBA, or a former name) when
   * it fit the business name filter better than `label`, as a business row's
   * `matched_name` says it. Null when the label fit as well, or no business
   * name filters.
   */
  matched_name: string | null;
  /**
   * The name a filter matched the item on, split into parts as a row's own
   * `highlight` is: `matched_name` when it is set, else `label`. Null when no
   * filter matched the item by its name, or the filter marked no word in it.
   */
  highlight: HighlightPart[] | null;
  /**
   * The business's lead address, the one its own row leads with: on an address
   * row too, where it need not be the row's. Null when it has none.
   */
  address: string | null;
  /** The business's states, sorted by code. */
  states: string[];
  domicile_state: string;
}

/** A person listed under an address, where they hold no role of their own. */
export interface RelatedPerson {
  type: "person";
  label: string;
  /** This item is why the row is here. */
  matched: boolean;
  /**
   * How the name this person matched on reads against the typed text of the
   * person name filter. Null when no filter matched the item by its name.
   */
  highlight: HighlightPart[] | null;
}

/** An address listed under a person, where they are at it with no role. */
export interface RelatedAddress {
  type: "address";
  label: string;
  /** This item is why the row is here. */
  matched: boolean;
  /**
   * How this address reads against the typed text of the address filter. Null
   * when no filter matched it.
   */
  highlight: HighlightPart[] | null;
}

/** A person listed under a business, with the role they hold on it. */
export interface PersonOfBusiness extends RelatedPerson {
  /** Null when the filing names none. */
  role: Open<PersonRole> | null;
}

/** An address listed under a business, with how the business lists it. */
export interface AddressOfBusiness extends RelatedAddress {
  /** Null when the filing says none. */
  listed_as: Open<AddressListing> | null;
}

/** A business listed under a person, with the role the person holds on it. */
export interface BusinessOfPerson extends RelatedBusiness {
  /** Null when the filing names none. */
  role: Open<PersonRole> | null;
}

/** A business listed under an address, with how it lists the address. */
export interface BusinessOfAddress extends RelatedBusiness {
  /** Null when the filing says none. */
  listed_as: Open<AddressListing> | null;
}

/** A related item of any kind, told apart by its `type`. */
export type RelatedItem = RelatedBusiness | RelatedPerson | RelatedAddress;

/** The items of one relation of a row, and how many the row has. */
export interface RelatedSet<Item extends RelatedItem> {
  /** Total before the head cap; null when the relation was not requested. */
  count: number | null;
  /** How many satisfied a relation filter; null when none applied. */
  matched: number | null;
  truncated: boolean;
  items: Item[];
}

/** What a business is related to. */
export interface BusinessRelated {
  people: RelatedSet<PersonOfBusiness>;
  addresses: RelatedSet<AddressOfBusiness>;
}

/** What a person is related to. */
export interface PersonRelated {
  businesses: RelatedSet<BusinessOfPerson>;
  addresses: RelatedSet<RelatedAddress>;
}

/** What an address is related to. */
export interface AddressRelated {
  businesses: RelatedSet<BusinessOfAddress>;
  people: RelatedSet<RelatedPerson>;
}

/** What every row carries, whatever the route. */
export interface SuggestionBase<T extends EntityType> {
  type: T;
  /**
   * An opaque handle for the entity, sealed by the autocomplete service. A
   * business's is passed back verbatim as `business_token` on `POST /searches`.
   */
  token: string;
  label: string;
  /** Order the rows by position, never by this. */
  match: Open<MatchGrade>;
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

/** A business, with the people and addresses it is related to. */
export interface BusinessSuggestion extends SuggestionBase<"business"> {
  /** The indexed name that matched, when it is not `label`. */
  matched_name: string | null;
  domicile_state: string;
  states: string[];
  /**
   * The legal structure the domicile registration is filed under, as the
   * autocomplete service spells it (`structureLabel` draws it); null when it is
   * not known.
   */
  structure: Open<BusinessStructure> | null;
  related: BusinessRelated;
}

/**
 * A person, with the businesses they hold a role on and the addresses they
 * filed from. A person has no jurisdiction of its own: its `states` are the
 * states of those businesses.
 */
export interface PersonSuggestion extends SuggestionBase<"person"> {
  states: string[];
  related: PersonRelated;
}

/** The parts of an address's label; each is null where the filing did not carry it. */
export interface AddressComponents {
  /** The number, directions, street name and suffix. */
  line1: string | null;
  /** The unit: its designator and number. */
  line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
}

/** An address, with the businesses filed at it and the people who filed from it. */
export interface AddressSuggestion extends SuggestionBase<"address"> {
  components: AddressComponents;
  related: AddressRelated;
}

export interface SuggestionByRelation {
  businesses: BusinessSuggestion;
  people: PersonSuggestion;
  addresses: AddressSuggestion;
}

/** A row from any route. */
export type Suggestion = SuggestionByRelation[Route];

export interface Source {
  status: Open<SourceStatus>;
}

export interface SuggestResponse<R extends Route = "businesses"> {
  query: string;
  found: number;
  /** The count stopped at the cap: `found` is a floor, drawn as `500+`. */
  found_capped: boolean;
  /**
   * The autocomplete service did not finish looking, so a matching entity may
   * be missing.
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
  uri: string | null;
  metadata: Record<string, unknown> | null;
}

/**
 * One parameter a 422 names. The `type` is open: treat one this build does
 * not know as a request the service refused for that parameter.
 */
export interface ValidationItem {
  type: string;
  /** Where the failure is: `["query", "limit"]`. */
  loc: string[];
  msg: string;
  /** What the check held, where it holds anything. */
  ctx: unknown;
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

/** A string of an open enum: any string, typed as `Known` or another. */
function open<Known extends string>(value: Json, path: string): Open<Known> {
  return string(value, path);
}

/** The key of a `required` field that may be null: it must be there. */
function nullableKey<T>(
  o: Record<string, unknown>,
  key: string,
  path: string,
  parse: (v: Json, p: string) => T,
): T | null {
  const value = o[key];
  if (value === undefined) {
    throw new ContractViolation(`${path}.${key}`, "a value, or null");
  }
  return value === null ? null : parse(value, `${path}.${key}`);
}

/** A key the contract leaves out of `required`: absent or null reads as null. */
function optionalKey<T>(
  o: Record<string, unknown>,
  key: string,
  path: string,
  parse: (v: Json, p: string) => T,
): T | null {
  const value = o[key];
  return value === undefined || value === null
    ? null
    : parse(value, `${path}.${key}`);
}

/** The `type` of a row or an item: the one entity it is. */
function typeOf<T extends EntityType>(
  o: Record<string, unknown>,
  path: string,
  type: T,
): T {
  if (o.type !== type) {
    throw new ContractViolation(`${path}.type`, `"${type}"`);
  }
  return type;
}

/**
 * Before this contract, how a business listed an address, and the role a person
 * held at it, were named `role` as a person's role on a business is. Read as
 * the new contract an address item with a `role` would show none, so a
 * relationship that has no `role` refuses one instead.
 */
function refuseFormerRole(o: Record<string, unknown>, path: string): void {
  if (o.role !== undefined) {
    throw new ContractViolation(
      `${path}.role`,
      "no `role`: this build reads the contract that names how a business lists an address `listed_as`, and the autocomplete service answering still serves the one before it",
    );
  }
}

function highlightPart(value: Json, path: string): HighlightPart {
  const o = object(value, path);
  return {
    text: string(o.text, `${path}.text`),
    matched: boolean(o.matched, `${path}.matched`),
  };
}

const highlightParts = (v: Json, p: string) => array(v, p, highlightPart);

function relatedBusiness(value: Json, path: string): RelatedBusiness {
  const o = object(value, path);
  return {
    type: typeOf(o, path, "business"),
    token: nonEmptyString(o.token, `${path}.token`),
    label: string(o.label, `${path}.label`),
    matched: boolean(o.matched, `${path}.matched`),
    matched_name: nullableKey(o, "matched_name", path, string),
    highlight: nullableKey(o, "highlight", path, highlightParts),
    address: nullableKey(o, "address", path, string),
    states: array(o.states, `${path}.states`, string),
    domicile_state: string(o.domicile_state, `${path}.domicile_state`),
  };
}

function relatedPerson(value: Json, path: string): RelatedPerson {
  const o = object(value, path);
  return {
    type: typeOf(o, path, "person"),
    label: string(o.label, `${path}.label`),
    matched: boolean(o.matched, `${path}.matched`),
    highlight: nullableKey(o, "highlight", path, highlightParts),
  };
}

function relatedAddress(value: Json, path: string): RelatedAddress {
  const o = object(value, path);
  return {
    type: typeOf(o, path, "address"),
    label: string(o.label, `${path}.label`),
    matched: boolean(o.matched, `${path}.matched`),
    highlight: nullableKey(o, "highlight", path, highlightParts),
  };
}

/** An item read as `parse` reads it, with the role a person holds on a business. */
function roleOn<T extends RelatedItem>(
  parse: (v: Json, p: string) => T,
): (v: Json, p: string) => T & { role: Open<PersonRole> | null } {
  return (value, path) => ({
    ...parse(value, path),
    role: optionalKey(object(value, path), "role", path, open<PersonRole>),
  });
}

/** An item read as `parse` reads it, with how an address is listed on a business. */
function listedAs<T extends RelatedItem>(
  parse: (v: Json, p: string) => T,
): (v: Json, p: string) => T & { listed_as: Open<AddressListing> | null } {
  return (value, path) => {
    const o = object(value, path);
    refuseFormerRole(o, path);
    return {
      ...parse(value, path),
      listed_as: optionalKey(o, "listed_as", path, open<AddressListing>),
    };
  };
}

/** An item read as `parse` reads it, where the relationship has no role. */
function withoutRole<T extends RelatedItem>(
  parse: (v: Json, p: string) => T,
): (v: Json, p: string) => T {
  return (value, path) => {
    refuseFormerRole(object(value, path), path);
    return parse(value, path);
  };
}

function relatedSet<Item extends RelatedItem>(
  value: Json,
  path: string,
  parse: (v: Json, p: string) => Item,
): RelatedSet<Item> {
  const o = object(value, path);
  return {
    count: nullableKey(o, "count", path, count),
    matched: nullableKey(o, "matched", path, count),
    truncated: boolean(o.truncated, `${path}.truncated`),
    items: array(o.items, `${path}.items`, parse),
  };
}

function businessRelated(value: Json, path: string): BusinessRelated {
  const o = object(value, path);
  return {
    people: relatedSet(o.people, `${path}.people`, roleOn(relatedPerson)),
    addresses: relatedSet(
      o.addresses,
      `${path}.addresses`,
      listedAs(relatedAddress),
    ),
  };
}

function personRelated(value: Json, path: string): PersonRelated {
  const o = object(value, path);
  return {
    businesses: relatedSet(
      o.businesses,
      `${path}.businesses`,
      roleOn(relatedBusiness),
    ),
    addresses: relatedSet(
      o.addresses,
      `${path}.addresses`,
      withoutRole(relatedAddress),
    ),
  };
}

function addressRelated(value: Json, path: string): AddressRelated {
  const o = object(value, path);
  return {
    businesses: relatedSet(
      o.businesses,
      `${path}.businesses`,
      listedAs(relatedBusiness),
    ),
    people: relatedSet(o.people, `${path}.people`, withoutRole(relatedPerson)),
  };
}

function addressComponents(value: Json, path: string): AddressComponents {
  const o = object(value, path);
  return {
    line1: nullableKey(o, "line1", path, string),
    line2: nullableKey(o, "line2", path, string),
    city: nullableKey(o, "city", path, string),
    state: nullableKey(o, "state", path, string),
    postal_code: nullableKey(o, "postal_code", path, string),
  };
}

/** What every row carries, read from `o`. */
function rowBase<T extends EntityType>(
  o: Record<string, unknown>,
  path: string,
  type: T,
): SuggestionBase<T> {
  return {
    type: typeOf(o, path, type),
    token: nonEmptyString(o.token, `${path}.token`),
    label: string(o.label, `${path}.label`),
    match: open<MatchGrade>(o.match, `${path}.match`),
    highlight: highlightParts(o.highlight, `${path}.highlight`),
  };
}

function businessSuggestion(value: Json, path: string): BusinessSuggestion {
  const o = object(value, path);
  return {
    ...rowBase(o, path, ENTITY_OF.businesses),
    matched_name: nullableKey(o, "matched_name", path, string),
    domicile_state: string(o.domicile_state, `${path}.domicile_state`),
    states: array(o.states, `${path}.states`, string),
    structure: nullableKey(o, "structure", path, open<BusinessStructure>),
    related: businessRelated(o.related, `${path}.related`),
  };
}

function personSuggestion(value: Json, path: string): PersonSuggestion {
  const o = object(value, path);
  return {
    ...rowBase(o, path, ENTITY_OF.people),
    states: array(o.states, `${path}.states`, string),
    related: personRelated(o.related, `${path}.related`),
  };
}

function addressSuggestion(value: Json, path: string): AddressSuggestion {
  const o = object(value, path);
  return {
    ...rowBase(o, path, ENTITY_OF.addresses),
    components: addressComponents(o.components, `${path}.components`),
    related: addressRelated(o.related, `${path}.related`),
  };
}

/** How each route's row is read. */
const SUGGESTION_PARSERS = {
  businesses: businessSuggestion,
  people: personSuggestion,
  addresses: addressSuggestion,
} as const satisfies {
  [R in Route]: (value: Json, path: string) => SuggestionByRelation[R];
};

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

function source(value: Json, path: string): Source {
  const o = object(value, path);
  return { status: open<SourceStatus>(o.status, `${path}.status`) };
}

/**
 * The body of a 200 from `GET /autocomplete/{relation}`, validated. Unknown
 * keys are dropped, so the value a caller sees is exactly this type; an
 * unknown value of an open enum is kept as it came.
 */
export function parseSuggestResponse<R extends Route>(
  relation: R,
  body: Json,
): SuggestResponse<R> {
  const o = object(body, "response");
  const parse = SUGGESTION_PARSERS[relation] as (
    value: Json,
    path: string,
  ) => SuggestionByRelation[R];
  return {
    query: string(o.query, "response.query"),
    found: count(o.found, "response.found"),
    found_capped: boolean(o.found_capped, "response.found_capped"),
    truncated: boolean(o.truncated, "response.truncated"),
    sources: relations(
      ROUTES[relation].includes,
      o.sources,
      "response.sources",
      source,
    ),
    suggestions: array(o.suggestions, "response.suggestions", parse),
  };
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
  const { code, message, uri, metadata } = body;
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
  return {
    code,
    message,
    uri: typeof uri === "string" ? uri : null,
    metadata: metadata ?? null,
  };
}

function validationItem(value: Json): ValidationItem | null {
  if (
    !isObject(value) ||
    typeof value.type !== "string" ||
    typeof value.msg !== "string" ||
    !Array.isArray(value.loc)
  ) {
    return null;
  }
  return {
    type: value.type,
    loc: value.loc.map(String),
    msg: value.msg,
    ctx: value.ctx ?? null,
  };
}

/**
 * The parameters a 422 names, from its envelope's `metadata.errors`; empty
 * for any other refusal.
 */
export function validationErrors(envelope: ErrorEnvelope): ValidationItem[] {
  const errors = envelope.metadata?.errors;
  if (
    envelope.metadata?.reason !== "request_invalid" ||
    !Array.isArray(errors)
  ) {
    return [];
  }
  return errors.flatMap(entry => validationItem(entry) ?? []);
}

/** What the first parameter a 422 names says, or null. */
export function firstValidationMessage(envelope: ErrorEnvelope): string | null {
  return validationErrors(envelope)[0]?.msg ?? null;
}
