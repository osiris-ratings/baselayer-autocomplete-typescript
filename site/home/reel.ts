// What the overview's typeahead reel types, and what the tier answers each
// stem with: three made-up businesses, typed a letter at a time and never
// finished. None of these businesses, people or addresses is real.

import { queryTokens } from "@baselayer-sdk/autocomplete";
import type {
  BusinessSuggestion,
  HighlightPart,
  RelatedSet,
} from "@baselayer-sdk/autocomplete";
import { MIN_QUERY_CHARS } from "@baselayer-sdk/autocomplete/react";

import { SAMPLE_SUGGESTIONS, address, person, set } from "../demo/sample";

export interface ReelCompany {
  /** What is typed: a name begun, and stopped mid-word. */
  query: string;
  /** Every row a stem of the query is answered from, best first. */
  rows: BusinessSuggestion[];
  /** How many businesses the whole query finds. */
  found: number;
}

const NO_LIENS: RelatedSet = set([], 0);

function business(
  label: string,
  fields: Pick<BusinessSuggestion, "domicile_state" | "states"> & {
    people: RelatedSet;
    address: string;
  },
): BusinessSuggestion {
  return {
    type: "business",
    token: `reel-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`,
    label,
    matched_name: null,
    match: "strong",
    highlight: [],
    domicile_state: fields.domicile_state,
    states: fields.states,
    related: {
      people: fields.people,
      addresses: set([address(fields.address)]),
      liens: NO_LIENS,
    },
  };
}

export const REEL: ReelCompany[] = [
  { query: "harbor concrete pum", rows: SAMPLE_SUGGESTIONS, found: 27 },
  {
    query: "bluestem bak",
    found: 12,
    rows: [
      business("BLUESTEM BAKERY & CAFE, LLC", {
        domicile_state: "MN",
        states: ["IA", "MN", "WI"],
        people: set(
          [
            person("Mara Lindqvist", "officer"),
            person("Theo Brandt", "officer"),
          ],
          3,
        ),
        address: "215 Main St, Stillwater, MN 55082",
      }),
      business("BLUESTEM BAKEHOUSE, INC.", {
        domicile_state: "NE",
        states: ["IA", "KS", "NE"],
        people: set([person("Rosa Delgado", "officer")]),
        address: "118 Maple Ave, Lincoln, NE 68508",
      }),
      business("BLUESTEM BAKING CO.", {
        domicile_state: "KS",
        states: ["KS"],
        people: set([person("PRAIRIE STATE AGENTS, LLC", "agent")]),
        address: "44 Mill Rd, Emporia, KS 66801",
      }),
      business("BLUESTEM BANK & TRUST", {
        domicile_state: "OK",
        states: ["KS", "OK"],
        people: set([person("Walter Ames", "officer")], 6),
        address: "310 Oak St, Bartlesville, OK 74003",
      }),
      business("BLUESTEM BARN EVENTS, LLC", {
        domicile_state: "IA",
        states: ["IA"],
        people: set([person("Jenna Price", "officer")]),
        address: "7 County Rd, Ames, IA 50010",
      }),
    ],
  },
  {
    query: "copperline ele",
    found: 18,
    rows: [
      business("COPPERLINE ELECTRIC, INC.", {
        domicile_state: "AZ",
        states: ["AZ", "NM", "NV", "UT"],
        people: set(
          [person("Sam Okafor", "officer"), person("Lena Hart", "officer")],
          3,
        ),
        address: "2750 Cedar Ln, Phoenix, AZ 85016",
      }),
      business("COPPERLINE ELECTRICAL CONTRACTORS, LLC", {
        domicile_state: "TX",
        states: ["OK", "TX"],
        people: set([person("LONE PEAK REGISTERED AGENTS, INC.", "agent")]),
        address: "900 Elm St, Fort Worth, TX 76102",
      }),
      business("COPPERLINE ELEVATOR SERVICES, LLC", {
        domicile_state: "CO",
        states: ["CO", "WY"],
        people: set([person("Nadia Petrov", "officer")]),
        address: "1600 Lake Dr, Denver, CO 80202",
      }),
      business("COPPERLINE ENERGY, LLC", {
        domicile_state: "NM",
        states: ["NM", "TX"],
        people: set([person("Carlos Mena", "officer")], 2),
        address: "501 Pine St, Albuquerque, NM 87102",
      }),
      business("COPPERLINE ENGINEERING GROUP, INC.", {
        domicile_state: "AZ",
        states: ["AZ"],
        people: set([person("Beth Lorne", "officer")]),
        address: "88 Birch Ave, Tucson, AZ 85701",
      }),
    ],
  },
];

/** At most as many rows as the component shows by default. */
const LIMIT = 5;
/** Roughly what three characters find, before the name narrows it. */
const FOUND_AT_THREE = 2840;

/**
 * The words of `name` a token of `query` begins, marked whole, as the tier
 * marks them; the space between two marked words is marked with them.
 */
export function highlightFor(name: string, query: string): HighlightPart[] {
  const tokens = queryTokens(query);
  const pieces = name
    .split(/([A-Za-z0-9]+)/)
    .filter(text => text !== "")
    .map(text => ({
      text,
      matched:
        /^[A-Za-z0-9]+$/.test(text) &&
        tokens.some(token => text.toLowerCase().startsWith(token)),
    }));
  const parts: HighlightPart[] = [];
  pieces.forEach((piece, i) => {
    const bridges =
      !piece.matched &&
      /^\s+$/.test(piece.text) &&
      parts.at(-1)?.matched === true &&
      pieces[i + 1]?.matched === true;
    const matched = piece.matched || bridges;
    const last = parts.at(-1);
    if (last !== undefined && last.matched === matched) {
      last.text += piece.text;
    } else {
      parts.push({ text: piece.text, matched });
    }
  });
  return parts;
}

/** Whether a word of the row's name, or the name that matched, begins with `token`. */
function begins(row: BusinessSuggestion, token: string): boolean {
  return queryTokens(row.matched_name ?? row.label).some(word =>
    word.startsWith(token),
  );
}

/**
 * The tier's answer to `typed`, a stem of the company's query: nothing under
 * three characters; else the rows every word but the one still being typed
 * begins, those it begins too first, and a count that narrows as the name
 * grows, down to the whole query's.
 */
export function answerFor(
  company: ReelCompany,
  typed: string,
): { rows: BusinessSuggestion[]; found: number } {
  if (typed.trim().length < MIN_QUERY_CHARS) return { rows: [], found: 0 };
  const tokens = queryTokens(typed);
  const typing = tokens.at(-1) ?? "";
  const settled = tokens.slice(0, -1);
  const candidates = company.rows.filter(row =>
    (settled.length > 0 ? settled : [typing]).every(token =>
      begins(row, token),
    ),
  );
  const hits = [
    ...candidates.filter(row => begins(row, typing)),
    ...candidates.filter(row => !begins(row, typing)),
  ];
  const rows = hits.slice(0, LIMIT).map(row => ({
    ...row,
    highlight: highlightFor(row.matched_name ?? row.label, typed),
  }));
  const progress = Math.min(
    1,
    (typed.length - MIN_QUERY_CHARS) /
      Math.max(1, company.query.length - MIN_QUERY_CHARS),
  );
  const found = Math.round(
    company.found * (FOUND_AT_THREE / company.found) ** (1 - progress),
  );
  return { rows, found: Math.max(found, rows.length) };
}
