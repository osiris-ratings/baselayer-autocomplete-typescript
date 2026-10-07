import { describe, expect, it } from "vitest";

import {
  DEFAULT_ENABLED_LINES,
  type BusinessSuggestion,
  groupedLines,
  groupedOptions,
  type AddressSuggestion,
  type PersonSuggestion,
  type RelatedItem,
  type RelatedSet,
} from "@baselayer-sdk/autocomplete";

// Made-up people, addresses and businesses.
function item(
  type: RelatedItem["type"],
  label: string,
  token: string | null,
  role: RelatedItem["role"] = "officer",
): RelatedItem {
  return {
    type,
    token,
    label,
    role,
    matched: false,
    address: null,
    states: null,
    domicile_state: null,
  };
}

function set(items: RelatedItem[], count: number | null): RelatedSet {
  return { count, matched: null, truncated: false, items };
}

const jane: PersonSuggestion = {
  type: "person",
  token: "tok-jane",
  label: "Jane Q Doe",
  matched_name: null,
  match: "exact",
  highlight: [],
  related: {
    businesses: set(
      [
        item("business", "ACME HOLDINGS LLC", "tok-acme"),
        item("business", "UNSEALED PARTNERS LP", null, "agent"),
      ],
      7,
    ),
    addresses: set(
      [
        item("address", "12 Fernhallow Ln, Dover, DE 19901", "tok-oak"),
        item("address", "9 Ashcombe Ct, Dover, DE 19904", null),
      ],
      3,
    ),
  },
};

const pier: AddressSuggestion = {
  type: "address",
  token: "tok-pier",
  label: "1200 Tallowmere Rd, Wilmington, DE 19801",
  matched_name: null,
  match: "strong",
  highlight: [],
  components: {
    line1: "1200 Tallowmere Rd",
    line2: null,
    city: "Wilmington",
    state: "DE",
    postal_code: "19801",
  },
  related: {
    businesses: set([item("business", "ACME HOLDINGS LLC", "tok-acme")], 1),
    people: set([item("person", "Jane Q Doe", "tok-jane")], 1),
  },
};

describe("groupedLines", () => {
  it("lists only the relations asked for, each a line per item, in the order given", () => {
    const lines = groupedLines(jane, ["businesses", "addresses"]);

    expect(lines.lists.map(list => list.line)).toEqual(["business", "address"]);
    expect(lines.lists[1]!.lines.map(line => line.item.label)).toEqual([
      "12 Fernhallow Ln, Dover, DE 19901",
      "9 Ashcombe Ct, Dover, DE 19904",
    ]);
    expect(
      groupedLines(jane, ["businesses"]).lists.map(list => list.line),
    ).toEqual(["business"]);
  });

  it("says how many each list leaves out: its full count past the items shown", () => {
    const [businesses, addresses] = groupedLines(jane, [
      "businesses",
      "addresses",
    ]).lists;

    expect(businesses!.notShown).toBe(5);
    expect(addresses!.notShown).toBe(1);
  });

  it("offers only businesses by default, and only those with a token", () => {
    const lines = groupedLines(jane, ["businesses", "addresses"]);

    expect(DEFAULT_ENABLED_LINES).toEqual(["business"]);
    expect(lines.head.option).toBeNull();
    expect(lines.lists[0]!.lines.map(line => line.option?.kind)).toEqual([
      "business",
      undefined,
    ]);
    expect(lines.lists[1]!.lines.every(line => line.option === null)).toBe(
      true,
    );
  });

  it("offers the row itself and its listed addresses when they are enabled, as typed picks", () => {
    const lines = groupedLines(
      jane,
      ["businesses", "addresses"],
      ["person", "address"],
    );

    expect(lines.head.option).toEqual({
      kind: "entity",
      row: jane,
      pick: { type: "person", token: "tok-jane", label: "Jane Q Doe" },
    });
    // Businesses are not enabled here: their lines are disabled.
    expect(lines.lists[0]!.lines.every(line => line.option === null)).toBe(
      true,
    );
    // A listed address carries the row that lists it.
    expect(lines.lists[1]!.lines.map(line => line.option)).toEqual([
      {
        kind: "entity",
        row: jane,
        pick: {
          type: "address",
          token: "tok-oak",
          label: "12 Fernhallow Ln, Dover, DE 19901",
        },
      },
      null,
    ]);
  });

  it("offers an address row's people, and the address itself", () => {
    const lines = groupedLines(
      pier,
      ["businesses", "people"],
      ["business", "address", "person"],
    );

    expect(lines.head.option).toMatchObject({
      pick: { type: "address", token: "tok-pier" },
    });
    expect(lines.lists.map(list => list.line)).toEqual(["business", "person"]);
    expect(lines.lists[1]!.lines[0]!.option).toEqual({
      kind: "entity",
      row: pier,
      pick: { type: "person", token: "tok-jane", label: "Jane Q Doe" },
    });
  });

  it("hands a business option with the row it was reached through", () => {
    const option = groupedLines(pier, ["businesses"]).lists[0]!.lines[0]!
      .option;

    expect(option).toMatchObject({
      kind: "business",
      row: { token: "tok-pier" },
      business: { token: "tok-acme" },
    });
  });
});

describe("groupedLines on a business row", () => {
  const harbor: BusinessSuggestion = {
    type: "business",
    token: "tok-harbor",
    label: "HARBOR CONCRETE PUMPING CO., INC.",
    matched_name: null,
    match: "strong",
    domicile_state: "PA",
    states: ["PA"],
    structure: null,
    highlight: [],
    related: {
      people: set([item("person", "Jane Q Doe", "tok-jane")], 2),
      addresses: set(
        [item("address", "12 Fernhallow Ln, Dover, DE 19901", null)],
        1,
      ),
    },
  };

  it("offers the business itself as a business row's pick, and its officers when they are enabled", () => {
    const lines = groupedLines(
      harbor,
      ["people", "addresses"],
      ["business", "person"],
    );

    expect(lines.head.option).toEqual({ kind: "row", row: harbor });
    expect(lines.lists.map(list => list.line)).toEqual(["person", "address"]);
    expect(lines.lists[0]!.lines[0]!.option).toEqual({
      kind: "entity",
      row: harbor,
      pick: { type: "person", token: "tok-jane", label: "Jane Q Doe" },
    });
    expect(lines.lists[0]!.notShown).toBe(1);
    // No token, no pick: the address stays disabled.
    expect(lines.lists[1]!.lines[0]!.option).toBeNull();
  });

  it("offers no head where businesses are not enabled", () => {
    expect(groupedLines(harbor, ["people"], ["person"]).head.option).toBeNull();
  });
});

describe("groupedOptions", () => {
  it("lists every enabled line in the order drawn: the head, then each list", () => {
    const options = groupedOptions(
      groupedLines(
        jane,
        ["businesses", "addresses"],
        ["person", "business", "address"],
      ),
    );

    expect(
      options.map(option =>
        option.kind === "business"
          ? option.business.label
          : option.kind === "entity"
            ? `${option.pick.type}: ${option.pick.label}`
            : option.row.label,
      ),
    ).toEqual([
      "person: Jane Q Doe",
      "ACME HOLDINGS LLC",
      "address: 12 Fernhallow Ln, Dover, DE 19901",
    ]);
  });
});
