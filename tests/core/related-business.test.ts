import { describe, expect, it } from "vitest";

import {
  ContractViolation,
  orderedStates,
  parseSuggestResponse,
} from "@baselayer-sdk/autocomplete";

import { schemaNamed } from "./fixtures/contract";

// A business under a person or an address carries what a business row leads
// with: its lead address, its states and its domicile. A person or an address
// under a row carries none of them, nor a token.
const business = {
  type: "business",
  token: "tok-harbor",
  label: "HARBOR LANE HOLDINGS LLC",
  matched: false,
  matched_name: null,
  highlight: null,
  address: "1200 Tallowmere Rd, Wilmington, DE 19801",
  states: ["DE", "FL", "TX"],
  domicile_state: "TX",
};

// Under a person it is held, and under an address it is filed there.
const harbor = { ...business, role: "officer" };

const harborFiled = { ...business, listed_as: "principal" };

const oakLane = {
  type: "address",
  label: "12 Fernhallow Ln, Dover, DE 19901",
  matched: false,
  highlight: null,
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
        match: "exact",
        states: ["DE", "FL", "TX"],
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

function addressRow(businesses: object[], people: object[] = []) {
  return {
    query: "45 corvel",
    found: 1,
    found_capped: false,
    truncated: false,
    sources: {
      businesses: { status: "ok" },
      people: { status: people.length > 0 ? "ok" : "not_requested" },
    },
    suggestions: [
      {
        type: "address",
        token: "tok-corvel",
        label: "45 Corvel Landing, Erie, PA 16507",
        match: "strong",
        highlight: [],
        components: {
          line1: "45 Corvel Landing",
          line2: null,
          city: "Erie",
          state: "PA",
          postal_code: "16507",
        },
        related: {
          businesses: {
            count: businesses.length,
            matched: 1,
            truncated: false,
            items: businesses,
          },
          people: {
            count: people.length,
            matched: null,
            truncated: false,
            items: people,
          },
        },
      },
    ],
  };
}

/** The contract's related business, as the vendored spec spells it. */
const relatedBusiness = schemaNamed("RelatedBusiness") as {
  required?: string[];
  properties: Record<string, { type?: string | string[] }>;
};

describe("a related business's address, states and domicile", () => {
  it("are what the contract puts on a related business: required, the address nullable", () => {
    expect(relatedBusiness.properties.address?.type).toEqual([
      "string",
      "null",
    ]);
    expect(relatedBusiness.properties.states?.type).toBe("array");
    expect(relatedBusiness.properties.domicile_state?.type).toBe("string");
    for (const key of ["address", "states", "domicile_state"]) {
      expect(relatedBusiness.required).toContain(key);
    }
  });

  it("reads what a business under a person carries", () => {
    const [row] = parseSuggestResponse(
      "people",
      personRow([harbor]),
    ).suggestions;

    expect(row!.related.businesses.items[0]).toEqual(harbor);
  });

  it("reads what a business under an address carries, filed there rather than held", () => {
    const [row] = parseSuggestResponse(
      "addresses",
      addressRow([harborFiled]),
    ).suggestions;

    expect(row!.related.businesses.items[0]).toEqual(harborFiled);
    expect(row!.related.businesses.items[0]).not.toHaveProperty("role");
  });

  it("reads a null address for a business whose family has none", () => {
    const [row] = parseSuggestResponse(
      "people",
      personRow([{ ...harbor, address: null }]),
    ).suggestions;

    expect(row!.related.businesses.items[0]?.address).toBeNull();
  });

  it("reads none on a person's address, which carries none", () => {
    const [row] = parseSuggestResponse(
      "people",
      personRow([harbor], [oakLane]),
    ).suggestions;

    const [item] = row!.related.addresses.items;
    expect(item).toEqual(oakLane);
    for (const key of ["address", "states", "domicile_state", "token"]) {
      expect(item).not.toHaveProperty(key);
    }
  });

  it.each(["address", "states", "domicile_state"])(
    "refuses a business that leaves out its %s, naming it",
    key => {
      // The contract lists all three as required: an absent one is not a null.
      const bare: Record<string, unknown> = { ...harbor };
      delete bare[key];

      expect(() => parseSuggestResponse("people", personRow([bare]))).toThrow(
        `response.suggestions[0].related.businesses.items[0].${key}`,
      );
    },
  );

  it("refuses states that are not a list of strings, and an address that is not a string", () => {
    for (const bad of [
      { states: "DE" },
      { states: ["DE", 4] },
      { states: null },
      { address: 1200 },
      { domicile_state: ["DE"] },
      { domicile_state: null },
    ]) {
      expect(() =>
        parseSuggestResponse("people", personRow([{ ...harbor, ...bad }])),
      ).toThrow(ContractViolation);
    }
  });
});

// A business under a person or an address that a business name filter
// reached through the other name it goes by (a DBA, or a former name) says
// which, as a business row's own `matched_name` does. The service spells it
// null when the label fit as well.
describe("a related business's matched name", () => {
  const matchedHarbor = {
    ...harbor,
    matched: true,
    matched_name: "SALTMARSH PROVISIONS",
  };

  it("reads the name a business under a person matched on", () => {
    const [row] = parseSuggestResponse(
      "people",
      personRow([matchedHarbor]),
    ).suggestions;

    expect(row!.related.businesses.items[0]).toEqual(matchedHarbor);
  });

  it("reads the name a business under an address matched on", () => {
    const [row] = parseSuggestResponse(
      "addresses",
      addressRow([{ ...harborFiled, matched_name: "SALTMARSH PROVISIONS" }]),
    ).suggestions;

    expect(row!.related.businesses.items[0]?.matched_name).toBe(
      "SALTMARSH PROVISIONS",
    );
  });

  it("reads null when the label fit, as the service spells it", () => {
    const labelFit = { ...harbor, matched: true, matched_name: null };
    const [person] = parseSuggestResponse(
      "people",
      personRow([labelFit], [oakLane]),
    ).suggestions;
    const [address] = parseSuggestResponse(
      "addresses",
      addressRow([{ ...harborFiled, matched: true }]),
    ).suggestions;

    expect(person!.related.businesses.items[0]?.matched_name).toBeNull();
    expect(address!.related.businesses.items[0]?.matched_name).toBeNull();
  });

  it("is on a business alone: a person or an address listed carries none", () => {
    const [person] = parseSuggestResponse(
      "people",
      personRow([harbor], [{ ...oakLane, matched_name: "SALTMARSH" }]),
    ).suggestions;

    expect(person!.related.addresses.items[0]).not.toHaveProperty(
      "matched_name",
    );
  });

  it("is required: a business that leaves it out is refused, naming it", () => {
    // It was optional while the service predated the key. A null is the
    // answer for a label that fit as well, and an absent key is not one.
    const bare: Record<string, unknown> = { ...harbor, matched: true };
    delete bare.matched_name;

    expect(() => parseSuggestResponse("people", personRow([bare]))).toThrow(
      "response.suggestions[0].related.businesses.items[0].matched_name",
    );
  });

  it("refuses one that is not a string", () => {
    for (const bad of [7, ["SALTMARSH PROVISIONS"], { name: "SALTMARSH" }]) {
      expect(() =>
        parseSuggestResponse(
          "people",
          personRow([{ ...matchedHarbor, matched_name: bad }]),
        ),
      ).toThrow(ContractViolation);
    }
  });
});

// A related item a filter matched carries the parts of the name it matched
// on, as a row's own `highlight` does: its `matched_name` when it has one,
// else its label. An item no filter matched carries null.
describe("a related item's highlight", () => {
  const saltmarsh = [
    { text: "SALTMARSH", matched: true },
    { text: " PROVISIONS", matched: false },
  ];
  const crane = [
    { text: "Wesley", matched: false },
    { text: " ", matched: false },
    { text: "Crane", matched: true },
  ];
  const wesley = {
    type: "person",
    label: "Wesley Crane",
    matched: true,
    highlight: crane,
  };

  it("reads the parts of the name a business and a person under an address matched on", () => {
    const [row] = parseSuggestResponse(
      "addresses",
      addressRow(
        [
          {
            ...harborFiled,
            matched: true,
            matched_name: "SALTMARSH PROVISIONS",
            highlight: saltmarsh,
          },
        ],
        [wesley],
      ),
    ).suggestions;

    expect(row!.related.businesses.items[0]?.highlight).toEqual(saltmarsh);
    expect(row!.related.people.items[0]?.highlight).toEqual(crane);
  });

  it("reads the parts a business under a person carries", () => {
    const [row] = parseSuggestResponse(
      "people",
      personRow([{ ...harbor, matched: true, highlight: saltmarsh }]),
    ).suggestions;

    expect(row!.related.businesses.items[0]?.highlight).toEqual(saltmarsh);
  });

  it("reads null for an item no filter matched", () => {
    const [row] = parseSuggestResponse(
      "addresses",
      addressRow(
        [{ ...harborFiled, highlight: null }],
        [{ ...wesley, matched: false, highlight: null }],
      ),
    ).suggestions;

    expect(row!.related.businesses.items[0]?.highlight).toBeNull();
    expect(row!.related.people.items[0]?.highlight).toBeNull();
  });

  it("is required on a business: one that leaves it out is refused, naming it", () => {
    const bare: Record<string, unknown> = { ...harbor };
    delete bare.highlight;

    expect(() => parseSuggestResponse("people", personRow([bare]))).toThrow(
      "response.suggestions[0].related.businesses.items[0].highlight",
    );
  });

  it("is required on a person and an address too", () => {
    const bare: Record<string, unknown> = { ...wesley };
    delete bare.highlight;
    const lane: Record<string, unknown> = { ...oakLane };
    delete lane.highlight;

    expect(() =>
      parseSuggestResponse("addresses", addressRow([], [bare])),
    ).toThrow("response.suggestions[0].related.people.items[0].highlight");
    expect(() => parseSuggestResponse("people", personRow([], [lane]))).toThrow(
      "response.suggestions[0].related.addresses.items[0].highlight",
    );
  });

  it("refuses parts that are not a list of text and a flag", () => {
    for (const bad of [
      "SALTMARSH",
      [{ text: "SALTMARSH" }],
      [{ text: 7, matched: true }],
      { text: "SALTMARSH", matched: true },
    ]) {
      expect(() =>
        parseSuggestResponse(
          "people",
          personRow([{ ...harbor, matched: true, highlight: bad }]),
        ),
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
    // The contract has every business carry its states; a host's own data,
    // which the type still takes, may not.
    expect(orderedStates({ states: null, domicile_state: null })).toEqual([]);
    expect(orderedStates({ ...harbor, domicile_state: null })).toEqual([
      "DE",
      "FL",
      "TX",
    ]);
  });
});
