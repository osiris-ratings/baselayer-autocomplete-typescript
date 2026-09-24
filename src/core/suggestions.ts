import type { MatchRegion } from "./look";
import type { BusinessSuggestion, HighlightPart } from "./wire";

/**
 * Readers of a `GET /autocomplete/businesses` suggestion: what the typeahead's
 * rows show and what a pick fills into a host's form. Pure functions over the
 * wire shape, exported because hosts read them too.
 */

/**
 * The address the tier ranked first: the family's own filing in its domicile
 * state (principal, then mailing) when it has one, else an officer's or a
 * registered agent's address there, else the same ladder in its other
 * states. The tier owns that order; the console reads the head.
 */
export function leadAddressOf(suggestion: BusinessSuggestion): string | null {
  return suggestion.related.addresses.items[0]?.label ?? null;
}

/** The family's officers as named in the index; registered agents are not people. */
export function officersOf(suggestion: BusinessSuggestion): string[] {
  return suggestion.related.people.items
    .filter(item => item.role === "officer")
    .map(item => item.label);
}

export interface PeopleLine {
  names: string[];
  role: "officer" | "agent";
  /** How many more of this role the family has beyond the first name shown. */
  more: number;
}

/**
 * The people of `role` the family has beyond the first name shown: the rest
 * of the head, plus the people the head cap left out when they can only be
 * of this role. The tier lists officers before agents, so an agent inside
 * the head means every officer is already there and the people beyond the
 * head are agents; a head of officers alone says nothing about the roles
 * beyond it, and they are counted as more of the same. Without a total
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

/**
 * Who the second line names: the officers when the family has any in the
 * head, otherwise its registered agents, marked as such so a corporation's
 * name is not read as a person's. Nothing when it has neither.
 */
export function peopleLineOf(
  suggestion: BusinessSuggestion,
): PeopleLine | null {
  const officers = officersOf(suggestion);
  if (officers.length > 0) {
    return {
      names: officers,
      role: "officer",
      more: moreOf(suggestion, officers, "officer"),
    };
  }
  const agents = suggestion.related.people.items
    .filter(item => item.role === "agent")
    .map(item => item.label);
  if (agents.length === 0) {
    return null;
  }
  return {
    names: agents,
    role: "agent",
    more: moreOf(suggestion, agents, "agent"),
  };
}

/** The domicile first, then the other states in the tier's (sorted) order. */
export function orderedStates(suggestion: BusinessSuggestion): string[] {
  return [
    suggestion.domicile_state,
    ...suggestion.states.filter(state => state !== suggestion.domicile_state),
  ];
}

/** `found` is a floor when the tier stopped counting: `500+`. */
export function formatFound(found: number, capped: boolean): string {
  return capped ? `${found}+` : `${found}`;
}

const COMBINING_MARK = /\p{M}/gu;
const WORD_CHARACTER = /[\p{L}\p{N}']/u;
// A word as the tier's `highlight` sees one (letters, digits and apostrophes)
// or the run between two words.
const WORD_OR_GAP = /[\p{L}\p{N}']+|[^\p{L}\p{N}']+/gu;
const WORD = /^[\p{L}\p{N}']+$/u;

/**
 * The tier's `fold`, one character at a time: NFD, combining marks dropped,
 * lower-cased. Per character so that a folded prefix can be measured back
 * onto the displayed word — `É` folds to `e` and still counts as one.
 */
function foldChar(character: string): string {
  return character.normalize("NFD").replace(COMBINING_MARK, "").toLowerCase();
}

/**
 * The typed query as the tier tokenizes it for the marks: trimmed and
 * lower-cased, `&` as the word `and`, `-` and `_` as
 * spaces, every character that is not a letter, a digit or an apostrophe
 * dropped, diacritics folded. `Cin & Rig-ging, José` is `cin and rig ging
 * jose`.
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
 * One marked part cut at the typed characters. The tier bridges whitespace
 * between two marked words into one part (`CINDER RIGGING` for `cin rig`), so
 * a marked part is a run of words, not one word: each word is cut on its own
 * at the typed prefix, the runs between words are unmarked, and a word no
 * typed token starts keeps its whole mark (the field has moved on since these
 * rows were answered; the tier's mark is still the truth about the row).
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
 * The tier's own tidy-up, mirrored (`merge_whitespace_between_matches`):
 * adjacent parts of one kind become one, and whitespace between two marked
 * parts is marked with them, so two words typed out in full are one span —
 * the substring region grows into the whole-word mark as the typing does.
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
 * The tier's parts spell exactly one of a row's names — the one the query
 * reached — so a line owns them when they spell its text and not otherwise:
 * parts for the alternative name never half-mark the label, and a row reached
 * through an officer or an address (no parts) is drawn plain. Under the
 * `token` region the parts are drawn as the tier sent them; under `substring`
 * each marked word is cut at the typed characters (`cutMarked`), and the
 * result is tidied the way the tier tidies its own (`mergeParts`).
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
