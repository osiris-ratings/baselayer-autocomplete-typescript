// What the search report says, as plain functions: how the API's fields read
// as words, which verdict and which pills a search earns, and in what order
// its filings and watchlists are shown. The component only lays them out.

import {
  structureLabel,
  type BusinessStructure,
} from "@baselayer-sdk/autocomplete";

import type {
  Address,
  AddressMatchType,
  Business,
  MatchType,
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

export interface MatchRow {
  key: "name" | "address";
  label: string;
  /** What the search asked for: for a pick, the business as the API recorded it. */
  yours: string | null;
  /** What the matched business is called. */
  found: string | null;
  pill: Chip | null;
}

/** The business's address as the report shows it: its primary, else its first. */
export function primaryAddressLine(
  business: Business | null | undefined,
): string | null {
  return formatAddress(
    business?.primary_address ?? business?.addresses?.[0] ?? null,
  );
}

/**
 * Your search against the business it found. A pick's search carries a name
 * and an address and nothing else to compare, so those are the rows; one with
 * neither on either side has no row.
 */
export function matchRows(search: Search): MatchRow[] {
  const business = search.business ?? null;
  const rows: MatchRow[] = [
    {
      key: "name",
      label: "Legal entity name",
      yours: typeof search.name === "string" ? readable(search.name) : null,
      found:
        typeof business?.name === "string" ? readable(business.name) : null,
      pill: matchPill(search.business_name_match),
    },
    {
      key: "address",
      label: "Legal entity address",
      yours:
        typeof search.address === "string"
          ? readableAddress(search.address)
          : null,
      found: primaryAddressLine(business),
      pill: matchPill(search.business_address_match),
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
