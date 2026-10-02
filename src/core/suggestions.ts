import type { MatchRegion } from "./look";
import type {
  BusinessStructure,
  BusinessSuggestion,
  HighlightPart,
} from "./wire";

/**
 * Readers of a `GET /autocomplete/businesses` suggestion: what the typeahead's
 * rows show and what a pick fills into a host's form. Pure functions over the
 * wire shape, exported because hosts read them too.
 */

/**
 * The address the autocomplete service ranked first: the family's own filing in
 * its domicile state (principal, then mailing) when it has one, else an
 * officer's or a registered agent's address there, else the same ladder in its
 * other states. The autocomplete service owns that order; this reads the head.
 */
export function leadAddressOf(suggestion: BusinessSuggestion): string | null {
  return suggestion.related.addresses.items[0]?.label ?? null;
}

/** Whose address a related address is: the family's own filing, or a person's. */
export type AddressOwner = "officer" | "agent" | "principal";

export interface AddressLine {
  label: string;
  /** The address satisfied an address filter: it is why the row is here. */
  matched: boolean;
  /**
   * Whose it is: `principal` for the family's own filing (its principal or
   * mailing address), `officer` or `agent` for a person's; null for a role
   * this build does not know.
   */
  role: AddressOwner | null;
}

function ownerOf(role: string | null): AddressOwner | null {
  switch (role) {
    case "officer":
    case "agent":
      return role;
    case "principal":
    case "mailing":
      return "principal";
    default:
      return null;
  }
}

/**
 * The lead address with what the autocomplete service says of it: whether it
 * matched, and whose it is. The same address as `leadAddressOf`, the head.
 */
export function addressLineOf(
  suggestion: BusinessSuggestion,
): AddressLine | null {
  const lead = suggestion.related.addresses.items[0];
  return lead === undefined
    ? null
    : { label: lead.label, matched: lead.matched, role: ownerOf(lead.role) };
}

/** The family's officers as named in the index; registered agents are not people. */
export function officersOf(suggestion: BusinessSuggestion): string[] {
  return suggestion.related.people.items
    .filter(item => item.role === "officer")
    .map(item => item.label);
}

export interface PeopleLine {
  /** Matched people first, each group in the autocomplete service's order. */
  names: string[];
  role: "officer" | "agent";
  /** How many more of this role the family has beyond the first name shown. */
  more: number;
  /**
   * How many of `names` satisfied a person filter. They lead `names`, so the
   * first name shown is a match when this is above zero.
   */
  matched: number;
}

/**
 * The people of `role` the family has beyond the first name shown: the rest
 * of the head, plus the people the head cap left out when they can only be
 * of this role. The autocomplete service lists officers before agents, so an
 * agent inside the head means every officer is already there and the people
 * beyond the head are agents; a head of officers alone says nothing about the
 * roles beyond it, and they are counted as more of the same. Without a total
 * (`count` null) only the head can be counted.
 */
function moreOf(
  suggestion: BusinessSuggestion,
  inHead: string[],
  role: PeopleLine["role"],
): number {
  const { count, items } = suggestion.related.people;
  const beyondHead = count === null ? 0 : Math.max(0, count - items.length);
  const headHasAgent = items.some(item => item.role === "agent");
  const beyondHeadOfRole = role === "officer" && headHasAgent ? 0 : beyondHead;
  return inHead.length - 1 + beyondHeadOfRole;
}

/** The head's people of `role`, the ones that matched first. */
function peopleOfRole(
  suggestion: BusinessSuggestion,
  role: PeopleLine["role"],
): { names: string[]; matched: number } {
  const items = suggestion.related.people.items.filter(
    item => item.role === role,
  );
  const matched = items.filter(item => item.matched);
  const rest = items.filter(item => !item.matched);
  return {
    names: [...matched, ...rest].map(item => item.label),
    matched: matched.length,
  };
}

/**
 * Who the people field names: the officers when the family has any in the
 * head, otherwise its registered agents, marked as such so a corporation's
 * name is not read as a person's. The people a person filter matched come
 * first. Nothing when it has neither.
 */
export function peopleLineOf(
  suggestion: BusinessSuggestion,
): PeopleLine | null {
  for (const role of ["officer", "agent"] as const) {
    const { names, matched } = peopleOfRole(suggestion, role);
    if (names.length > 0) {
      return {
        names,
        role,
        more: moreOf(suggestion, names, role),
        matched,
      };
    }
  }
  return null;
}

/**
 * The domicile first, then the states a state filter matched, then the other
 * states in the autocomplete service's (sorted) order. A matched state is
 * never left behind a `+N` while any other state is shown. `matched` is the
 * `states` of `matchedOn`'s state entry.
 */
export function orderedStates(
  suggestion: BusinessSuggestion,
  matched: readonly string[] = [],
): string[] {
  const rest = suggestion.states.filter(
    state => state !== suggestion.domicile_state,
  );
  return [
    suggestion.domicile_state,
    ...rest.filter(state => matched.includes(state)),
    ...rest.filter(state => !matched.includes(state)),
  ];
}

