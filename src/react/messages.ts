/** Every string the typeahead draws, overridable one at a time. */
export interface AutocompleteMessages {
  searching: string;
  /** The tier ran out of time or budget and found nothing yet. */
  truncatedNoRows: string;
  /** The tier ran out of time or budget; the rows may be missing a match. */
  truncatedRows: string;
  /** Footer noun for exactly one match. */
  match: string;
  /** Footer noun for any other count. */
  matches: string;
  /** The second line when the index holds no address for the family. */
  noAddress: string;
  /** Appended to a registered agent's name on the second line. */
  agentSuffix: string;
  /** The overflow count beside the first officer or the third state. */
  more: (count: number) => string;
  /** The organization's daily pool of sessions is spent. */
  dayLimit: string;
  /** A mint or a reply failed with nothing more specific to say. */
  unavailable: string;
  /** Two fresh sessions were refused in a row; minting is paused. */
  authUnavailable: string;
  /** A tier refusal with no message of its own. */
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
  more: (count: number) => `+${count}`,
  dayLimit:
    "Your plan's daily autocomplete limit is reached; suggestions return tomorrow.",
  unavailable: "Autocomplete unavailable",
  authUnavailable:
    "Autocomplete unavailable: the session could not be verified",
  httpFallback: (status: number) => `Autocomplete unavailable (HTTP ${status})`,
});

export function resolveMessages(
  overrides?: Partial<AutocompleteMessages>,
): AutocompleteMessages {
  return overrides === undefined
    ? DEFAULT_MESSAGES
    : { ...DEFAULT_MESSAGES, ...overrides };
}
