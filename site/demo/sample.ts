// Made-up rows for the Styling preview, so every field of a row can be styled
// before anything is typed: highlights, an alternative name that matched, the
// domicile square and the overflow, a spread of structures (one on a name
// that carries no suffix, and one not known), an address, officers with a +N,
// and a registered agent, and two rows a filter reached: by an officer, and by
// an officer's address. Then people and addresses, each leading to some of
// these businesses. None of these businesses, people or addresses is real.

import { leadAddressOf, queryTokens } from "@baselayer-sdk/autocomplete";
import type {
  AddressOfBusiness,
  AddressSuggestion,
  BusinessOfAddress,
  BusinessOfPerson,
  BusinessSuggestion,
  AddressListing,
  PersonRole,
  HighlightPart,
  Include,
  PersonOfBusiness,
  PersonSuggestion,
  RelatedAddress,
  RelatedBusiness,
  RelatedItem,
  RelatedPerson,
  RelatedSet,
} from "@baselayer-sdk/autocomplete";

/**
 * What the rows pretend was typed: one word in full and the next only begun,
 * so "whole word" and "typed characters" highlight them differently.
 */
export const SAMPLE_QUERY = "harbor concr";
const TOKENS = queryTokens(SAMPLE_QUERY);

/** `matched` is how many of the set a relation filter matched; null without one. */
export function set<Item extends RelatedItem>(
  items: Item[],
  count = items.length,
  matched: number | null = null,
): RelatedSet<Item> {
  return { count, matched, truncated: count > items.length, items };
}

/** An address listed under a business, with how the business filed it. */
export function address(
  label: string,
  listedAs: AddressListing = "principal",
  matched = false,
): AddressOfBusiness {
  return {
    type: "address",
    label,
    listed_as: listedAs,
    matched,
    highlight: null,
  };
}

/** A person listed under a business, with the role they hold on it. */
export function person(
  label: string,
  role: PersonRole,
  matched = false,
): PersonOfBusiness {
  return { type: "person", label, role: role, matched, highlight: null };
}

/**
 * An address listed under a person: the service seals no token for it and
 * names no role there.
 */
function addressOfPerson(label: string): RelatedAddress {
  return { type: "address", label, matched: false, highlight: null };
}

/** A person listed under an address, with no token and no role of their own. */
function personAtAddress(label: string): RelatedPerson {
  return { type: "person", label, matched: false, highlight: null };
}

const COMBINING = /\p{M}/gu;
const LEGAL_SUFFIXES = new Set([
  "inc",
  "llc",
  "lp",
  "llp",
  "ltd",
  "corp",
  "co",
]);

function fold(text: string): string {
  return text.normalize("NFD").replace(COMBINING, "").toLowerCase();
}

/**
 * Which letters of `stored` a typed word had wrong, one flag per letter of
 * `stored`: a letter substituted, the stored letter a typed word left out, both
 * letters of a swap. Null where there is no letter of `stored` to point at (the
 * words are equal, the typed word has a letter too many, or they are more than
 * one edit apart). A port of the autocomplete service's `corrected_letters`,
 * which the demo's made-up API answers with so that it cannot differ from it.
 */
export function correctedLetters(
  typed: string,
  stored: string,
): boolean[] | null {
  const t = Array.from(typed);
  const s = Array.from(stored);
  const same = (from: number, other: string[], at: number) =>
    t.slice(from).join("") === other.slice(at).join("");
  const first = Array.from(
    { length: Math.min(t.length, s.length) },
    (_, i) => i,
  ).find(i => t[i] !== s[i]);
  const flags = s.map(() => false);
  if (t.length === s.length) {
    if (first === undefined) {
      return null;
    }
    if (
      first + 1 < t.length &&
      t[first] === s[first + 1] &&
      t[first + 1] === s[first] &&
      same(first + 2, s, first + 2)
    ) {
      flags[first] = true;
      flags[first + 1] = true;
    } else if (same(first + 1, s, first + 1)) {
      flags[first] = true;
    } else {
      return null;
    }
    return flags;
  }
  if (t.length + 1 === s.length) {
    const at = first ?? t.length;
    if (!same(at, s, at + 1)) {
      return null;
    }
    flags[at] = true;
    return flags;
  }
  return null;
}

