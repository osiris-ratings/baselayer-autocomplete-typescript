// Made-up rows for the Styling preview, so every field of a row can be styled
// before anything is typed: highlights, an alternative name that matched, the
// domicile square and the overflow, a spread of structures (one on a name
// that carries no suffix, and one not known), an address, officers with a +N,
// and a registered agent, and two rows a filter reached: by an officer, and by
// an officer's address. Then people and addresses, each leading to some of
// these businesses. None of these businesses, people or addresses is real.

import { queryTokens } from "@baselayer-sdk/autocomplete";
import type {
  AddressSuggestion,
  BusinessSuggestion,
  HighlightPart,
  Include,
  PersonSuggestion,
  RelatedItem,
  RelatedSet,
} from "@baselayer-sdk/autocomplete";

/**
 * What the rows pretend was typed: one word in full and the next only begun,
 * so "whole word" and "typed characters" highlight them differently.
 */
export const SAMPLE_QUERY = "harbor concr";
const TOKENS = queryTokens(SAMPLE_QUERY);

/** `matched` is how many of the set a relation filter matched; null without one. */
export function set(
  items: RelatedItem[],
  count = items.length,
  matched: number | null = null,
): RelatedSet {
  return { count, matched, truncated: count > items.length, items };
}

export function address(
  label: string,
  role: "principal" | "officer" | "agent" = "principal",
  matched = false,
): RelatedItem {
  return { type: "address", token: null, label, role, matched };
}

export function person(
  label: string,
  role: "officer" | "agent",
  matched = false,
): RelatedItem {
  return { type: "person", token: null, label, role, matched };
}

/**
 * A name split as the autocomplete service splits it: each word a typed token
 * starts is one highlighted part, whole, and the text between words is another.
 */
export function highlightFor(
  name: string,
  tokens: readonly string[],
): HighlightPart[] {
  return name
    .split(/([A-Za-z0-9]+)/)
    .filter(text => text !== "")
    .map(text => ({
      text,
      matched: tokens.some(token => text.toLowerCase().startsWith(token)),
    }));
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
      addresses: set([address("1200 River Rd, Pittsburgh, PA 15212")]),
    },
  }),
  row("NORTHSHORE PUMPING, LLC", {
    matchedName: "HARBOR CONCRETE PUMPS",
    domicile_state: "OH",
    states: ["OH", "PA"],
    structure: "LLC",
    related: {
      people: set([person("MERIDIAN REGISTERED AGENTS, LLC", "agent")]),
      addresses: set([address("88 Canal St, Akron, OH 44308")]),
    },
  }),
  row("HARBOR VIEW CONCRETE, INC.", {
    domicile_state: "DE",
    states: ["CA", "DE", "FL", "TX", "WA"],
    structure: "S_CORPORATION",
    related: {
      // An officer filter reached this row: the one it matched.
      people: set([person("Priya Raman", "officer", true)], 3, 1),
      addresses: set([address("400 Bayfront Ave, Tampa, FL 33602")]),
    },
  }),
  row("HARBOR CONCRETE SUPPLY, INC.", {
    domicile_state: "NJ",
    states: ["NJ"],
    structure: null,
    related: {
      people: set([]),
      addresses: set([address("15 Ferry St, Newark, NJ 07105")]),
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
        [address("2210 Key Hwy, Baltimore, MD 21230", "officer", true)],
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
      addresses: set([address("700 Harborside Dr, Galveston, TX 77550")]),
    },
  }),
  row("HARBOR CONCRETE FORMING, INC.", {
    domicile_state: "WA",
    states: ["AK", "OR", "WA"],
    structure: "B_CORPORATION",
    related: {
      people: set([person("Tomas Lindqvist", "officer")]),
      addresses: set([address("3100 Marine View Dr, Tacoma, WA 98422")]),
    },
  }),
  row("BAYSIDE HARBOR CONCRETE, INC.", {
    domicile_state: "CA",
    states: ["AZ", "CA", "NV", "OR"],
    structure: "C_CORPORATION",
    related: {
      people: set([person("Maya Castellanos", "officer")], 3),
      addresses: set([address("55 Embarcadero W, Oakland, CA 94607")]),
    },
  }),
];

