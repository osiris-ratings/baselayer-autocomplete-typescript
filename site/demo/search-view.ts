// What the search report says, as plain functions: how the API's fields read
// as words, which verdict and which pills a search earns, and in what order
// its filings and watchlists are shown. The component only lays them out.

import {
  queryTokens,
  structureLabel,
  typedPrefixLength,
  type BusinessStructure,
  type MatchedOn,
} from "@baselayer-sdk/autocomplete";

import type {
  Address,
  AddressMatchType,
  AddressWithSources,
  Business,
  MatchType,
  Officer,
  Registration,
  Search,
  WatchlistHit,
} from "./searches";

/** How a chip or a pill reads at a glance: green, amber, red, grey or blue. */
export type Tone = "good" | "warn" | "bad" | "neutral" | "info";

export interface Chip {
  label: string;
  tone: Tone;
}

// ---- Words ------------------------------------------------------------------

/**
 * `text` as words that start with a capital, a word's own case taken from
 * `keep`. Text that already has lower case is somebody's choice, and stays.
 */
function titleCase(text: string, keep: (upper: string) => boolean): string {
  if (text !== text.toUpperCase()) {
    return text;
  }
  return (
    text
      .toLowerCase()
      // A word starts at a letter that no letter or digit comes before, so
      // `3RD` stays `3rd` and `ÉLITE` is one word, not two.
      .replace(
        /(^|[^\p{L}\p{N}])(\p{L}[\p{L}'’]*)/gu,
        (_all, before: string, word: string) => {
          const upper = word.toUpperCase();
          return `${before}${keep(upper) ? upper : `${upper.charAt(0)}${word.slice(1)}`}`;
        },
      )
      // A lone letter after digits is a unit or a suffix (`5B`, `100A`).
      .replace(
        /\b(\d+)([a-z])\b/g,
        (_all, digits: string, letter: string) =>
          `${digits}${letter.toUpperCase()}`,
      )
  );
}

/**
 * Names that registries send in capitals, and that stay capitals: the legal
 * forms, and the officer titles that are initials (`CEO`, `VP`).
 */
const NAME_UPPER = new Set([
  "LLC",
  "LLP",
  "LLLP",
  "PLLC",
  "LP",
  "PC",
  "NA",
  "USA",
  "II",
  "III",
  "IV",
  "CEO",
  "CFO",
  "COO",
  "CTO",
  "CIO",
  "CMO",
  "VP",
  "SVP",
  "EVP",
]);
/** Three or four consonants are initials (`HCP`, `TNT`), not a word. */
const INITIALS = /^[B-DF-HJ-NP-TV-XZ]{3,4}$/;

/**
 * A registry's SHOUTING as a name: `HARBOR CONCRETE PUMPING CO., INC.` reads
 * `Harbor Concrete Pumping Co., Inc.`, and `LLC` and initials stay as they are.
 */
export function readable(text: string | null | undefined): string {
  // The API's types say a string, but a name it leaves out must not take the
  // page down with it.
  if (typeof text !== "string") {
    return "";
  }
  return titleCase(
    text,
    upper => NAME_UPPER.has(upper) || INITIALS.test(upper),
  );
}

/** What stays capitals in an address besides its state. */
const ADDRESS_UPPER = new Set([
  "PO",
  "NE",
  "NW",
  "SE",
  "SW",
  "II",
  "III",
  "IV",
]);

/**
 * An address string in the same spirit, with its state still a state:
 * `1200 RIVER RD, PITTSBURGH, PA 15212` reads `1200 River Rd, Pittsburgh,
 * PA 15212`, and a bare `CA` stays `CA`.
 */
export function readableAddress(text: string | null | undefined): string {
  if (typeof text !== "string") {
    return "";
  }
  if (/^[A-Za-z]{2}$/.test(text.trim())) {
    return text.trim().toUpperCase();
  }
  return titleCase(text, upper => ADDRESS_UPPER.has(upper)).replace(
    /(,\s*)([A-Z][a-z])(?=\s+\d{5}(?:-\d{4})?\s*$|\s*$)/,
    (_all, comma: string, state: string) => `${comma}${state.toUpperCase()}`,
  );
}

/** `street, City, ST zip`, or null with no address. */
export function formatAddress(
  address: Address | null | undefined,
): string | null {
  if (address === null || address === undefined) {
    return null;
  }
  const place = [address.state, address.zip]
    .filter(part => typeof part === "string" && part !== "")
    .join(" ");
  const line = [
    readableAddress(address.street),
    readableAddress(address.city),
    place,
  ]
    .filter(part => part !== "")
    .join(", ");
  return line === "" ? null : line;
}

/** `YYYY-MM-DD` as `MM/DD/YYYY`; anything else as it came. */
export function formatDay(day: string | null | undefined): string | null {
  if (day === null || day === undefined || day === "") {
    return null;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(day);
  return match === null ? day : `${match[2]}/${match[3]}/${match[1]}`;
}

/** `186` as `15 years and 6 months`. */
export function monthsLabel(months: number): string {
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const y = years === 1 ? "1 year" : `${years} years`;
  const m = rest === 1 ? "1 month" : `${rest} months`;
  if (years === 0) return m;
  return rest === 0 ? y : `${y} and ${m}`;
}

/** `4.2 s`, or `812 ms` under a second. */
export function elapsedLabel(ms: number): string {
  // Round before choosing the unit: 999.6 ms is 1000 ms once rounded, which
  // reads `1.0 s`, not `1000 ms`.
  const whole = Math.round(ms);
  return whole < 1000 ? `${whole} ms` : `${(ms / 1000).toFixed(1)} s`;
}

/** The console link when it is one a click may follow: https and nothing else. */
export function consoleHref(search: Search): string | null {
  const url = search.console_url;
  if (url === undefined) {
    return null;
  }
  try {
    return new URL(url).protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

// ---- Verdict and ratings ------------------------------------------------------

export type VerdictKind =
  "verified" | "not-verified" | "fraud" | "no-match" | "failed" | "cancelled";

export interface Verdict {
  kind: VerdictKind;
  label: string;
}

const CONSORTIUM = "BFC";

/** Whether a business is in the Baselayer Fraud Consortium's list. */
function fraudHit(search: Search): boolean {
  return [
    ...(search.watchlist_hits ?? []),
    ...(search.business?.watchlist_hits ?? []),
  ].some(hit => hit.code === CONSORTIUM && hit.count > 0);
}

/**
 * The one word the report leads with: what the search made of the business.
 * A search that found none is `no-match`, any other failure just `failed`.
 */
export function verdictOf(search: Search): Verdict | null {
  if (search.state === "CANCELLED") {
    return { kind: "cancelled", label: "Cancelled" };
  }
  if (search.state === "FAILED") {
    return /no match/i.test(search.error ?? "")
      ? { kind: "no-match", label: "No match" }
      : { kind: "failed", label: "Search failed" };
  }
  if (fraudHit(search)) {
    return { kind: "fraud", label: "Fraud hit" };
  }
  if (search.verified === true) {
    return { kind: "verified", label: "Verified" };
  }
  if (search.verified === false) {
    return { kind: "not-verified", label: "Not verified" };
  }
  return null;
}

export type Grade = "A" | "B" | "C" | "F";

/** What each letter says, in the console's words. */
export const GRADE_LABELS: Record<Grade, string> = {
  A: "Low risk",
  B: "Mid risk",
  C: "High risk",
  F: "Fail",
};

function isGrade(rating: string): rating is Grade {
  return rating === "A" || rating === "B" || rating === "C" || rating === "F";
}

export interface Rating {
  type: "kyb" | "risk";
  title: string;
  /** Null for a letter this page does not know. */
  grade: Grade | null;
  score: number;
  label: string | null;
}

const RATING_TITLES = { kyb: "KYB rating", risk: "Risk rating" } as const;

/** The search's KYB or risk rating, or null when it has none. */
export function ratingOf(search: Search, type: "kyb" | "risk"): Rating | null {
  const found = (search.scores ?? []).find(score => score.type === type);
  if (found === undefined || !Number.isFinite(found.score)) {
    return null;
  }
  const grade = isGrade(found.rating) ? found.rating : null;
  return {
    type,
    title: RATING_TITLES[type],
    grade,
    score: Math.round(found.score),
    label: grade === null ? null : GRADE_LABELS[grade],
  };
}

// ---- How it matched -----------------------------------------------------------

const MATCH_CHIPS: Partial<Record<string, Chip>> = {
  EXACT: { label: "Exact match", tone: "good" },
  SIMILAR: { label: "Similar match", tone: "warn" },
  CITY: { label: "City match", tone: "warn" },
  STATE: { label: "State match", tone: "warn" },
  NO_MATCH: { label: "No match", tone: "bad" },
};

/** The pill for the API's match grade, or null for one not known. */
export function matchPill(
  match: MatchType | AddressMatchType | null | undefined,
): Chip | null {
  return match === null || match === undefined
    ? null
    : (MATCH_CHIPS[match] ?? null);
}

/** What the visitor had typed when they picked: the business name, and the person and address filters. */
export interface Typed {
  name: string;
  person: string;
  address: string;
}

export const NOTHING_TYPED: Typed = { name: "", person: "", address: "" };

/** What the visitor's pick matched on, as the report sets it against what the search found. */
export interface Matched {
  /** The name the business goes by that the pick matched, when it matched one. */
  alias: string | null;
  /** The officers the pick's person filter matched, as the typeahead named them. */
  officers: string[];
  /** The addresses its address filter matched, as the typeahead drew them. */
  addresses: string[];
  /** The states the visitor filtered by, as typed. */
  asked: string[];
  /** Those of the business's states that the filter named. */
  states: string[];
  /** What was typed, which the report underlines where it matched. */
  typed: Typed;
}

export const NOTHING_MATCHED: Matched = {
  alias: null,
  officers: [],
  addresses: [],
  asked: [],
  states: [],
  typed: NOTHING_TYPED,
};

/**
 * What a pick matched, read off the SDK's `matchedOn`, the state codes the
 * visitor typed and the rest of what they typed. Registered agents are people
 * the filter reached, not officers.
 */
export function matchedOf(
  matchedOn: readonly MatchedOn[],
  asked: readonly string[] = [],
  typed: Typed = NOTHING_TYPED,
): Matched {
  const matched: Matched = {
    alias: null,
    officers: [],
    addresses: [],
    asked: [...new Set(asked.map(code => code.trim().toUpperCase()))].filter(
      code => code !== "",
    ),
    states: [],
    typed,
  };
  for (const match of matchedOn) {
    switch (match.kind) {
      case "alias":
        matched.alias = match.name;
        break;
      case "officer":
        matched.officers.push(...match.names);
        break;
      case "address":
        matched.addresses.push(match.label);
        break;
      case "state":
        matched.states.push(...match.states);
        break;
      case "agent":
        break;
    }
  }
  return matched;
}

/** A stretch of a found text, and whether what the visitor typed matched it. */
export interface Stretch {
  text: string;
  matched: boolean;
  /** Part of the `(DBA …)` phrase: a name the business goes by, not its legal name. */
  dba: boolean;
}

const WORD_OR_GAP = /[\p{L}\p{N}']+|[^\p{L}\p{N}']+/gu;
const WORD = /^[\p{L}\p{N}']+$/u;

/**
 * `text` cut where what was typed stops matching it, the way the typeahead's
 * own marks are: a word a typed token starts is matched as far as the token
 * reaches (`baselaye` marks `Baselaye` of `Baselayer`, and `street` marks
 * nothing of `St`), and the whitespace between two matched words is matched
 * with them, so `353 Mission` is one underline. Nothing typed, nothing matched.
 */
export function markTyped(text: string, typed: string, dba = false): Stretch[] {
  const tokens = queryTokens(typed);
  const cut: { text: string; matched: boolean }[] = [];
  for (const piece of text.match(WORD_OR_GAP) ?? []) {
    const covered = WORD.test(piece) ? typedPrefixLength(piece, tokens) : 0;
    const characters = Array.from(piece);
    if (covered === 0) {
      cut.push({ text: piece, matched: false });
      continue;
    }
    cut.push({ text: characters.slice(0, covered).join(""), matched: true });
    if (covered < characters.length) {
      cut.push({ text: characters.slice(covered).join(""), matched: false });
    }
  }
  cut.forEach((part, index) => {
    if (
      !part.matched &&
      /^\s+$/.test(part.text) &&
      cut[index - 1]?.matched === true &&
      cut[index + 1]?.matched === true
    ) {
      part.matched = true;
    }
  });
  const stretches: Stretch[] = [];
  for (const part of cut) {
    const last = stretches[stretches.length - 1];
    if (last !== undefined && last.matched === part.matched) {
      last.text += part.text;
    } else {
      stretches.push({ ...part, dba });
    }
  }
  return stretches;
}

/**
 * `text` underlined whole when what was typed matched any of it, and plain when
 * it matched none: `baselaye` underlines all of `Baselayer`, and `jonathan` all
 * of `Jonathan Awad`. What matched is the name, the officer or the address,
 * not the letters that happened to be typed.
 */
export function markWhole(text: string, typed: string, dba = false): Stretch[] {
  if (text === "") {
    return [];
  }
  const matched = markTyped(text, typed).some(part => part.matched);
  return [{ text, matched, dba }];
}

/** A line of text as the letters and digits of it, so two spellings of one address meet. */
function lineKey(text: string | null | undefined): string {
  return (text ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** A name's words that are not initials: `HARLOW, THOMAS` and `Thomas A. Harlow` share two. */
function nameWords(name: string): string[] {
  return name
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(word => word.length > 1);
}

/**
 * Whether two officer names are one person's: every word of the shorter is in
 * the longer, which a middle name or a suffix does not change, and a surname
 * first does not either.
 */
export function sameOfficer(a: string, b: string): boolean {
  const [short, long] = [nameWords(a), nameWords(b)].sort(
    (x, y) => x.length - y.length,
  ) as [string[], string[]];
  return short.length >= 2 && short.every(word => long.includes(word));
}

export interface OnFile<T> {
  item: T;
  /** The pick matched it: the search's own address or officer, or what a filter reached. */
  matched: boolean;
}

/** `items` with those that matched first, each group in the order it came. */
function matchedFirst<T>(items: readonly OnFile<T>[]): OnFile<T>[] {
  return [
    ...items.filter(entry => entry.matched),
    ...items.filter(entry => !entry.matched),
  ];
}

/**
 * Every address the business has on file, as the API sent them (one under two
 * sources is drawn twice, as it is named), and its primary address when that
 * is not among them. The ones the pick's address filter reached lead, the
 * address the search carries first among them; then the primary, then the
 * rest. A pick no address filter reached matched none: the address its search
 * carries is the business's lead, not something it matched.
 */
export function addressesOnFile(
  business: Business | null | undefined,
  search: Search,
  matched: Matched,
): OnFile<AddressWithSources>[] {
  if (business === null || business === undefined) {
    return [];
  }
  const keysOf = (lines: readonly (string | null | undefined)[]) =>
    new Set(lines.map(lineKey).filter(key => key !== ""));
  const carried = keysOf([
    formatAddress(search.search_address ?? null),
    search.address,
  ]);
  const reached = keysOf(matched.addresses);
  const filtered = reached.size > 0;
  const primary = business.primary_address ?? null;
  const primaryKey = lineKey(formatAddress(primary));
  const listed = business.addresses ?? [];
  const all =
    primary !== null &&
    !listed.some(address => lineKey(formatAddress(address)) === primaryKey)
      ? [primary, ...listed]
      : listed;
  const entries = all.map(address => {
    const key = lineKey(formatAddress(address));
    return {
      item: address,
      carried: filtered && carried.has(key),
      matched: reached.has(key) || (filtered && carried.has(key)),
      primary: primaryKey !== "" && key === primaryKey,
    };
  });
  return [
    ...entries.filter(entry => entry.carried),
    ...entries.filter(entry => entry.matched && !entry.carried),
    ...entries.filter(entry => !entry.matched && entry.primary),
    ...entries.filter(entry => !entry.matched && !entry.primary),
  ].map(({ item, matched: reachedIt }) => ({ item, matched: reachedIt }));
}

/**
 * The names the business goes by, as the API sent them, the one the pick was
 * found by first: when the row matched a DBA, that DBA is why the business is
 * here. Two spellings of one name meet (`Baselayer` and `BASELAYER`).
 */
export function aliasesOnFile(
  business: Business | null | undefined,
  matched: Matched,
): OnFile<string>[] {
  const reached = lineKey(matched.alias);
  return matchedFirst(
    (business?.alternative_names ?? []).map(alias => ({
      item: readable(alias),
      matched: reached !== "" && lineKey(alias) === reached,
    })),
  );
}

/** How many addresses the report draws before it counts the rest. */
export const ADDRESSES_SHOWN = 10;

/**
 * The first `limit` of a list the matched lead, and how many that leaves out.
 * What matched is the point of the list, so it is never one of those left out:
 * more than `limit` matched are all drawn.
 */
export function leadingOnFile<T>(
  entries: readonly OnFile<T>[],
  limit: number = ADDRESSES_SHOWN,
): { shown: OnFile<T>[]; hidden: number } {
  const matched = entries.filter(entry => entry.matched).length;
  const shown = entries.slice(0, Math.max(limit, matched));
  return { shown, hidden: entries.length - shown.length };
}

/**
 * Every officer the business has, the ones the search matched first: those it
 * carries, and any the pick's person filter reached.
 */
export function officersOnFile(
  business: Business | null | undefined,
  search: Search,
  matched: Matched,
): OnFile<Officer>[] {
  const asked = [...(search.officer_names ?? []), ...matched.officers];
  return matchedFirst(
    (business?.business_officers ?? []).map(officer => ({
      item: officer,
      matched: asked.some(name => sameOfficer(name, officer.name)),
    })),
  );
}

/**
 * The state the business is domiciled in: where its domestic filing is, else
 * where it is incorporated. The same state the filings list puts first and
 * draws green, so the two cannot name different ones.
 */
export function domicileOf(
  business: Business | null | undefined,
): string | null {
  const domestic = (business?.registrations ?? []).find(
    registration => registration.registration_type === "domestic",
  );
  return textOr(domestic?.state) ?? textOr(business?.incorporation_state);
}

export interface StateOnFile extends OnFile<string> {
  /** The state the business is domiciled in. */
  domicile: boolean;
}

/**
 * Every state the business is registered in: its domicile first, then the ones
 * the visitor's filter named, then the rest. A state is where a filing is, and
 * the incorporation state even when its filing is not listed.
 */
export function statesOnFile(
  business: Business | null | undefined,
  matched: Matched,
): StateOnFile[] {
  if (business === null || business === undefined) {
    return [];
  }
  const domicile = domicileOf(business);
  const states = [
    ...new Set(
      [
        textOr(business.incorporation_state),
        ...orderedRegistrations(business.registrations).map(
          registration => registration.state,
        ),
      ].filter(state => state !== null),
    ),
  ];
  const entries = states.map(state => ({
    item: state,
    matched: matched.states.includes(state),
    domicile: state === domicile,
  }));
  return [
    ...entries.filter(entry => entry.domicile),
    ...entries.filter(entry => !entry.domicile && entry.matched),
    ...entries.filter(entry => !entry.domicile && !entry.matched),
  ];
}

function textOr(value: string | null | undefined): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

export interface MatchRow {
  key: "name" | "officer" | "address" | "states";
  label: string;
  /** What the search asked for, or what the visitor's pick matched. */
  yours: string | null;
  /** What the matched business has that it matched. */
  found: string | null;
  /** `found`, underlined where what the visitor typed matched it, with the DBA set apart. */
  parts: Stretch[];
  pill: Chip | null;
}

/** The pill for a match the API does not grade: the pick's own flag. */
const MATCHED_PILL: Chip = { label: "Match", tone: "good" };

/** The business's address as the report shows it: its primary, else its first. */
export function primaryAddressLine(
  business: Business | null | undefined,
): string | null {
  return formatAddress(
    business?.primary_address ?? business?.addresses?.[0] ?? null,
  );
}

/**
 * Your search against the business it found, a row for each thing the pick
 * matched on: its name (or the name it goes by), the officer, the address and
 * the states. A row with nothing on either side is left out. The API grades
 * the name, the address and the officer; the states are the filter's own, so
 * their pill is the pick's flag.
 */
export function matchRows(
  search: Search,
  matched: Matched = NOTHING_MATCHED,
): MatchRow[] {
  const business = search.business ?? null;
  const alias = matched.alias === null ? null : readable(matched.alias);
  const name =
    typeof business?.name === "string" ? readable(business.name) : null;
  const officers = search.officer_names ?? [];
  const yourOfficer = officers[0] ?? matched.officers[0] ?? null;
  const foundOfficer =
    officersOnFile(business, search, matched).find(entry => entry.matched)?.item
      .name ?? null;
  const foundAddress = addressesOnFile(business, search, matched).find(
    entry => entry.matched,
  )?.item;
  // The states the filter named that the business is in, as they were typed.
  const typed = matched.asked.filter(code => matched.states.includes(code));
  const foundStates = typed.length > 0 ? typed : matched.states;
  const said = matched.typed;
  const foundAddressLine =
    foundAddress === undefined
      ? primaryAddressLine(business)
      : formatAddress(foundAddress);
  const foundStatesLine =
    foundStates.length > 0 ? foundStates.join(", ") : null;
  const rows: MatchRow[] = [
    {
      key: "name",
      label: "Name",
      yours:
        alias ??
        (typeof search.name === "string" ? readable(search.name) : null),
      found: name === null || alias === null ? name : `${name} (DBA ${alias})`,
      parts:
        name === null
          ? []
          : [
              // The row's own name is the one that matched unless a name the
              // business goes by did, as the typeahead's row marks it.
              ...markWhole(name, alias === null ? said.name : ""),
              ...(alias === null
                ? []
                : [
                    { text: " (DBA ", matched: false, dba: true },
                    ...markWhole(alias, said.name, true),
                    { text: ")", matched: false, dba: true },
                  ]),
            ],
      pill: matchPill(search.business_name_match),
    },
    {
      key: "officer",
      label: "Officer",
      yours: yourOfficer === null ? null : readable(yourOfficer),
      found: foundOfficer === null ? null : readable(foundOfficer),
      parts:
        foundOfficer === null
          ? []
          : markWhole(readable(foundOfficer), said.person),
      pill:
        matchPill(search.business_officer_match) ??
        (foundOfficer === null ? null : MATCHED_PILL),
    },
    {
      key: "address",
      label: "Address",
      yours:
        typeof search.address === "string"
          ? readableAddress(search.address)
          : null,
      found: foundAddressLine,
      // Only an address the pick matched is underlined: the primary stands in
      // for one when none did, and what was typed did not reach it.
      parts:
        foundAddressLine === null
          ? []
          : markWhole(
              foundAddressLine,
              foundAddress === undefined ? "" : said.address,
            ),
      pill: matchPill(search.business_address_match),
    },
    {
      key: "states",
      label: "States",
      yours: matched.asked.length > 0 ? matched.asked.join(", ") : null,
      found: foundStatesLine,
      parts:
        foundStatesLine === null
          ? []
          : markWhole(foundStatesLine, matched.asked.join(" ")),
      pill: foundStates.length > 0 ? MATCHED_PILL : null,
    },
  ];
  return rows.filter(row => row.yours !== null || row.found !== null);
}

// ---- The business ---------------------------------------------------------------

/** The SDK's labels are for a row's badge; the report has room for the name. */
const ENTITY_TYPES: Partial<Record<BusinessStructure, string>> = {
  SOLE_PROPRIETORSHIP: "Sole proprietorship",
  GENERAL_PARTNERSHIP: "General partnership",
  LLC: "Limited liability company (LLC)",
  LLP: "Limited liability partnership (LLP)",
  LLLP: "Limited liability limited partnership (LLLP)",
  LP: "Limited partnership (LP)",
  C_CORPORATION: "C corporation",
  S_CORPORATION: "S corporation",
  B_CORPORATION: "Benefit corporation",
  NONPROFIT: "Nonprofit",
  COOPERATIVE: "Cooperative",
  TRUST: "Trust",
  PROFESSIONAL_ASSOCIATION: "Professional association",
  PROFESSIONAL_CORPORATION: "Professional corporation",
  TRADE_NAME: "Trade name (DBA)",
  BANK: "Bank",
  CREDIT_UNION: "Credit union",
  INSURANCE: "Insurance company",
};

/** What kind of entity the business is, or null when the API does not say. */
export function entityType(
  structure: BusinessStructure | null | undefined,
): string | null {
  return structureLabel(structure ?? null, ENTITY_TYPES);
}

/** What stands at an address, which its bullet draws. */
export type AddressKind =
  "commercial" | "residential" | "mail-drop" | "unknown";

/**
 * What the API says an address is: a mail drop when it is flagged one (that
 * outweighs what the building is), else commercial or residential, else not
 * known.
 */
export function addressKind(address: Address | null | undefined): AddressKind {
  if (address?.cmra === true) {
    return "mail-drop";
  }
  if (address?.rdi === "Commercial") {
    return "commercial";
  }
  if (address?.rdi === "Residential") {
    return "residential";
  }
  return "unknown";
}

/** What the API knows about delivery to an address, as chips. */
export function deliveryChips(address: Address | null | undefined): Chip[] {
  if (address === null || address === undefined) {
    return [];
  }
  const chips: Chip[] = [];
  if (address.deliverable === true) {
    chips.push({ label: "Deliverable", tone: "good" });
  } else if (address.deliverable === false) {
    chips.push({ label: "Not deliverable", tone: "warn" });
  }
  if (address.rdi === "Commercial" || address.rdi === "Residential") {
    chips.push({ label: address.rdi, tone: "neutral" });
  }
  if (address.cmra === true) {
    chips.push({ label: "Mail drop (CMRA)", tone: "warn" });
  }
  return chips;
}

/** Domestic first, then active, inactive and unknown, oldest filing first. */
export function orderedRegistrations(
  registrations: readonly Registration[] | undefined,
): Registration[] {
  const rank = (r: Registration) =>
    (r.registration_type === "domestic" ? 0 : 3) +
    (r.status === "active" ? 0 : r.status === "inactive" ? 1 : 2);
  return [...(registrations ?? [])].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (a.issue_date ?? "").localeCompare(b.issue_date ?? ""),
  );
}

/**
 * The filings with the domestic one first, then those in a state the visitor's
 * filter named, then the rest, each group in the order of
 * `orderedRegistrations`: the report's list of states is only squares, and the
 * filing is where a matched state is said.
 */
export function registrationsOnFile(
  registrations: readonly Registration[] | undefined,
  matched: Matched,
): OnFile<Registration>[] {
  const entries = orderedRegistrations(registrations).map(registration => ({
    item: registration,
    matched: matched.states.includes(registration.state),
  }));
  const home = (entry: OnFile<Registration>) =>
    entry.item.registration_type === "domestic";
  return [
    ...entries.filter(home),
    ...entries.filter(entry => !home(entry) && entry.matched),
    ...entries.filter(entry => !home(entry) && !entry.matched),
  ];
}

/** A filing's status as a chip. */
export function registrationStatus(registration: Registration): Chip {
  switch (registration.status) {
    case "active":
      return { label: "Active", tone: "good" };
    case "inactive":
      return { label: "Inactive", tone: "bad" };
    default:
      return { label: "Unknown", tone: "neutral" };
  }
}

/** Where a filing was made: in the business's home state, or as a visitor. */
export function registrationKind(registration: Registration): string | null {
  switch (registration.registration_type) {
    case "domestic":
      return "Domestic";
    case "foreign":
      return "Foreign";
    default:
      return null;
  }
}

// ---- Watchlists -------------------------------------------------------------------

export interface WatchlistRow {
  code: string;
  name: string;
  count: number;
  details: Record<string, unknown>[];
}

/**
 * The lists screened for the search and for the business it found, one row
 * each. When both say something about a list the louder one wins, so a hit
 * on either side is never hidden. Hits first, then by list.
 */
export function watchlistRows(search: Search): WatchlistRow[] {
  const byList = new Map<string, WatchlistRow>();
  const hits: WatchlistHit[] = [
    ...(search.watchlist_hits ?? []),
    ...(search.business?.watchlist_hits ?? []),
  ];
  for (const hit of hits) {
    const code = hit.code ?? hit.name;
    const row: WatchlistRow = {
      code,
      name: hit.name,
      count: hit.count,
      details: hit.details ?? [],
    };
    const held = byList.get(code);
    if (held === undefined || row.count > held.count) {
      byList.set(code, row);
    }
  }
  return [...byList.values()].sort(
    (a, b) => b.count - a.count || a.code.localeCompare(b.code),
  );
}

/** The keys a watchlist's entries name themselves and their listing by. */
const HIT_NAMES = ["name", "entity_name", "title"] as const;
const HIT_FACTS = [
  "program",
  "programs",
  "type",
  "entity_type",
  "classification",
  "country",
] as const;

function textOf(value: unknown): string | null {
  if (typeof value === "string" && value.trim() !== "") return value.trim();
  if (Array.isArray(value)) {
    const parts = value.filter(
      (item): item is string => typeof item === "string" && item !== "",
    );
    return parts.length > 0 ? parts.join(", ") : null;
  }
  return null;
}

/** One line per entry a list found, as far as its fields say who it is. */
export function hitLines(row: WatchlistRow, most = 5): string[] {
  const lines = row.details.slice(0, most).map(detail => {
    const name = HIT_NAMES.map(key => textOf(detail[key])).find(
      text => text !== null,
    );
    const fact = HIT_FACTS.map(key => textOf(detail[key])).find(
      text => text !== null,
    );
    return [name ?? "Entry", fact].filter(Boolean).join(" · ");
  });
  const more = row.count - lines.length;
  return more > 0 ? [...lines, `and ${more} more`] : lines;
}

// ---- At a glance -------------------------------------------------------------------

/** `1 list`, `2 lists`. */
export const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/**
 * The report in a line, for whoever reads no further: where the business is
 * incorporated, how long it has traded, where it is in good standing, who runs
 * it and whether any list names it. A part the search has nothing for is left
 * out.
 */
export function glance(search: Search): string[] {
  const business = search.business ?? null;
  if (search.state !== "COMPLETED" || business === null) {
    return [];
  }
  const parts: string[] = [];
  const state = business.incorporation_state;
  if (typeof state === "string" && state !== "") {
    parts.push(`Incorporated in ${state}`);
  }
  if (typeof business.months_in_business === "number") {
    parts.push(`${monthsLabel(business.months_in_business)} in business`);
  }
  const active = new Set(
    (business.registrations ?? [])
      .filter(registration => registration.status === "active")
      .map(registration => registration.state),
  );
  if (active.size > 0) {
    parts.push(`active in ${plural(active.size, "state", "states")}`);
  }
  const officers = business.business_officers?.length ?? 0;
  if (officers > 0) {
    parts.push(plural(officers, "officer", "officers"));
  }
  const lists = watchlistRows(search);
  if (lists.length > 0) {
    const hits = lists.reduce((total, list) => total + list.count, 0);
    parts.push(
      hits === 0
        ? "no watchlist hits"
        : plural(hits, "watchlist hit", "watchlist hits"),
    );
  }
  return parts;
}

// ---- Speech -------------------------------------------------------------------------

/** What a screen reader hears when the search finishes. */
export function announcement(search: Search, elapsedMs: number | null): string {
  const verdict = verdictOf(search);
  const took = elapsedMs === null ? "" : ` in ${elapsedLabel(elapsedMs)}`;
  const parts = [
    `Search finished${took}${verdict === null ? "." : `: ${verdict.label}.`}`,
  ];
  for (const type of ["kyb", "risk"] as const) {
    const rating = ratingOf(search, type);
    if (rating !== null) {
      parts.push(
        `${rating.title} ${rating.grade ?? rating.score}${rating.label === null ? "" : `, ${rating.label.toLowerCase()}`}.`,
      );
    }
  }
  return parts.join(" ");
}