/**
 * How the search reads a typed `token` as `word` (both folded): the stored
 * letters it corrects, or an empty list for a letter typed too many, which
 * leaves nothing to point at; null when it is no respelling. The first letter
 * has to match, and a word of under four characters, with a digit or that is a
 * legal suffix is not corrected, as in the service. A token that starts the
 * word is not a typo.
 */
export function respelling(word: string, token: string): boolean[] | [] | null {
  if (
    token.length < 4 ||
    word.length < 4 ||
    /\d/.test(word) ||
    LEGAL_SUFFIXES.has(word) ||
    word.startsWith(token) ||
    token[0] !== word[0]
  ) {
    return null;
  }
  for (const length of [token.length, token.length + 1]) {
    if (length <= word.length) {
      const flags = correctedLetters(token, word.slice(0, length));
      if (flags !== null) {
        return flags;
      }
    }
  }
  // A letter too many: taking one out gives the word, or the start of it.
  const letters = Array.from(token);
  for (let at = 0; at < letters.length; at += 1) {
    const without = letters.filter((_, index) => index !== at).join("");
    if (word.startsWith(without) && without.length >= 3) {
      return [];
    }
  }
  return null;
}

/**
 * The autocomplete service's tidy-up of a name's parts: adjacent parts of one
 * kind become one, and whitespace between two matched parts is matched with
 * them.
 */
function tidy(parts: HighlightPart[]): HighlightPart[] {
  const out: HighlightPart[] = [];
  parts.forEach((part, index) => {
    const last = out[out.length - 1];
    const bridges =
      !part.matched &&
      part.corrected !== true &&
      /^\s+$/.test(part.text) &&
      last?.matched === true &&
      parts[index + 1]?.matched === true;
    if (
      last !== undefined &&
      (bridges ||
        (last.matched === part.matched &&
          (last.corrected === true) === (part.corrected === true)))
    ) {
      last.text += part.text;
    } else {
      out.push({ ...part });
    }
  });
  return out;
}

/**
 * A name split as the autocomplete service splits it: each word a typed token
 * starts is marked whole, and so is a word a token respells with a letter too
 * many; the text between words is not. A word a token respells otherwise is
 * marked whole too, but split by letter, the letters the typed word had wrong
 * `corrected` and never matched. One part per word and per run between words.
 */
export function highlightFor(
  name: string,
  tokens: readonly string[],
): HighlightPart[] {
  return name
    .split(/([A-Za-z0-9]+)/)
    .filter(text => text !== "")
    .flatMap((text): HighlightPart[] => {
      const word = fold(text);
      if (tokens.some(token => word.startsWith(token))) {
        return [{ text, matched: true }];
      }
      for (const token of tokens) {
        const flags = respelling(word, token);
        if (flags === null) {
          continue;
        }
        return Array.from(text).map((letter, index): HighlightPart =>
          flags[index] === true
            ? { text: letter, matched: false, corrected: true }
            : { text: letter, matched: true },
        );
      }
      return [{ text, matched: false }];
    });
}

/**
 * `highlightFor`, tidied as the autocomplete service tidies its own: what its
 * answers carry, so a made-up answer and a real one spell the parts alike. The
 * Styling preview's rows keep a part per word, to show the two regions apart.
 */
export function serviceHighlightFor(
  name: string,
  tokens: readonly string[],
): HighlightPart[] {
  return tidy(highlightFor(name, tokens));
}

function highlight(name: string): HighlightPart[] {
  return highlightFor(name, TOKENS);
}

/** The token a sample business carries, wherever it is offered. */
export function sampleToken(label: string): string {
  return `sample-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`;
}

function row(
  label: string,
  fields: Omit<
    BusinessSuggestion,
    "type" | "token" | "label" | "highlight" | "match" | "matched_name"
  > & {
    matchedName?: string;
  },
): BusinessSuggestion {
  const { matchedName, ...rest } = fields;
  return {
    ...rest,
    type: "business",
    token: sampleToken(label),
    label,
    matched_name: matchedName ?? null,
    match: "strong",
    highlight: highlight(matchedName ?? label),
  };
}