/**
 * What a row matched on besides its name, as the autocomplete service says.
 * The name's own match is the `highlight` the name draws, and is not here.
 */
export type MatchedOn =
  /** A name the family goes by (a DBA) matched; `matched_name`. */
  | { kind: "alias"; name: string }
  /** Officers a person filter matched, and how many matched in all. */
  | { kind: "officer"; names: string[]; of: number | null }
  /** Registered agents a person filter matched, and how many matched in all. */
  | { kind: "agent"; names: string[]; of: number | null }
  /** An address an address filter matched, and whose it is. */
  | { kind: "address"; label: string; role: AddressOwner | null }
  /** The states of the family that a state filter named. */
  | { kind: "state"; states: string[] };

/**
 * What a suggestion matched on besides its name, in this order: the alias,
 * the officers, the agents, the addresses, the states. Empty when only the
 * name matched, which its emphasis already says.
 *
 * The autocomplete service flags what a person or an address filter matched on
 * the row's related people and addresses (`matched`), and leads the head with
 * them. A state filter has no flag: it matched when the row's states include
 * one of `request.state`, so pass the filters the rows were fetched with, and
 * none when the client withheld them (`filtersWithheld`).
 */
export function matchedOn(
  suggestion: BusinessSuggestion,
  request: { state?: readonly string[] | undefined } = {},
): MatchedOn[] {
  const found: MatchedOn[] = [];
  if (suggestion.matched_name !== null) {
    found.push({ kind: "alias", name: suggestion.matched_name });
  }
  const { items, matched } = suggestion.related.people;
  const people = (["officer", "agent"] as const).map(role => ({
    role,
    names: items
      .filter(item => item.matched && item.role === role)
      .map(item => item.label),
  }));
  const roles = people.filter(({ names }) => names.length > 0);
  for (const { role, names } of roles) {
    // The total counts every role; it names this one only when it is alone.
    found.push({ kind: role, names, of: roles.length === 1 ? matched : null });
  }
  for (const item of suggestion.related.addresses.items) {
    if (item.matched) {
      found.push({
        kind: "address",
        label: item.label,
        role: ownerOf(item.role),
      });
    }
  }
  const requested = new Set(
    (request.state ?? []).map(state => state.trim().toUpperCase()),
  );
  const states = orderedStates(suggestion).filter(state =>
    requested.has(state.toUpperCase()),
  );
  if (states.length > 0) {
    found.push({ kind: "state", states });
  }
  return found;
}

/** Each structure's flag, short and shaped like the suffix a name carries. */
const STRUCTURE_LABELS: Partial<Record<BusinessStructure, string>> = {
  SOLE_PROPRIETORSHIP: "Sole prop.",
  GENERAL_PARTNERSHIP: "GP",
  LLC: "LLC",
  LLP: "LLP",
  LLLP: "LLLP",
  LP: "LP",
  C_CORPORATION: "C-Corp",
  S_CORPORATION: "S-Corp",
  B_CORPORATION: "B-Corp",
  NONPROFIT: "Nonprofit",
  COOPERATIVE: "Co-op",
  TRUST: "Trust",
  // Never `PA`: that is Pennsylvania's state square.
  PROFESSIONAL_ASSOCIATION: "P.A.",
  PROFESSIONAL_CORPORATION: "P.C.",
  TRADE_NAME: "DBA",
  BANK: "Bank",
  CREDIT_UNION: "Credit union",
  INSURANCE: "Insurance",
};

/** `labels[key]` when it is a string of the object's own, else undefined. */
function ownLabel(
  labels: Partial<Record<BusinessStructure, string>> | null,
  key: string,
): string | undefined {
  // The key comes off the wire, so it may name a member of every object.
  const label: unknown =
    labels !== null && Object.prototype.hasOwnProperty.call(labels, key)
      ? labels[key]
      : undefined;
  return typeof label === "string" ? label : undefined;
}

/**
 * The flag a business's structure draws, or null for none: `OTHER`, no
 * structure, and a value this build has no label for draw none. `labels`
 * relabels any value, one at a time, and `""` hides that value's flag.
 */
export function structureLabel(
  structure: BusinessStructure | null,
  labels: Partial<Record<BusinessStructure, string>> | null = {},
): string | null {
  if (structure === null) {
    return null;
  }
  const label =
    ownLabel(labels, structure) ?? ownLabel(STRUCTURE_LABELS, structure);
  return label === undefined || label === "" ? null : label;
}

/**
 * `found` is a floor when the autocomplete service stopped counting: `500+`.
 */
export function formatFound(found: number, capped: boolean): string {
  return capped ? `${found}+` : `${found}`;
}

