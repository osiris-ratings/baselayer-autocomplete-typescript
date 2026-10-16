import type { MatchRegion } from "./look";
import type {
  BusinessStructure,
  BusinessSuggestion,
  AddressListing,
  HighlightPart,
  Open,
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

/**
 * What a pick fills into the name field: the name the row matched on. That is
 * the row's `label`, or the name the family goes by (a DBA) when the row
 * matched that, so `baselaye` completes to `BASELAYER` rather than to the legal
 * name the row leads with. The pick's token is the family's either way.
 */
export function pickedNameOf(suggestion: BusinessSuggestion): string {
  const alias = suggestion.matched_name;
  return alias !== null && alias.trim() !== "" ? alias : suggestion.label;
}

/** Whose address a related address is: the family's own filing, or a person's. */
export type AddressOwner = "officer" | "agent" | "principal";

export interface AddressLine {
  label: string;
  /** The address satisfied an address filter: it is why the row is here. */
  matched: boolean;
  /**
   * Whose it is: `principal` for the family's own filing (its principal or
   * mailing address), `officer` or `agent` for a person's; null when the
   * filing names no role.
   */
  role: AddressOwner | null;
  /**
   * The parts of `label` an address filter marked, as the autocomplete
   * service sent them; null when it sent none.
   */
  highlight: HighlightPart[] | null;
}

/** Whose an address is, from how the family filed it; null for one this build does not know. */
function ownerOf(listedAs: Open<AddressListing> | null): AddressOwner | null {
  switch (listedAs) {
    case "officer":
      return "officer";
    case "registered_office":
      return "agent";
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
    : {
        label: lead.label,
        matched: lead.matched,
        role: ownerOf(lead.listed_as),
        highlight: lead.highlight,
      };
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
  /**
   * The parts of the first of `names` a person filter marked, as the
   * autocomplete service sent them; null when it sent none.
   */
  highlight: HighlightPart[] | null;
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
): { names: string[]; matched: number; highlight: HighlightPart[] | null } {
  const items = suggestion.related.people.items.filter(
    item => item.role === role,
  );
  const matched = items.filter(item => item.matched);
  const rest = items.filter(item => !item.matched);
  const ordered = [...matched, ...rest];
  return {
    names: ordered.map(item => item.label),
    matched: matched.length,
    highlight: ordered[0]?.highlight ?? null,
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
    const { names, matched, highlight } = peopleOfRole(suggestion, role);
    if (names.length > 0) {
      return {
        names,
        role,
        more: moreOf(suggestion, names, role),
        matched,
        highlight,
      };
    }
  }
  return null;
}

/** A business's states and its domicile: a business row, or a related business. */
export interface BusinessStates {
  domicile_state: string | null;
  states: readonly string[] | null;
}

/**
 * The domicile first, then the states a state filter matched, then the other
 * states in the autocomplete service's (sorted) order. A matched state is
 * never left behind a `+N` while any other state is shown. `matched` is the
 * `states` of `matchedOn`'s state entry. Empty for a related item that
 * carries no states.
 */
export function orderedStates(
  business: BusinessStates,
  matched: readonly string[] = [],
): string[] {
  const domicile = business.domicile_state;
  const rest = (business.states ?? []).filter(state => state !== domicile);
  return [
    ...(domicile === null ? [] : [domicile]),
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
        role: ownerOf(item.listed_as),
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
  labels: Partial<Record<string, string>> | null,
  key: string,
): string | undefined {
  // A host may call this with untyped data, so the key may name a member of
  // every object.
  const label: unknown =
    labels !== null && Object.prototype.hasOwnProperty.call(labels, key)
      ? labels[key]
      : undefined;
  return typeof label === "string" ? label : undefined;
}

/**
 * The flag a business's structure draws, or null for none: `OTHER` and no
 * structure draw none. `labels` relabels any value, one at a time, and `""`
 * hides that value's flag.
 */
export function structureLabel(
  structure: Open<BusinessStructure> | null,
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
 * whole-word mark as the typing does. A corrected letter is a kind of its own:
 * it joins another corrected letter, never the plain text beside it, and it is
 * part of a mark, so whitespace between it and the next marked word is marked
 * with that word.
 */
function mergeParts(parts: HighlightPart[]): HighlightPart[] {
  const pieces = parts.filter(part => part.text.length > 0);
  const out: HighlightPart[] = [];
  /** A part that is part of a mark: a match, or a letter corrected within one. */
  const marks = (part: HighlightPart | undefined) =>
    part !== undefined && (part.matched || part.corrected === true);
  pieces.forEach((part, index) => {
    const last = out[out.length - 1];
    const bridges =
      !part.matched &&
      part.corrected !== true &&
      /^\s+$/.test(part.text) &&
      marks(last) &&
      marks(pieces[index + 1]);
    const alike =
      last?.matched === part.matched &&
      (last?.corrected ?? false) === (part.corrected ?? false);
    if (last !== undefined && bridges) {
      if (last.corrected === true) {
        // The space between a corrected letter and the next word goes with the
        // word, as the service keeps it, and not with the corrected letter.
        out.push({ text: part.text, matched: true });
      } else {
        last.text += part.text;
      }
    } else if (last !== undefined && alike) {
      last.text += part.text;
    } else {
      out.push({ ...part });
    }
  });
  return out;
}

/**
 * How a letter the search corrected is drawn: `mark`, as a mark of its own
 * (the underline and background emphases draw it dotted and striped), or
 * `match`, as an ordinary match (weight and ink mark nothing for a fuzzy match,
 * so the word looks like any other match).
 */
export type CorrectedAs = "mark" | "match";

/** One letter of a name, with what its part said of it. */
interface Letter {
  character: string;
  matched: boolean;
  corrected: boolean;
}

function lettersOf(parts: HighlightPart[]): Letter[] {
  return parts.flatMap(part =>
    Array.from(part.text).map(character => ({
      character,
      matched: part.matched,
      // A part is a match whatever else it says.
      corrected: !part.matched && part.corrected === true,
    })),
  );
}

/** Adjacent letters of one kind as parts. */
function partsOfLetters(letters: Letter[]): HighlightPart[] {
  const out: HighlightPart[] = [];
  for (const { character, matched, corrected } of letters) {
    const last = out[out.length - 1];
    if (
      last !== undefined &&
      last.matched === matched &&
      (last.corrected === true) === corrected
    ) {
      last.text += character;
    } else {
      out.push({
        text: character,
        matched,
        ...(corrected ? { corrected: true as const } : {}),
      });
    }
  }
  return out;
}

/**
 * How many letters of a corrected word the typed `token` covers, or null when
 * the token is no spelling of it. The corrected letters are where the typed
 * word had letters wrong, and each is one of three things: a letter
 * substituted (it stands for a typed letter), a letter left out (it stands for
 * none) or one of a swap (two corrected letters stand for the two typed the
 * other way round). The other letters are the typed ones. Aligning the two lets
 * a deletion shift every letter after it, so `harbr` (five typed) covers all six
 * letters of HARBOR, the O marked, where `harbu` covers the first five.
 *
 * Both readings of a lone corrected letter fitting, it is taken as left out,
 * which covers more. Any number of corrected letters may be aligned, the
 * service's one edit per word being no business of this: the word is covered
 * through the furthest letter the typed text reaches, and the typed text must
 * reach every corrected letter, or it is no spelling of the word (the field has
 * moved on since the rows were answered).
 */
function coveredBy(
  stored: string[],
  corrected: boolean[],
  token: string[],
): number | null {
  const typed = token.length;
  // reach[i][j]: the first `i` stored letters account for the first `j` typed.
  const reach = Array.from({ length: stored.length + 1 }, () =>
    new Array<boolean>(typed + 1).fill(false),
  );
  reach[0]![0] = true;
  for (let i = 0; i < stored.length; i += 1) {
    for (let j = 0; j <= typed; j += 1) {
      if (!reach[i]![j]) {
        continue;
      }
      if (!corrected[i]) {
        if (j < typed && token[j] === stored[i]) {
          reach[i + 1]![j + 1] = true;
        }
        continue;
      }
      if (j < typed) {
        // Substituted, or left out while typed letters remain to be placed.
        reach[i + 1]![j + 1] = true;
        reach[i + 1]![j] = true;
      }
      if (
        corrected[i + 1] &&
        j + 1 < typed &&
        token[j] === stored[i + 1] &&
        token[j + 1] === stored[i]
      ) {
        reach[i + 2]![j + 2] = true;
      }
    }
  }
  const last = corrected.lastIndexOf(true);
  for (let covered = stored.length; covered > last; covered -= 1) {
    if (reach[covered]![typed]) {
      return covered;
    }
  }
  return null;
}

/**
 * How many letters of a word with a corrected letter the typed text covers, or
 * null when no typed token spells it (the word keeps the marks the service
 * gave it).
 */
function correctedLength(word: Letter[], tokens: string[]): number | null {
  const stored = word.map(letter => foldChar(letter.character));
  if (stored.some(folded => Array.from(folded).length !== 1)) {
    return null;
  }
  const corrected = word.map(letter => letter.corrected);
  let best: number | null = null;
  for (const token of tokens) {
    const covered = coveredBy(stored, corrected, Array.from(token));
    if (covered !== null && (best === null || covered > best)) {
      best = covered;
    }
  }
  return best;
}

/**
 * The typed-characters region's parts for a name with a corrected letter. Each
 * word is cut where the typed text ends, as `cutMarked` cuts a marked one; a
 * corrected word is cut where the typed text, aligned to its letters, ends, so
 * that a letter left out is covered and the letters after it typed are too.
 */
function correctedSubstring(
  text: string,
  parts: HighlightPart[],
  tokens: string[],
  correctedAs: CorrectedAs,
): HighlightPart[] {
  const letters = lettersOf(parts);
  const unmark = (letter: Letter) => {
    letter.matched = false;
    letter.corrected = false;
  };
  let at = 0;
  for (const piece of text.match(WORD_OR_GAP) ?? [text]) {
    const size = Array.from(piece).length;
    const word = letters.slice(at, at + size);
    at += size;
    if (!WORD.test(piece)) {
      // Whitespace a marked part bridged is marked again by `mergeParts`.
      word.forEach(unmark);
    } else if (word.some(letter => letter.corrected)) {
      const covered = correctedLength(word, tokens);
      if (covered !== null) {
        word.slice(covered).forEach(unmark);
      }
    } else if (word.every(letter => letter.matched)) {
      const typed = typedPrefixLength(piece, tokens);
      if (typed > 0 && typed < word.length) {
        word.slice(typed).forEach(unmark);
      }
    }
  }
  if (correctedAs === "match") {
    for (const letter of letters) {
      if (letter.corrected) {
        letter.corrected = false;
        letter.matched = true;
      }
    }
  }
  return mergeParts(partsOfLetters(letters));
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
 *
 * A letter the search corrected arrives as a part of its own (`corrected`).
 * Under `substring` a word with one is cut where the typed text, aligned to its
 * letters, ends: a letter left out is covered and marked, and the untyped rest
 * of the word stays plain. `correctedAs` says how it is drawn: as a mark of its
 * own (`mark`, the default), or, for an emphasis that marks nothing for a fuzzy
 * match, as an ordinary match (`match`). A name with no corrected letter is
 * drawn as it always was.
 */
export function partsFor(
  text: string,
  parts: HighlightPart[],
  region: MatchRegion,
  tokens: string[],
  correctedAs: CorrectedAs = "mark",
): HighlightPart[] | null {
  if (parts.length === 0 || parts.map(part => part.text).join("") !== text) {
    return null;
  }
  if (parts.some(part => !part.matched && part.corrected === true)) {
    if (region === "token") {
      return correctedAs === "match"
        ? mergeParts(
            partsOfLetters(
              lettersOf(parts).map(letter => ({
                ...letter,
                matched: letter.matched || letter.corrected,
                corrected: false,
              })),
            ),
          )
        : parts;
    }
    return correctedSubstring(text, parts, tokens, correctedAs);
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
