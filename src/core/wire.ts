/**
 * The wire shapes of `GET /autocomplete/businesses` and the error envelope, as
 * the Rust tier serves them: snake_case, nulls spelled out.
 *
 * Hand-written types and a small structural validator rather than a schema
 * library. Three shapes do not justify a validator dependency in a snippet
 * customers embed on their own pages, and every host would have to agree on
 * its version.
 *
 * Two liberties, both so a tier release never turns every keystroke into a
 * contract error over a field nothing displays. Closed enums nothing branches
 * on (`RelatedItem.type`, `match`, `sources.*.status`) are read as strings.
 * And the keys the tier's OpenAPI leaves out of `required` (`matched_name`,
 * `RelatedItem.token`, `role`, `RelatedSet.count`, `RelatedSet.matched`) may
 * be absent as well as null; either reads as null.
 */

export type Include = "people" | "addresses" | "liens";

export interface RelatedItem {
  /** `business`, `person`, `address`, `lien` today; open. */
  type: string;
  /** An opaque handle for the person or address; nothing redeems one yet. */
  token: string | null;
  label: string;
  role: string | null;
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
 * One part of a name as the tier split it: a word a typed token starts, or
 * the text between such words. The parts concatenate to the name they mark.
 */
export interface HighlightPart {
  text: string;
  matched: boolean;
}

export interface BusinessSuggestion {
  type: "business";
  /**
   * An opaque handle for the business family, passed back verbatim as
   * `business_token` on `POST /searches`. Sealed by the tier.
   */
  token: string;
  label: string;
  /** The indexed name that matched, when it is not `label`. */
  matched_name: string | null;
  /** `exact`, `strong`, `partial` today; open. */
  match: string;
  domicile_state: string;
  states: string[];
  related: Record<Include, RelatedSet>;
  /**
   * The name that matched, split into parts, the words a typed token starts
   * marked. Empty when the query reached the row some other way.
   */
  highlight: HighlightPart[];
}

export interface Source {
  /** `ok`, `not_requested`, `unavailable` today; open. */
  status: string;
}

export interface BusinessesResponse {
  query: string;
  found: number;
  /** The count stopped at the cap: `found` is a floor, drawn as `500+`. */
  found_capped: boolean;
  /**
   * The tier did not finish looking, so a matching business may be missing.
   * Absent or null reads as `false`: a tier that predates the field is
   * complete by definition.
   */
  truncated: boolean;
  sources: Record<Include, Source>;
  suggestions: BusinessSuggestion[];
}

/** The catalog envelope the API and the tier answer refusals with. */
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

/** Absent or null reads as null; anything else must parse. */
function nullable<T>(
  value: Json,
  path: string,
  parse: (v: Json, p: string) => T,
): T | null {
  return value === undefined || value === null ? null : parse(value, path);
}

function relatedItem(value: Json, path: string): RelatedItem {
  const o = object(value, path);
  return {
    type: string(o.type, `${path}.type`),
    token: nullable(o.token, `${path}.token`, string),
    label: string(o.label, `${path}.label`),
    role: nullable(o.role, `${path}.role`, string),
    matched: boolean(o.matched, `${path}.matched`),
  };
}

function relatedSet(value: Json, path: string): RelatedSet {
  const o = object(value, path);
  return {
    count: nullable(o.count, `${path}.count`, count),
    matched: nullable(o.matched, `${path}.matched`, count),
    truncated: boolean(o.truncated, `${path}.truncated`),
    items: array(o.items, `${path}.items`, relatedItem),
  };
}

function highlightPart(value: Json, path: string): HighlightPart {
  const o = object(value, path);
  return {
    text: string(o.text, `${path}.text`),
    matched: boolean(o.matched, `${path}.matched`),
  };
}

function relations<T>(
  value: Json,
  path: string,
  parse: (v: Json, p: string) => T,
): Record<Include, T> {
  const o = object(value, path);
  return {
    people: parse(o.people, `${path}.people`),
    addresses: parse(o.addresses, `${path}.addresses`),
    liens: parse(o.liens, `${path}.liens`),
  };
}

function suggestion(value: Json, path: string): BusinessSuggestion {
  const o = object(value, path);
  if (o.type !== "business") {
    throw new ContractViolation(`${path}.type`, '"business"');
  }
  return {
    type: "business",
    token: nonEmptyString(o.token, `${path}.token`),
    label: string(o.label, `${path}.label`),
    matched_name: nullable(o.matched_name, `${path}.matched_name`, string),
    match: string(o.match, `${path}.match`),
    domicile_state: string(o.domicile_state, `${path}.domicile_state`),
    states: array(o.states, `${path}.states`, string),
    related: relations(o.related, `${path}.related`, relatedSet),
    highlight: array(o.highlight, `${path}.highlight`, highlightPart),
  };
}

function source(value: Json, path: string): Source {
  const o = object(value, path);
  return { status: string(o.status, `${path}.status`) };
}

/**
 * The body of a 200 from `GET /autocomplete/businesses`, validated. Unknown
 * keys are dropped, so the value a caller sees is exactly this type.
 */
export function parseBusinessesResponse(body: Json): BusinessesResponse {
  const o = object(body, "response");
  const truncated = nullable(o.truncated, "response.truncated", boolean);
  return {
    query: string(o.query, "response.query"),
    found: count(o.found, "response.found"),
    found_capped: boolean(o.found_capped, "response.found_capped"),
    truncated: truncated ?? false,
    sources: relations(o.sources, "response.sources", source),
    suggestions: array(o.suggestions, "response.suggestions", suggestion),
  };
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