export const SAMPLE_SUGGESTIONS: BusinessSuggestion[] = [
  row("HARBOR CONCRETE PUMPING CO., INC.", {
    domicile_state: "PA",
    states: ["MD", "NY", "OH", "PA", "WV"],
    structure: "C_CORPORATION",
    related: {
      people: set(
        [person("Dana Whitfield", "officer"), person("Luis Ortega", "officer")],
        4,
      ),
      addresses: set([address("1200 Tallowmere Rd, Pittsburgh, PA 15212")]),
    },
  }),
  row("NORTHSHORE PUMPING, LLC", {
    matchedName: "HARBOR CONCRETE PUMPS",
    domicile_state: "OH",
    states: ["OH", "PA"],
    structure: "LLC",
    related: {
      people: set([person("MERIDIAN REGISTERED AGENTS, LLC", "agent")]),
      addresses: set([address("88 Velloway St, Akron, OH 44308")]),
    },
  }),
  row("HARBOR VIEW CONCRETE, INC.", {
    domicile_state: "DE",
    states: ["CA", "DE", "FL", "TX", "WA"],
    structure: "S_CORPORATION",
    related: {
      // An officer filter reached this row: the one it matched.
      people: set([person("Priya Raman", "officer", true)], 3, 1),
      addresses: set([address("400 Marrowbay Ave, Tampa, FL 33602")]),
    },
  }),
  row("HARBOR CONCRETE SUPPLY, INC.", {
    domicile_state: "NJ",
    states: ["NJ"],
    structure: null,
    related: {
      people: set([]),
      addresses: set([address("15 Corvel St, Newark, NJ 07105")]),
    },
  }),
  row("HARBOR CONCRETE & MASONRY", {
    domicile_state: "MD",
    states: ["DC", "MD", "VA"],
    structure: "TRADE_NAME",
    related: {
      people: set([person("Grace Oduya", "officer")], 2),
      // An address filter reached this row, by an officer's address.
      addresses: set(
        [address("2210 Pellington Hwy, Baltimore, MD 21230", "officer", true)],
        2,
        1,
      ),
    },
  }),
  row("CONCRETE HARBOR PARTNERS, LP", {
    domicile_state: "TX",
    states: ["TX"],
    structure: "LP",
    related: {
      people: set([person("Silverline Agent Services, Inc.", "agent")]),
      addresses: set([address("700 Gullhaven Dr, Galveston, TX 77550")]),
    },
  }),
  row("HARBOR CONCRETE FORMING, INC.", {
    domicile_state: "WA",
    states: ["AK", "OR", "WA"],
    structure: "B_CORPORATION",
    related: {
      people: set([person("Tomas Lindqvist", "officer")]),
      addresses: set([address("3100 Seavane Dr, Tacoma, WA 98422")]),
    },
  }),
  row("BAYSIDE HARBOR CONCRETE, INC.", {
    domicile_state: "CA",
    states: ["AZ", "CA", "NV", "OR"],
    structure: "C_CORPORATION",
    related: {
      people: set([person("Maya Castellanos", "officer")], 3),
      addresses: set([address("55 Tidecaster W, Oakland, CA 94607")]),
    },
  }),
];

const NOT_REQUESTED: RelatedSet<never> = {
  count: null,
  matched: null,
  truncated: false,
  items: [],
};

/**
 * The sample rows as the knobs would have them come back: no more than
 * `limit`, and a relation no placed field asks for (`include`, from
 * `includeForLayout`) not sent, as the autocomplete service leaves it out. The
 * other knobs act on typing, which the sample has none of.
 */
export function sampleRows({
  limit,
  include,
}: {
  limit: number;
  include: readonly Include[];
}): BusinessSuggestion[] {
  const asked = <Item extends RelatedItem>(
    relation: Include,
    set: RelatedSet<Item>,
  ) => (include.includes(relation) ? set : NOT_REQUESTED);
  return SAMPLE_SUGGESTIONS.slice(0, limit).map(row => ({
    ...row,
    related: {
      people: asked("people", row.related.people),
      addresses: asked("addresses", row.related.addresses),
    },
  }));
}

/** What the preview's count row and diagnostics say. */
export const SAMPLE_META = {
  found: 27,
  indexTag: "sample",
  roundTripMs: 42,
} as const;