const NOT_REQUESTED: RelatedSet = {
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
  const asked = (relation: Include, set: RelatedSet) =>
    include.includes(relation) ? set : NOT_REQUESTED;
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
export const SAMPLE_ADDRESSES_QUERY = "1200 river";

/** A business offered under a person or an address: one of the rows above. */
function business(
  label: string,
  role: RelatedItem["role"],
  matched = false,
): RelatedItem {
  if (!SAMPLE_SUGGESTIONS.some(row => row.label === label)) {
    throw new Error(`no sample business is called ${label}`);
  }
  return { type: "business", token: sampleToken(label), label, role, matched };
}

function personRow(
  label: string,
  businesses: RelatedSet,
  addresses: RelatedSet = NOT_REQUESTED,
): PersonSuggestion {
  return {
    type: "person",
    token: `sample-person-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`,
    label,
    matched_name: null,
    match: "strong",
    highlight: highlightFor(label, queryTokens(SAMPLE_PEOPLE_QUERY)),
    related: { businesses, addresses },
  };
}

export const SAMPLE_PEOPLE: PersonSuggestion[] = [
  personRow(
    "Dana Whitfield",
    set(
      [
        business("HARBOR CONCRETE PUMPING CO., INC.", "officer"),
        business("HARBOR CONCRETE SUPPLY, INC.", "officer"),
        business("BAYSIDE HARBOR CONCRETE, INC.", "officer"),
      ],
      7,
    ),
    set([address("1200 River Rd, Pittsburgh, PA 15212", "officer")]),
  ),
  personRow(
    "Dana Okafor",
    set(
      [
        business("HARBOR CONCRETE & MASONRY", "officer"),
        business("CONCRETE HARBOR PARTNERS, LP", "officer"),
      ],
      2,
    ),
  ),
  personRow(
    "Dana Kessler",
    set([business("NORTHSHORE PUMPING, LLC", "officer")]),
  ),
  personRow(
    "Luis Ortega",
    set([business("HARBOR CONCRETE PUMPING CO., INC.", "officer")]),
  ),
  personRow(
    "Priya Raman",
    set([business("HARBOR VIEW CONCRETE, INC.", "officer")], 3),
  ),
  personRow(
    "Grace Oduya",
    set([business("HARBOR CONCRETE & MASONRY", "officer")]),
  ),
  personRow(
    "Meridian Registered Agents, LLC",
    set(
      [
        business("NORTHSHORE PUMPING, LLC", "agent"),
        business("HARBOR CONCRETE PUMPING CO., INC.", "agent"),
      ],
      38,
    ),
  ),
];

function addressRow(
  line1: string,
  line2: string | null,
  city: string,
  state: string,
  postalCode: string,
  businesses: RelatedSet,
): AddressSuggestion {
  const first = line2 === null ? line1 : `${line1} ${line2}`;
  const label = `${first}, ${city}, ${state} ${postalCode}`;
  return {
    type: "address",
    token: `sample-address-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    label,
    matched_name: null,
    match: "strong",
    highlight: highlightFor(label, queryTokens(SAMPLE_ADDRESSES_QUERY)),
    components: { line1, line2, city, state, postal_code: postalCode },
    related: { businesses, people: NOT_REQUESTED },
  };
}

export const SAMPLE_ADDRESSES: AddressSuggestion[] = [
  addressRow(
    "1200 River Rd",
    null,
    "Pittsburgh",
    "PA",
    "15212",
    set(
      [
        business("HARBOR CONCRETE PUMPING CO., INC.", "principal"),
        business("HARBOR CONCRETE SUPPLY, INC.", "mailing"),
      ],
      2,
    ),
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
        business("NORTHSHORE PUMPING, LLC", "agent"),
        business("HARBOR CONCRETE PUMPING CO., INC.", "agent"),
        business("CONCRETE HARBOR PARTNERS, LP", "agent"),
      ],
      412,
    ),
  ),
  addressRow(
    "700 Harborside Dr",
    null,
    "Galveston",
    "TX",
    "77550",
    set([business("CONCRETE HARBOR PARTNERS, LP", "principal")]),
  ),
  addressRow(
    "2210 Key Hwy",
    null,
    "Baltimore",
    "MD",
    "21230",
    set([business("HARBOR CONCRETE & MASONRY", "officer")]),
  ),
  addressRow(
    "400 Bayfront Ave",
    null,
    "Tampa",
    "FL",
    "33602",
    set([business("HARBOR VIEW CONCRETE, INC.", "principal")]),
  ),
];
