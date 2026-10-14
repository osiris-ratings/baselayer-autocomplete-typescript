import { MAX_Q_CHARS, setFilters } from "./businesses";
import { ROUTE_NAMES, type Route } from "./entities";

// The autocomplete service refuses a filter while the text beside it is too
// short, and which filters, how the text is counted and how long it must be are
// the service's rules. This module holds them so a query that would be refused
// is not asked. The counts follow the service's own functions, so what the
// client waits for is what the service would refuse.

const COMBINING_MARK = /\p{M}/gu;
/** Rust's `char::is_alphanumeric`: Alphabetic, or any number. */
const ALPHANUMERIC = /[\p{Alphabetic}\p{N}]/u;
const ASCII_ALPHANUMERIC = /[a-z0-9]/;

/** Rust's `char::is_whitespace`, which is not JavaScript's: it has U+0085, and no U+FEFF. */
function isWhitespace(character: string): boolean {
  const code = character.codePointAt(0)!;
  return (
    (code >= 0x09 && code <= 0x0d) ||
    code === 0x20 ||
    code === 0x85 ||
    code === 0xa0 ||
    code === 0x1680 ||
    (code >= 0x2000 && code <= 0x200a) ||
    code === 0x2028 ||
    code === 0x2029 ||
    code === 0x202f ||
    code === 0x205f ||
    code === 0x3000
  );
}

function isAscii(text: string): boolean {
  return Array.from(text).every(character => character.codePointAt(0)! < 0x80);
}

/** The service's `fold`: decomposed, combining marks dropped, then lower-cased. */
function fold(text: string): string {
  return text.normalize("NFD").replace(COMBINING_MARK, "").toLowerCase();
}

/**
 * The text as businesses and addresses read it for the stem (the service's
 * `text::stem`): folded, `&` read as ` and `, every run of letters and numbers
 * kept and anything else one space between runs, trimmed. A separator counts as
 * a character, an apostrophe is a separator, and a circled letter is a letter.
 */
export function stemText(q: string): string {
  const folded = fold(q).replace(/&/g, " and ");
  let out = "";
  let lastSpace = true;
  for (const character of folded) {
    if (ALPHANUMERIC.test(character)) {
      out += character;
      lastSpace = false;
    } else if (!lastSpace) {
      out += " ";
      lastSpace = true;
    }
  }
  return out.trimEnd();
}

/** Characters a query counts for businesses and addresses: code points, not UTF-16 units. */
export function stemCount(q: string): number {
  return Array.from(stemText(q)).length;
}

/** `String.prototype.trim` with the service's idea of whitespace. */
function trimmed(text: string): string {
  const characters = Array.from(text);
  let start = 0;
  let end = characters.length;
  while (start < end && isWhitespace(characters[start]!)) start += 1;
  while (end > start && isWhitespace(characters[end - 1]!)) end -= 1;
  return characters.slice(start, end).join("");
}

/**
 * The name as the people index spells it (the service's `text::person_name`):
 * lower-cased, diacritics dropped for anything not ASCII, `&` read as ` and `,
 * `-` and `_` spaces, and then only ASCII letters and digits, whitespace and the
 * apostrophe kept. Whatever has no ASCII spelling is dropped, not turned into a
 * space (`ø`, `ß` and every Cyrillic, Greek or CJK letter), and the name is cut
 * at 255 characters.
 */
export function personNameText(q: string): string {
  const lowered = trimmed(q).toLowerCase();
  const folded = isAscii(lowered)
    ? lowered
    : lowered.normalize("NFD").replace(COMBINING_MARK, "");
  const kept = Array.from(folded.replace(/&/g, " and ").replace(/[-_]/g, " "))
    .filter(
      character =>
        ASCII_ALPHANUMERIC.test(character) ||
        isWhitespace(character) ||
        character === "'",
    )
    .join("");
  const words: string[] = [];
  let word = "";
  for (const character of kept) {
    if (isWhitespace(character)) {
      if (word !== "") words.push(word);
      word = "";
    } else {
      word += character;
    }
  }
  if (word !== "") words.push(word);
  const spelled = words.join(" ");
  return Array.from(spelled).slice(0, 255).join("");
}

