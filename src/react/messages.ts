import type { BusinessStructure } from "@baselayer-sdk/autocomplete";

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
  /** An autocomplete service refusal with no message of its own. */
  httpFallback: (status: number) => string;
}

export const DEFAULT_MESSAGES: Readonly<AutocompleteMessages> = Object.freeze({
  searching: "Searching…",
  truncatedNoRows: "Still searching — add a word to narrow it down",
  truncatedRows: "Showing partial results — add a word to narrow it down",
  match: "match",
  matches: "matches",
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
  httpFallback: (status: number) => `Autocomplete unavailable (HTTP ${status})`,
});

export function resolveMessages(
  overrides?: Partial<AutocompleteMessages>,
): AutocompleteMessages {
  return overrides === undefined
    ? DEFAULT_MESSAGES
    : { ...DEFAULT_MESSAGES, ...overrides };
}
