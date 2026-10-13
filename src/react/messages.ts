import type {
  BusinessStructure,
  AddressListing,
  PersonRole,
  Relation,
} from "@baselayer-sdk/autocomplete";

/** `1 business`, `1,204 businesses`. */
function counted(count: number, one: string, many: string): string {
  return count === 1 ? `1 ${one}` : `${count.toLocaleString("en-US")} ${many}`;
}

/** Every string the typeahead draws, overridable one at a time. */
export interface AutocompleteMessages {
  searching: string;
  /**
   * The autocomplete service ran out of time or budget and found nothing yet.
   */
  truncatedNoRows: string;
  /**
   * The autocomplete service ran out of time or budget; the rows may be missing
   * a match.
   */
  truncatedRows: string;
  /** Footer noun for exactly one match. */
  match: string;
  /** Footer noun for any other count. */
  matches: string;
  /** The people search's footer noun for exactly one person. */
  person: string;
  /** The people search's footer noun for any other count. */
  people: string;
  /** The address search's footer noun for exactly one address. */
  address: string;
  /** The address search's footer noun for any other count. */
  addresses: string;
  /**
   * How many of a relation a person or an address has, in a row's head: `3
   * businesses`, `1 address`, `2 people`.
   */
  relationCounts: Record<Relation, (count: number) => string>;
  /** Under a list in a person's or an address's row: how many it leaves out. */
  moreNotShown: (count: number) => string;
  /**
   * The role a person holds on a business, beside it under the person and
   * beside them under the business: `officer`, `agent`. A role this build does
   * not list is drawn as the autocomplete service sent it.
   */
  personRoles: Record<PersonRole, string>;
  /**
   * How an address is listed on a business, beside it under the business and beside
   * the business under the address. A way this build does not list is drawn as
   * the autocomplete service sent it.
   */
  addressRoles: Record<AddressListing, string>;
  /** The address field when the index holds no address for the family. */
  noAddress: string;
  /** Appended to a registered agent's name in the people field. */
  agentSuffix: string;
  /** Appended to the lead address when an address filter matched an officer's. */
  officerAddressSuffix: string;
  /** Appended to the lead address when an address filter matched an agent's. */
  agentAddressSuffix: string;
  /** The overflow count beside the first officer or the third state. */
  more: (count: number) => string;
  /**
   * Structure flags relabeled, one value at a time, over `structureLabel`'s
   * own; `""` hides that value's flag. Any value, one this build does not
   * know included, can be given a label.
   */
  structures: Partial<Record<BusinessStructure, string>>;
  /** The organization's daily pool of sessions is spent. */
  dayLimit: string;
  /** A mint or a reply failed with nothing more specific to say. */
  unavailable: string;
  /** Two fresh sessions were refused in a row; minting is paused. */
  authUnavailable: string;
  /** The session's scope does not reach this search, or one of its filters. */
  outOfScope: string;
  /** The deployment has this search but cannot answer it yet. */
  routeUnserved: string;
  /** An autocomplete service refusal with no message of its own. */
  httpFallback: (status: number) => string;
}

export const DEFAULT_MESSAGES: Readonly<AutocompleteMessages> = Object.freeze({
  searching: "Searching…",
  truncatedNoRows: "Still searching — add a word to narrow it down",
  truncatedRows: "Showing partial results — add a word to narrow it down",
  match: "match",
  matches: "matches",
  person: "person",
  people: "people",
  address: "address",
  addresses: "addresses",
  relationCounts: Object.freeze({
    businesses: (count: number) => counted(count, "business", "businesses"),
    addresses: (count: number) => counted(count, "address", "addresses"),
    people: (count: number) => counted(count, "person", "people"),
  }),
  moreNotShown: (count: number) =>
    `+${count.toLocaleString("en-US")} more not shown`,
  personRoles: Object.freeze({
    officer: "officer",
    agent: "agent",
  }),
  addressRoles: Object.freeze({
    principal: "principal office",
    mailing: "mailing address",
    registered_office: "agent",
    officer: "officer's address",
  }),
  noAddress: "No address on file",
  agentSuffix: " · agent",
  officerAddressSuffix: " · officer's address",
  agentAddressSuffix: " · agent's address",
  more: (count: number) => `+${count}`,
  structures: Object.freeze({}),
  dayLimit:
    "Your plan's daily autocomplete limit is reached; suggestions return tomorrow.",
  unavailable: "Autocomplete unavailable",
  authUnavailable:
    "Autocomplete unavailable: the session could not be verified",
  outOfScope: "This search is not available here",
  routeUnserved: "This search is not available here yet",
  httpFallback: (status: number) => `Autocomplete unavailable (HTTP ${status})`,
});

export function resolveMessages(
  overrides?: Partial<AutocompleteMessages>,
): AutocompleteMessages {
  return overrides === undefined
    ? DEFAULT_MESSAGES
    : { ...DEFAULT_MESSAGES, ...overrides };
}