/** Characters a name counts for people. */
export function personNameCount(q: string): number {
  return Array.from(personNameText(q)).length;
}

/** How a route's rule counts the text beside its filters. */
export type FilterCount = "stem" | "person_name";

/** What one route's filters need, as the service states it. */
export interface FilterRule {
  /** The characters the text needs for the gated filters to be asked. */
  minStem: number;
  /** How the text is counted. */
  count: FilterCount;
  /** The filter parameters that wait for the stem, or every one the route takes. */
  gated: readonly string[] | "all";
  /**
   * Filter parameters that let a short text through when one is set: the text
   * must still have a character. People answer a short name beside a business
   * name.
   */
  shortAllowedWith: readonly string[];
}

export type FilterRules = Record<Route, FilterRule>;

/**
 * The rules the service applied before a session carried them, with the grant's
 * stem: what a session without per-route rules gets.
 */
export function fallbackFilterRules(minStem: number): FilterRules {
  return {
    businesses: {
      minStem,
      count: "stem",
      gated: "all",
      shortAllowedWith: [],
    },
    people: {
      minStem,
      count: "person_name",
      gated: "all",
      shortAllowedWith: ["business.name"],
    },
    addresses: {
      minStem,
      count: "stem",
      gated: "all",
      shortAllowedWith: [],
    },
  };
}

/**
 * The characters a query still lacks before its filters are asked, under
 * `rule`: 0 when it carries no gated filter, its text is long enough, or a
 * filter the rule lets a short text through with is set.
 */
export function charsUntilFilters(
  route: Route,
  query: { q: string; filters?: object | undefined },
  rule: FilterRule,
): number {
  const set = setFilters(route, query.filters).map(({ param }) => param);
  const gated =
    rule.gated === "all"
      ? set.length > 0
      : set.some(param => rule.gated.includes(param));
  if (!gated) {
    return 0;
  }
  const length = (rule.count === "stem" ? stemCount : personNameCount)(query.q);
  if (length >= rule.minStem) {
    return 0;
  }
  if (length > 0 && rule.shortAllowedWith.some(param => set.includes(param))) {
    return 0;
  }
  return rule.minStem - length;
}

function names(value: unknown): readonly string[] | null {
  return Array.isArray(value) && value.every(item => typeof item === "string")
    ? (value as string[])
    : null;
}

/**
 * The rules a session carries, snake_case or camelCase, for the routes it
 * names. A route whose rule is not one this client can read (a stem that is not
 * a positive integer, a count it does not know, gated filters that are not
 * names) is left out, so it falls back to today's rules, and the others are
 * kept: a rule it cannot read never refuses a session. Undefined when there is
 * nothing to read.
 */
export function parseFilterRules(
  value: unknown,
): Partial<FilterRules> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const rules: Partial<FilterRules> = {};
  for (const route of ROUTE_NAMES) {
    const entry = record[route];
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      continue;
    }
    const e = entry as Record<string, unknown>;
    const minStem = e.min_stem ?? e.minStem;
    const gated = e.gated === "all" ? "all" : names(e.gated);
    const allowed = e.short_allowed_with ?? e.shortAllowedWith ?? [];
    const shortAllowedWith = names(allowed);
    if (
      typeof minStem === "number" &&
      Number.isInteger(minStem) &&
      minStem > 0 &&
      minStem <= MAX_Q_CHARS &&
      (e.count === "stem" || e.count === "person_name") &&
      gated !== null &&
      shortAllowedWith !== null
    ) {
      rules[route] = { minStem, count: e.count, gated, shortAllowedWith };
    }
  }
  return Object.keys(rules).length > 0 ? rules : undefined;
}
