import { describe, expect, it } from "vitest";

import {
  addressLineOf,
  matchedOn,
  orderedStates,
  peopleLineOf,
  type BusinessSuggestion,
  type RelatedItem,
  type RelatedSet,
} from "@baselayer-sdk/autocomplete";

function person(
  label: string,
  role: "officer" | "agent",
  matched = false,
): RelatedItem {
  return { type: "person", token: null, label, role, matched };
}

function address(
  label: string,
  role: string | null,
  matched = false,
): RelatedItem {
  return { type: "address", token: null, label, role, matched };
}

function set(
  items: RelatedItem[],
  more: Partial<Pick<RelatedSet, "count" | "matched">> = {},
): RelatedSet {
  return {
    count: items.length,
    matched: null,
    truncated: false,
    items,
    ...more,
  };
}

const OFFICERS = [
  "Thomas Harlow",
  "Ada Brandt",
  "Omar Quill",
  "Priya Sandoval",
  "Jun Okafor",
  "Marta Lindqvist",
  "Dev Rao",
];

/**
 * A family as the autocomplete service answers a name-only query: seven
 * officers and two addresses, none of them flagged.
 */
const harbor: BusinessSuggestion = {
  type: "business",
  token: "tok-harbor",
  label: "HARBOR CONCRETE PUMPS, LLC",
  matched_name: null,
  match: "strong",
  domicile_state: "DE",
  states: ["CA", "DE", "NY"],
  structure: "LLC",
  related: {
    people: set(
      OFFICERS.map(name => person(name, "officer")),
      { count: 7 },
    ),
    addresses: set([
      address("12 Wharf Rd, Wilmington, DE 19801", "principal"),
      address("900 Pier Ave, Oakland, CA 94607", "mailing"),
    ]),
    liens: { count: null, matched: null, truncated: false, items: [] },
  },
  highlight: [
    { text: "HARBOR", matched: true },
    { text: " CONCRETE PUMPS, LLC", matched: false },
  ],
};

function withRelated(
  related: Partial<BusinessSuggestion["related"]>,
  overrides: Partial<BusinessSuggestion> = {},
): BusinessSuggestion {
  return {
    ...harbor,
    ...overrides,
    related: { ...harbor.related, ...related },
  };
}

describe("matchedOn", () => {
  it("says nothing for a name-only query: the name emphasis says it", () => {
    expect(matchedOn(harbor, {})).toEqual([]);
    expect(matchedOn(harbor)).toEqual([]);
  });

  it("names the officer a person filter matched, of the officers it matched", () => {
    // `person.name=tim`: the head holds just the matched officer, of seven.
    const row = withRelated({
      people: set([person("Thomas Harlow", "officer", true)], {
        count: 7,
        matched: 1,
      }),
    });
    expect(matchedOn(row, {})).toEqual([
      { kind: "officer", names: ["Thomas Harlow"], of: 1 },
    ]);
  });

  it("counts every officer that matched, not only the ones in the head", () => {
    const row = withRelated({
      people: set(
        [
          person("Thomas Harlow", "officer", true),
          person("Tobias Marsh", "officer", true),
          person("Ada Brandt", "officer"),
        ],
        { count: 9, matched: 4 },
      ),
    });
    expect(matchedOn(row, {})).toEqual([
      { kind: "officer", names: ["Thomas Harlow", "Tobias Marsh"], of: 4 },
    ]);
  });

  it("keeps the matched count null when the service did not give one", () => {
    const row = withRelated({
      people: set([person("Thomas Harlow", "officer", true)], {
        matched: null,
      }),
    });
    expect(matchedOn(row, {})).toEqual([
      { kind: "officer", names: ["Thomas Harlow"], of: null },
    ]);
  });

  it("calls a matched registered agent an agent, not an officer", () => {
    const row = withRelated({
      people: set([person("Tidewater Agents, Inc.", "agent", true)], {
        count: 8,
        matched: 1,
      }),
    });
    expect(matchedOn(row, {})).toEqual([
      { kind: "agent", names: ["Tidewater Agents, Inc."], of: 1 },
    ]);
  });

  it("lists officers before agents and leaves the total unsaid when both matched", () => {
    const row = withRelated({
      people: set(
        [
          person("Tobias Marsh", "agent", true),
          person("Thomas Harlow", "officer", true),
        ],
        { matched: 2 },
      ),
    });
    expect(matchedOn(row, {})).toEqual([
      { kind: "officer", names: ["Thomas Harlow"], of: null },
      { kind: "agent", names: ["Tobias Marsh"], of: null },
    ]);
  });

  it("leads with the matched addresses and says whose each is", () => {
    // `address.text=900 Pier`: the matches lead the head, ahead of the filings.
    const row = withRelated({
      addresses: set(
        [
          address("900 Pier Ave, Oakland, CA 94607", "officer", true),
          address("900 Pier Ave Ste 4, Oakland, CA 94607", "officer", true),
          address("12 Wharf Rd, Wilmington, DE 19801", "principal"),
        ],
        { count: 5, matched: 2 },
      ),
      people: set([person("Ada Brandt", "officer", true)], {
        count: 7,
        matched: 1,
      }),
    });
    expect(matchedOn(row, {})).toEqual([
      { kind: "officer", names: ["Ada Brandt"], of: 1 },
      {
        kind: "address",
        label: "900 Pier Ave, Oakland, CA 94607",
        role: "officer",
      },
      {
        kind: "address",
        label: "900 Pier Ave Ste 4, Oakland, CA 94607",
        role: "officer",
      },
    ]);
  });

  it.each([
    ["officer", "officer"],
    ["agent", "agent"],
    ["principal", "principal"],
    // The family's own mailing address is its own filing too.
    ["mailing", "principal"],
    ["registered_office", null],
    [null, null],
  ] as const)("reads an address role of %s as %s", (wire, owner) => {
    const row = withRelated({
      addresses: set([address("12 Wharf Rd", wire, true)], { matched: 1 }),
    });
    expect(matchedOn(row, {})).toEqual([
      { kind: "address", label: "12 Wharf Rd", role: owner },
    ]);
  });

  it("names the states a state filter asked for that the family has", () => {
    // The wire flags nothing for a state: the row's states include it.
    expect(matchedOn(harbor, { state: ["NY"] })).toEqual([
      { kind: "state", states: ["NY"] },
    ]);
  });

  it("keeps the matched states in the order the row draws them", () => {
    expect(matchedOn(harbor, { state: ["NY", "CA", "DE"] })).toEqual([
      { kind: "state", states: ["DE", "CA", "NY"] },
    ]);
  });

  it("reads a state filter in any case and with stray spaces", () => {
    expect(matchedOn(harbor, { state: [" ny", "tx"] })).toEqual([
      { kind: "state", states: ["NY"] },
    ]);
  });

  it("says nothing of a state the family is not in", () => {
    expect(matchedOn(harbor, { state: ["TX"] })).toEqual([]);
    expect(matchedOn(harbor, { state: [] })).toEqual([]);
  });

  it("counts the domicile as one of the family's states", () => {
    const row = { ...harbor, domicile_state: "TX" };
    expect(matchedOn(row, { state: ["TX"] })).toEqual([
      { kind: "state", states: ["TX"] },
    ]);
  });

  it("names the DBA a typed alias reached the row by", () => {
    // `q=baselayer`: `matched_name` is set and the match is partial.
    const row = {
      ...harbor,
      matched_name: "BASELAYER",
      match: "partial",
      highlight: [],
    };
    expect(matchedOn(row, {})).toEqual([{ kind: "alias", name: "BASELAYER" }]);
  });

  it("answers everything at once, alias first and states last", () => {
    const row = withRelated(
      {
        people: set([person("Thomas Harlow", "officer", true)], {
          count: 7,
          matched: 1,
        }),
        addresses: set(
          [address("900 Pier Ave, Oakland, CA", "officer", true)],
          { matched: 1 },
        ),
      },
      { matched_name: "BASELAYER" },
    );
    expect(matchedOn(row, { state: ["CA"] }).map(({ kind }) => kind)).toEqual([
      "alias",
      "officer",
      "address",
      "state",
    ]);
  });

  it("reads nothing off relations that were not requested", () => {
    const empty = { count: null, matched: null, truncated: false, items: [] };
    const row = withRelated({ people: empty, addresses: empty });
    expect(matchedOn(row, {})).toEqual([]);
  });
});