const COMBINING_MARK = /\p{M}/gu;
const WORD_CHARACTER = /[\p{L}\p{N}']/u;
// A word as the autocomplete service's `highlight` sees one (letters, digits
// and apostrophes) or the run between two words.
const WORD_OR_GAP = /[\p{L}\p{N}']+|[^\p{L}\p{N}']+/gu;
const WORD = /^[\p{L}\p{N}']+$/u;

/**
 * The autocomplete service's `fold`, one character at a time: NFD, combining
 * marks dropped, lower-cased. Per character so that a folded prefix can be
 * measured back onto the displayed word — `É` folds to `e` and still counts as
 * one.
 */
function foldChar(character: string): string {
  return character.normalize("NFD").replace(COMBINING_MARK, "").toLowerCase();
}

/**
 * The typed query as the autocomplete service tokenizes it for the marks:
 * trimmed and lower-cased, `&` as the word `and`, `-` and `_` as spaces, every
 * character that is not a letter, a digit or an apostrophe dropped, diacritics
 * folded. `Cin & Rig-ging, José` is `cin and rig ging jose`.
 */
export function queryTokens(query: string): string[] {
  return query
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[-_]/g, " ")
    .split(/\s+/)
    .map(token =>
      Array.from(token)
        .filter(character => WORD_CHARACTER.test(character))
        .map(foldChar)
        .join(""),
    )
    .filter(token => token.length > 0);
}

/**
 * How many characters at the start of `word` the typed tokens cover: the
 * longest token the folded word starts with, measured in the word's own
 * characters; 0 when no token does.
 */
export function typedPrefixLength(word: string, tokens: string[]): number {
  const folded = Array.from(word).map(foldChar);
  const foldedWord = folded.join("");
  const [token] = tokens
    .filter(candidate => foldedWord.startsWith(candidate))
    .sort((a, b) => b.length - a.length);
  if (token === undefined) {
    return 0;
  }
  let covered = 0;
  let count = 0;
  while (covered < token.length && count < folded.length) {
    covered += (folded[count] ?? "").length;
    count += 1;
  }
  return count;
}

/**
 * One marked part cut at the typed characters. The autocomplete service bridges
 * whitespace between two marked words into one part (`CINDER RIGGING` for
 * `cin rig`), so a marked part is a run of words, not one word: each word is
 * cut on its own at the typed prefix, the runs between words are unmarked, and
 * a word no typed token starts keeps its whole mark (the field has moved on
 * since these rows were answered; the autocomplete service's mark is still the
 * truth about the row).
 */
function cutMarked(text: string, tokens: string[]): HighlightPart[] {
  return (text.match(WORD_OR_GAP) ?? [text]).flatMap(piece => {
    if (!WORD.test(piece)) {
      return [{ text: piece, matched: false }];
    }
    const typed = typedPrefixLength(piece, tokens);
    const characters = Array.from(piece);
    if (typed === 0 || typed >= characters.length) {
      return [{ text: piece, matched: true }];
    }
    return [
      { text: characters.slice(0, typed).join(""), matched: true },
      { text: characters.slice(typed).join(""), matched: false },
    ];
  });
}

/**
 * The autocomplete service's own tidy-up, mirrored
 * (`merge_whitespace_between_matches`): adjacent parts of one kind become one,
 * and whitespace between two marked parts is marked with them, so two words
 * typed out in full are one span — the substring region grows into the
 * whole-word mark as the typing does.
 */
function mergeParts(parts: HighlightPart[]): HighlightPart[] {
  const pieces = parts.filter(part => part.text.length > 0);
  const out: HighlightPart[] = [];
  pieces.forEach((part, index) => {
    const last = out[out.length - 1];
    const bridges =
      !part.matched &&
      /^\s+$/.test(part.text) &&
      last?.matched === true &&
      pieces[index + 1]?.matched === true;
    if (last !== undefined && (bridges || last.matched === part.matched)) {
      last.text += part.text;
    } else {
      out.push({ ...part });
    }
  });
  return out;
}

/**
 * The parts to draw for `text`, or null to draw it as it is.
 *
 * The autocomplete service's parts spell exactly one of a row's names — the one
 * the query reached — so a line owns them when they spell its text and not
 * otherwise: parts for the alternative name never half-mark the label, and a
 * row reached through an officer or an address (no parts) is drawn plain. Under
 * the `token` region the parts are drawn as the autocomplete service sent them;
 * under `substring` each marked word is cut at the typed characters
 * (`cutMarked`), and the result is tidied the way the autocomplete service
 * tidies its own (`mergeParts`).
 */
export function partsFor(
  text: string,
  parts: HighlightPart[],
  region: MatchRegion,
  tokens: string[],
): HighlightPart[] | null {
  if (parts.length === 0 || parts.map(part => part.text).join("") !== text) {
    return null;
  }
  if (region === "token") {
    return parts;
  }
  return mergeParts(
    parts.flatMap(part =>
      part.matched ? cutMarked(part.text, tokens) : [part],
    ),
  );
}