/** What the people and address previews pretend was typed. */
export const SAMPLE_PEOPLE_QUERY = "dana";
export const SAMPLE_ADDRESSES_QUERY = "1200 tallowmere";

/** A sample business as a person's or an address's row lists it: one of the rows above. */
function business(label: string, matched = false): RelatedBusiness {
  const row = SAMPLE_SUGGESTIONS.find(row => row.label === label);
  if (row === undefined) {
    throw new Error(`no sample business is called ${label}`);
  }
  // What the business's own row leads with, as the autocomplete service sends it.
  return {
    type: "business",
    token: sampleToken(label),
    label,
    matched,
    matched_name: null,
    highlight: null,
    address: leadAddressOf(row),
    states: row.states,
    domicile_state: row.domicile_state,
  };
}

/** A business under a person, with the role they hold on it. */
function businessOfPerson(
  label: string,
  role: PersonRole,
  matched = false,
): BusinessOfPerson {
  return { ...business(label, matched), role: role };
}

/** A business under an address, with how it filed the address. */
function businessOfAddress(
  label: string,
  listedAs: AddressListing,
  matched = false,
): BusinessOfAddress {
  return { ...business(label, matched), listed_as: listedAs };
}

/** A slug for a sample person or address, as a token spells it. */
function slug(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

/**
 * A business offered under `owner`, its token pinning what it was reached
 * through, as the autocomplete service seals it: `~officer~<person>` for an
 * officer (an agent pins nothing), `~address~<address>` under an address.
 */
function pinned<Item extends RelatedBusiness>(
  set: RelatedSet<Item>,
  pin: (item: Item) => string | null,
): RelatedSet<Item> {
  return {
    ...set,
    items: set.items.map(item => {
      const suffix = pin(item);
      return suffix === null
        ? item
        : { ...item, token: `${item.token}${suffix}` };
    }),
  };
}

/** The states of the businesses listed, sorted by code, each once. */
function statesOf(businesses: readonly RelatedBusiness[]): string[] {
  return [...new Set(businesses.flatMap(item => item.states))].sort();
}

function personRow(
  label: string,
  businesses: RelatedSet<BusinessOfPerson>,
  addresses: RelatedSet<RelatedAddress>,
): PersonSuggestion {
  return {
    type: "person",
    token: `sample-person-${slug(label)}`,
    label,
    match: "strong",
    highlight: highlightFor(label, queryTokens(SAMPLE_PEOPLE_QUERY)),
    // A person has no jurisdiction of their own: the states of their businesses.
    states: statesOf(businesses.items),
    related: {
      businesses: pinned(businesses, item =>
        item.role === "officer" ? `~officer~${slug(label)}` : null,
      ),
      addresses,
    },
  };
}

export const SAMPLE_PEOPLE: PersonSuggestion[] = [
  personRow(
    "Dana Whitfield",
    set(
      [
        businessOfPerson("HARBOR CONCRETE PUMPING CO., INC.", "officer"),
        businessOfPerson("HARBOR CONCRETE SUPPLY, INC.", "officer"),
        businessOfPerson("BAYSIDE HARBOR CONCRETE, INC.", "officer"),
      ],
      7,
    ),
    set(
      [
        addressOfPerson("1200 Tallowmere Rd, Pittsburgh, PA 15212"),
        addressOfPerson("48 Corriway St, Pittsburgh, PA 15206"),
      ],
      3,
    ),
  ),
  personRow(
    "Dana Okafor",
    set(
      [
        businessOfPerson("HARBOR CONCRETE & MASONRY", "officer"),
        businessOfPerson("CONCRETE HARBOR PARTNERS, LP", "officer"),
      ],
      2,
    ),
    set([addressOfPerson("2210 Pellington Hwy, Baltimore, MD 21230")]),
  ),
  personRow(
    "Dana Kessler",
    set([businessOfPerson("NORTHSHORE PUMPING, LLC", "officer")]),
    set([addressOfPerson("915 Silverkell Blvd, Erie, PA 16507")]),
  ),
  personRow(
    "Luis Ortega",
    set([businessOfPerson("HARBOR CONCRETE PUMPING CO., INC.", "officer")]),
    set([addressOfPerson("1200 Tallowmere Rd, Pittsburgh, PA 15212")]),
  ),
  personRow(
    "Priya Raman",
    set([businessOfPerson("HARBOR VIEW CONCRETE, INC.", "officer")], 3),
    set([addressOfPerson("400 Marrowbay Ave, Tampa, FL 33602")], 2),
  ),
  personRow(
    "Grace Oduya",
    set([businessOfPerson("HARBOR CONCRETE & MASONRY", "officer")]),
    set([addressOfPerson("2210 Pellington Hwy, Baltimore, MD 21230")]),
  ),
  personRow(
    "Meridian Registered Agents, LLC",
    set(
      [
        businessOfPerson("NORTHSHORE PUMPING, LLC", "agent"),
        businessOfPerson("HARBOR CONCRETE PUMPING CO., INC.", "agent"),
      ],
      38,
    ),
    set([addressOfPerson("77 Quillfeather Ln Ste 300, Dover, DE 19904")]),
  ),
  // A registered agent who files from another business's office.
  personRow(
    "Corwin Ashby",
    set([businessOfPerson("HARBOR CONCRETE SUPPLY, INC.", "agent")]),
    set([addressOfPerson("1200 Tallowmere Rd, Pittsburgh, PA 15212")]),
  ),
];

function addressRow(
  line1: string,
  line2: string | null,
  city: string,
  state: string,
  postalCode: string,
  businesses: RelatedSet<BusinessOfAddress>,
  people: RelatedSet<RelatedPerson>,
): AddressSuggestion {
  const first = line2 === null ? line1 : `${line1} ${line2}`;
  const label = `${first}, ${city}, ${state} ${postalCode}`;
  return {
    type: "address",
    token: `sample-address-${slug(label)}`,
    label,
    match: "strong",
    highlight: highlightFor(label, queryTokens(SAMPLE_ADDRESSES_QUERY)),
    components: { line1, line2, city, state, postal_code: postalCode },
    related: {
      businesses: pinned(businesses, () => `~address~${slug(label)}`),
      people,
    },
  };
}

export const SAMPLE_ADDRESSES: AddressSuggestion[] = [
  addressRow(
    "1200 Tallowmere Rd",
    null,
    "Pittsburgh",
    "PA",
    "15212",
    set(
      [
        businessOfAddress("HARBOR CONCRETE PUMPING CO., INC.", "principal"),
        businessOfAddress("HARBOR CONCRETE SUPPLY, INC.", "mailing"),
      ],
      2,
    ),
    set([
      personAtAddress("Dana Whitfield"),
      personAtAddress("Luis Ortega"),
      personAtAddress("Corwin Ashby"),
    ]),
  ),
  // A registered agent's office: the one address most businesses share.
  addressRow(
    "77 Quillfeather Ln",
    "Ste 300",
    "Dover",
    "DE",
    "19904",
    set(
      [
        businessOfAddress("NORTHSHORE PUMPING, LLC", "registered_office"),
        businessOfAddress(
          "HARBOR CONCRETE PUMPING CO., INC.",
          "registered_office",
        ),
        businessOfAddress("CONCRETE HARBOR PARTNERS, LP", "registered_office"),
      ],
      412,
    ),
    set([personAtAddress("Meridian Registered Agents, LLC")]),
  ),
  addressRow(
    "700 Gullhaven Dr",
    null,
    "Galveston",
    "TX",
    "77550",
    set([businessOfAddress("CONCRETE HARBOR PARTNERS, LP", "principal")]),
    set([]),
  ),
  addressRow(
    "2210 Pellington Hwy",
    null,
    "Baltimore",
    "MD",
    "21230",
    set([businessOfAddress("HARBOR CONCRETE & MASONRY", "officer")]),
    set([personAtAddress("Dana Okafor"), personAtAddress("Grace Oduya")]),
  ),
  addressRow(
    "400 Marrowbay Ave",
    null,
    "Tampa",
    "FL",
    "33602",
    set([businessOfAddress("HARBOR VIEW CONCRETE, INC.", "principal")]),
    set([personAtAddress("Priya Raman")]),
  ),
];
