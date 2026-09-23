// Made-up rows for the Styling preview, so every part of a row can be styled
// before anything is typed: marks, an alternative name that matched, the
// domicile square and the overflow, an address, officers with a +N, and a
// registered agent. None of these businesses is real.

import type {
  BusinessSuggestion,
  HighlightPart,
  RelatedItem,
  RelatedSet,
} from "@baselayer/autocomplete";

function set(items: RelatedItem[], count = items.length): RelatedSet {
  return { count, matched: null, truncated: count > items.length, items };
}

function address(label: string): RelatedItem {
  return {
    type: "address",
    token: null,
    label,
    role: "principal",
    matched: false,
  };
}

function person(label: string, role: "officer" | "agent"): RelatedItem {
  return { type: "person", token: null, label, role, matched: false };
}

/** A name with the words of the preview's pretend query ("harbor concrete") marked. */
function marked(name: string): HighlightPart[] {
  return name
    .split(/(\s+)/)
    .map(text => ({ text, matched: /^(harbor|concrete)\b/i.test(text) }));
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
    highlight: marked(matchedName ?? label),
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
];

/** What the preview's count row and diagnostics say. */
export const SAMPLE_META = {
  found: 27,
  indexTag: "sample",
  roundTripMs: 42,
} as const;