describe("the readers the matches reorder", () => {
  it("leads the people line with the officer a filter matched", () => {
    const row = withRelated({
      people: set(
        [
          person("Ada Brandt", "officer"),
          person("Thomas Harlow", "officer", true),
          person("Omar Quill", "officer"),
        ],
        { count: 7, matched: 1 },
      ),
    });
    expect(peopleLineOf(row)).toEqual({
      names: ["Thomas Harlow", "Ada Brandt", "Omar Quill"],
      role: "officer",
      more: 6,
      matched: 1,
    });
  });

  it("counts none matched when nothing was filtered", () => {
    expect(peopleLineOf(harbor)?.matched).toBe(0);
    expect(peopleLineOf(harbor)?.names[0]).toBe("Thomas Harlow");
  });

  it("reads the lead address with whether it matched and whose it is", () => {
    const row = withRelated({
      addresses: set(
        [
          address("900 Pier Ave, Oakland, CA", "officer", true),
          address("12 Wharf Rd, Wilmington, DE", "principal"),
        ],
        { matched: 1 },
      ),
    });
    expect(addressLineOf(row)).toEqual({
      label: "900 Pier Ave, Oakland, CA",
      matched: true,
      role: "officer",
    });
    expect(addressLineOf(harbor)).toEqual({
      label: "12 Wharf Rd, Wilmington, DE 19801",
      matched: false,
      role: "principal",
    });
  });

  it("has no address line without an address", () => {
    expect(addressLineOf(withRelated({ addresses: set([]) }))).toBeNull();
  });

  it("moves a matched state up behind the domicile, ahead of the rest", () => {
    const wide = {
      ...harbor,
      states: ["AL", "CA", "DE", "FL", "NY", "TX"],
    };
    expect(orderedStates(wide)).toEqual(["DE", "AL", "CA", "FL", "NY", "TX"]);
    expect(orderedStates(wide, ["NY"])).toEqual([
      "DE",
      "NY",
      "AL",
      "CA",
      "FL",
      "TX",
    ]);
    expect(orderedStates(wide, ["TX", "NY"])).toEqual([
      "DE",
      "NY",
      "TX",
      "AL",
      "CA",
      "FL",
    ]);
  });

  it("keeps the domicile first when it is the matched state", () => {
    expect(orderedStates(harbor, ["DE"])).toEqual(["DE", "CA", "NY"]);
  });
});
