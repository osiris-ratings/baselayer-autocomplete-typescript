import { describe, expect, it } from "vitest";

import {
  ContractViolation,
  orderedStates,
  parseSuggestResponse,
} from "@baselayer-sdk/autocomplete";

// A business under a person or an address carries what a business row leads
// with: its lead address, its states and its domicile. A person or an address
// under a row carries none of them.
const harbor = {
  type: "business",
  token: "tok-harbor",
  label: "HARBOR LANE HOLDINGS LLC",
  role: "officer",
  matched: false,
  address: "1200 River Rd, Wilmington, DE 19801",
  states: ["DE", "FL", "TX"],
  domicile_state: "TX",
};

const oakLane = {
  type: "address",
  token: "tok-oak",
  label: "12 Oak Ln, Dover, DE 19901",
  role: null,
  matched: false,
  address: null,
  states: null,
  domicile_state: null,
};

function personRow(businesses: object[], addresses: object[] = []) {
  return {
    query: "jane doe",
    found: 1,
    found_capped: false,
    truncated: false,
    sources: {
      businesses: { status: "ok" },
      addresses: { status: addresses.length > 0 ? "ok" : "not_requested" },
    },
    suggestions: [
      {
        type: "person",
        token: "tok-jane",
        label: "Jane Q Doe",
        matched_name: null,
        match: "exact",
        highlight: [{ text: "Jane Q Doe", matched: true }],
        related: {
          businesses: {
            count: businesses.length,
            matched: null,
            truncated: false,
            items: businesses,
          },
          addresses: {
            count: addresses.length,
            matched: null,
            truncated: false,
            items: addresses,
          },
        },
      },
    ],
  };
}

describe("a related business's address, states and domicile", () => {
  it("reads what a business under a person carries", () => {
    const [row] = parseSuggestResponse(
      "people",
      personRow([harbor]),
    ).suggestions;

    expect(row!.related.businesses.items[0]).toEqual(harbor);
  });

  it("reads them as null on a person's address, which carries none", () => {
    const [row] = parseSuggestResponse(
      "people",
      personRow([harbor], [oakLane]),
    ).suggestions;

    expect(row!.related.addresses.items[0]).toMatchObject({
      address: null,
      states: null,
      domicile_state: null,
    });
  });

  it("reads them as null when the autocomplete service sends none, as one that predates them does", () => {
    const older: Partial<typeof harbor> = { ...harbor };
    delete older.address;
    delete older.states;
    delete older.domicile_state;

    const [row] = parseSuggestResponse(
      "people",
      personRow([older]),
    ).suggestions;

    expect(row!.related.businesses.items[0]).toMatchObject({
      address: null,
      states: null,
      domicile_state: null,
    });
  });

  it("refuses states that are not a list of strings, and an address that is not a string", () => {
    for (const bad of [
      { states: "DE" },
      { states: ["DE", 4] },
      { address: 1200 },
      { domicile_state: ["DE"] },
    ]) {
      expect(() =>
        parseSuggestResponse("people", personRow([{ ...harbor, ...bad }])),
      ).toThrow(ContractViolation);
    }
  });
});

describe("orderedStates on a related business", () => {
  it("puts the domicile first, though the wire sorts by code", () => {
    expect(orderedStates(harbor)).toEqual(["TX", "DE", "FL"]);
  });

  it("puts a matched state before the rest", () => {
    expect(orderedStates(harbor, ["FL"])).toEqual(["TX", "FL", "DE"]);
  });

  it("draws no states for an item that carries none", () => {
    expect(orderedStates(oakLane)).toEqual([]);
    expect(orderedStates({ ...harbor, domicile_state: null })).toEqual([
      "DE",
      "FL",
      "TX",
    ]);
  });
});
