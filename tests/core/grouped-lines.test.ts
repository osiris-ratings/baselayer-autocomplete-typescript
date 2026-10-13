import { describe, expect, it } from "vitest";

import {
  DEFAULT_ENABLED_LINES,
  groupedLines,
  groupedOptions,
  type AddressOfBusiness,
  type AddressSuggestion,
  type BusinessOfAddress,
  type BusinessOfPerson,
  type BusinessSuggestion,
  type AddressListing,
  type PersonRole,
  type Open,
  type PersonOfBusiness,
  type PersonSuggestion,
  type RelatedAddress,
  type RelatedItem,
  type RelatedPerson,
  type RelatedSet,
} from "@baselayer-sdk/autocomplete";

// Made-up people, addresses and businesses.
const related = (label: string, token: string) => ({
  type: "business" as const,
  token,
  label,
  matched: false,
  matched_name: null,
  highlight: null,
  address: null,
  states: ["DE"],
  domicile_state: "DE",
});

const heldBy = (
  label: string,
  token: string,
  role: Open<PersonRole> | null,
): BusinessOfPerson => ({ ...related(label, token), role });

const filedAt = (
  label: string,
  token: string,
  listed_as: Open<AddressListing> | null,
): BusinessOfAddress => ({ ...related(label, token), listed_as });

/** A person listed under an address: no token, no role. */
const personAt = (label: string): RelatedPerson => ({
  type: "person",
  label,
  matched: false,
  highlight: null,
});

/** A person listed under a business: no token, and the role held there. */
const personOf = (label: string, role: Open<PersonRole>): PersonOfBusiness => ({
  ...personAt(label),
  role,
});

/** An address listed under a person: no token, no role. */
const addressOf = (label: string): RelatedAddress => ({
  type: "address",
  label,
  matched: false,
  highlight: null,
});

/** An address listed under a business: no token, and how it was filed. */
const addressFiled = (
  label: string,
  listed_as: Open<AddressListing>,
): AddressOfBusiness => ({ ...addressOf(label), listed_as });

function set<Item extends RelatedItem>(
  items: Item[],
  count: number | null,
): RelatedSet<Item> {
  return { count, matched: null, truncated: false, items };
}

const jane: PersonSuggestion = {
  type: "person",
  token: "tok-jane",
  label: "Jane Q Doe",
  match: "exact",
  states: ["DE"],
  highlight: [],
  related: {
    businesses: set(
      [
        heldBy("ACME HOLDINGS LLC", "tok-acme", "officer"),
        heldBy("COBALT TILE SUPPLY LLC", "tok-cobalt", "agent"),
      ],
      7,
    ),
    addresses: set(
      [
        addressOf("12 Fernhallow Ln, Dover, DE 19901"),
        addressOf("9 Ashcombe Ct, Dover, DE 19904"),
      ],
      3,
    ),
  },
};

const pier: AddressSuggestion = {
  type: "address",
  token: "tok-pier",
  label: "1200 Tallowmere Rd, Wilmington, DE 19801",
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
    businesses: set([filedAt("ACME HOLDINGS LLC", "tok-acme", "principal")], 1),
    people: set([personAt("Jane Q Doe")], 1),
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
    expect(
      groupedLines(jane, ["addresses", "businesses"]).lists.map(
        list => list.line,
      ),
    ).toEqual(["address", "business"]);
  });

  it("lists a relation named twice once", () => {
    expect(
      groupedLines(jane, ["addresses", "addresses", "businesses"]).lists.map(
        list => list.relation,
      ),
    ).toEqual(["addresses", "businesses"]);
  });

  it("says how many each list leaves out: its full count past the items shown", () => {
    const [businesses, addresses] = groupedLines(jane, [
      "businesses",
      "addresses",
    ]).lists;

    expect(businesses!.notShown).toBe(5);
    expect(addresses!.notShown).toBe(1);
  });

  it("offers only businesses by default", () => {
    const lines = groupedLines(jane, ["businesses", "addresses"]);

    expect(DEFAULT_ENABLED_LINES).toEqual(["business"]);
    expect(lines.head.option).toBeNull();
    expect(lines.lists[0]!.lines.map(line => line.option?.kind)).toEqual([
      "business",
      "business",
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
    // A listed address carries the row that lists it, and no token of its own:
    // the service seals none for an address listed under a person.
    expect(lines.lists[1]!.lines.map(line => line.option)).toEqual([
      {
        kind: "entity",
        row: jane,
        pick: {
          type: "address",
          token: null,
          label: "12 Fernhallow Ln, Dover, DE 19901",
        },
      },
      {
        kind: "entity",
        row: jane,
        pick: {
          type: "address",
          token: null,
          label: "9 Ashcombe Ct, Dover, DE 19904",
        },
      },
    ]);
  });

  it("enables a listed person or address by its entity alone, tokenless as it is", () => {
    // Every line of the kinds named is a pick, and none of the others: there is
    // no token to wait for, so no line is disabled for lacking one.
    const enabled = (lines: readonly ("business" | "person" | "address")[]) =>
      groupedLines(jane, ["businesses", "addresses"], lines).lists.map(list =>
        list.lines.map(line => line.option !== null),
      );

    expect(enabled(["address"])).toEqual([
      [false, false],
      [true, true],
    ]);
    expect(enabled(["business", "address"])).toEqual([
      [true, true],
      [true, true],
    ]);
    expect(enabled(["person"])).toEqual([
      [false, false],
      [false, false],
    ]);
    expect(enabled([])).toEqual([
      [false, false],
      [false, false],
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
    // A person listed under an address has no token either: the head's is
    // the address's own.
    expect(lines.lists[1]!.lines[0]!.option).toEqual({
      kind: "entity",
      row: pier,
      pick: { type: "person", token: null, label: "Jane Q Doe" },
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
      people: set([personOf("Jane Q Doe", "officer")], 2),
      addresses: set(
        [addressFiled("12 Fernhallow Ln, Dover, DE 19901", "principal")],
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
      pick: { type: "person", token: null, label: "Jane Q Doe" },
    });
    expect(lines.lists[0]!.notShown).toBe(1);
    // Only a business and a person are named: the address stays disabled.
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
      "COBALT TILE SUPPLY LLC",
      "address: 12 Fernhallow Ln, Dover, DE 19901",
      "address: 9 Ashcombe Ct, Dover, DE 19904",
    ]);
  });
});
