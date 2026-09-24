// Made-up rows for the Styling preview, so every part of a row can be styled
// before anything is typed: highlights, an alternative name that matched, the
// domicile square and the overflow, an address, officers with a +N, and a
// registered agent. None of these businesses is real.

import { queryTokens } from "@baselayer-sdk/autocomplete";
import type {
  BusinessSuggestion,
  HighlightPart,
  Include,
  RelatedItem,
  RelatedSet,
} from "@baselayer-sdk/autocomplete";

/**
 * What the rows pretend was typed: one word in full and the next only begun,
 * so "whole word" and "typed characters" highlight them differently.
 */
export const SAMPLE_QUERY = "harbor concr";
const TOKENS = queryTokens(SAMPLE_QUERY);

export function set(items: RelatedItem[], count = items.length): RelatedSet {
  return { count, matched: null, truncated: count > items.length, items };
}

export function address(label: string): RelatedItem {
  return {
    type: "address",
    token: null,
    label,
    role: "principal",
    matched: false,
  };
}

export function person(label: string, role: "officer" | "agent"): RelatedItem {
  return { type: "person", token: null, label, role, matched: false };
}

/**
 * A name split as the tier splits it: each word a typed token starts is one
 * highlighted part, whole, and the text between words is another.
 */
function highlight(name: string): HighlightPart[] {
  return name
    .split(/([A-Za-z0-9]+)/)
    .filter(text => text !== "")
    .map(text => ({
      text,
      matched: TOKENS.some(token => text.toLowerCase().startsWith(token)),
    }));
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
    token: `sample-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`,
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
    related: {
      people: set(
        [person("Dana Whitfield", "officer"), person("Luis Ortega", "officer")],
        4,
      ),
      addresses: set([address("1200 River Rd, Pittsburgh, PA 15212")]),
      liens: set([], 0),
    },
  }),
  row("NORTHSHORE PUMPING, LLC", {
    matchedName: "HARBOR CONCRETE PUMPS",
    domicile_state: "OH",
    states: ["OH", "PA"],
    related: {
      people: set([person("MERIDIAN REGISTERED AGENTS, LLC", "agent")]),
      addresses: set([address("88 Canal St, Akron, OH 44308")]),
      liens: set([], 0),
    },
  }),
  row("HARBOR VIEW CONCRETE, INC.", {
    domicile_state: "DE",
    states: ["CA", "DE", "FL", "TX", "WA"],
    related: {
      people: set([person("Priya Raman", "officer")]),
      addresses: set([address("400 Bayfront Ave, Tampa, FL 33602")]),
      liens: set([], 0),
    },
  }),
  row("HARBOR CONCRETE SUPPLY, INC.", {
    domicile_state: "NJ",
    states: ["NJ"],
    related: {
      people: set([]),
      addresses: set([address("15 Ferry St, Newark, NJ 07105")]),
      liens: set([], 0),
    },
  }),
  row("HARBOR CONCRETE & MASONRY, LLC", {
    domicile_state: "MD",
    states: ["DC", "MD", "VA"],
    related: {
      people: set([person("Grace Oduya", "officer")], 2),
      addresses: set([address("2210 Key Hwy, Baltimore, MD 21230")]),
      liens: set([], 0),
    },
  }),
  row("CONCRETE HARBOR PARTNERS, LP", {
    domicile_state: "TX",
    states: ["TX"],
    related: {
      people: set([person("Silverline Agent Services, Inc.", "agent")]),
      addresses: set([address("700 Harborside Dr, Galveston, TX 77550")]),
      liens: set([], 0),
    },
  }),
  row("HARBOR CONCRETE FORMING, INC.", {
    domicile_state: "WA",
    states: ["AK", "OR", "WA"],
    related: {
      people: set([person("Tomas Lindqvist", "officer")]),
      addresses: set([address("3100 Marine View Dr, Tacoma, WA 98422")]),
      liens: set([], 0),
    },
  }),
  row("BAYSIDE HARBOR CONCRETE, INC.", {
    domicile_state: "CA",
    states: ["AZ", "CA", "NV", "OR"],
    related: {
      people: set([person("Maya Castellanos", "officer")], 3),
      addresses: set([address("55 Embarcadero W, Oakland, CA 94607")]),
      liens: set([], 0),
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
 * `limit`, and a relation the row's parts do not ask for (`include`, from
 * `includeForParts`) not sent, as the tier leaves it out. The other knobs act
 * on typing, which the sample has none of.
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
      liens: asked("liens", row.related.liens),
    },
  }));
}

/** What the preview's count row and diagnostics say. */
export const SAMPLE_META = {
  found: 27,
  indexTag: "sample",
  roundTripMs: 42,
} as const;
