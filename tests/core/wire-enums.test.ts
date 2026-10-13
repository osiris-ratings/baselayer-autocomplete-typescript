import { describe, expect, it } from "vitest";

import {
  BUSINESS_STRUCTURES,
  ContractViolation,
  ENTITY_TYPES,
  ADDRESS_LISTINGS,
  PERSON_ROLES,
  MATCH_GRADES,
  ROUTE_UNSERVED_REASONS,
  SOURCE_STATUSES,
  parseBusinessesResponse,
  parseSuggestResponse,
} from "@baselayer-sdk/autocomplete";

import { schemaNamed } from "./fixtures/contract";

// The contract's enums are open: a value this build does not list is kept as
// the service sent it, since the service may learn one before this build does.
// Each list is pinned to the enum the contract declares, so a build that lists
// fewer than the service knows is a test failure, not a surprise in a host. What
// stays closed is each `type`, which names the one entity a row or an item is.
const enumOf = (...names: string[]): unknown[] =>
  names.flatMap(name => (schemaNamed(name) as { enum: unknown[] }).enum);

const business = {
  type: "business",
  token: "tok-cinder-rigging",
  label: "CINDER RIGGING, INC.",
  matched_name: null,
  match: "strong",
  domicile_state: "DE",
  states: ["DE"],
  structure: "C_CORPORATION",
  related: {
    people: {
      count: 1,
      matched: null,
      truncated: false,
      items: [
        {
          type: "person",
          label: "Wesley Crane",
          role: "officer",
          matched: false,
          highlight: null,
        },
      ],
    },
    addresses: {
      count: 1,
      matched: null,
      truncated: false,
      items: [
        {
          type: "address",
          label: "1200 Tidecaster Rd, Oakland, CA 94606",
          listed_as: "principal",
          matched: false,
          highlight: null,
        },
      ],
    },
  },
  highlight: [{ text: "CINDER", matched: true }],
};

const businesses = (row: unknown, status = "ok") => ({
  query: "cind",
  found: 1,
  found_capped: false,
  truncated: false,
  sources: { people: { status }, addresses: { status: "ok" } },
  suggestions: [row],
});

const withPersonRole = (role: unknown) => ({
  ...business,
  related: {
    ...business.related,
    people: {
      ...business.related.people,
      items: [{ ...business.related.people.items[0], role }],
    },
  },
});

const withAddressRole = (listed_as: unknown) => ({
  ...business,
  related: {
    ...business.related,
    addresses: {
      ...business.related.addresses,
      items: [{ ...business.related.addresses.items[0], listed_as }],
    },
  },
});

/** A person row whose one business is held as `role`. */
const person = (role: unknown) => ({
  type: "person",
  token: "tok-person",
  label: "Dana Whitfield",
  match: "exact",
  states: ["PA"],
  highlight: [{ text: "Dana Whitfield", matched: true }],
  related: {
    businesses: {
      count: 1,
      matched: null,
      truncated: false,
      items: [
        {
          type: "business",
          token: "tok-harbor",
          label: "Harbor Concrete Pumping Co., Inc.",
          role,
          matched: false,
          matched_name: null,
          highlight: null,
          address: null,
          states: ["PA"],
          domicile_state: "PA",
        },
      ],
    },
    addresses: { count: null, matched: null, truncated: false, items: [] },
  },
});

/** An address row whose one business filed it as `listed_as`. */
const address = (listed_as: unknown) => ({
  type: "address",
  token: "tok-address",
  label: "Pier 9, Erie, PA 16507",
  match: "strong",
  highlight: [{ text: "Pier", matched: true }],
  components: {
    line1: "Pier 9",
    line2: null,
    city: "Erie",
    state: "PA",
    postal_code: "16507",
  },
  related: {
    businesses: {
      count: 1,
      matched: null,
      truncated: false,
      items: [
        {
          type: "business",
          token: "tok-harbor",
          label: "Harbor Concrete Pumping Co., Inc.",
          listed_as,
          matched: false,
          matched_name: null,
          highlight: null,
          address: "Pier 9, Erie, PA 16507",
          states: ["PA"],
          domicile_state: "PA",
        },
      ],
    },
    people: { count: null, matched: null, truncated: false, items: [] },
  },
});

const peopleAnswer = (row: unknown) => ({
  query: "dana",
  found: 1,
  found_capped: false,
  truncated: false,
  sources: {
    businesses: { status: "ok" },
    addresses: { status: "not_requested" },
  },
  suggestions: [row],
});

const addressesAnswer = (row: unknown) => ({
  query: "pier 9",
  found: 1,
  found_capped: false,
  truncated: false,
  sources: {
    businesses: { status: "ok" },
    people: { status: "not_requested" },
  },
  suggestions: [row],
});

describe("the values the contract lists", () => {
  it.each([
    ["MatchGrade", MATCH_GRADES, enumOf("MatchGrade")],
    [
      "EntityType",
      ENTITY_TYPES,
      enumOf("BusinessKind", "PersonKind", "AddressKind"),
    ],
    ["SourceStatus", SOURCE_STATUSES, enumOf("SourceStatus")],
    ["PersonRole", PERSON_ROLES, enumOf("PersonRole")],
    ["AddressListing", ADDRESS_LISTINGS, enumOf("AddressListing")],
    ["BusinessStructure", BUSINESS_STRUCTURES, enumOf("BusinessStructure")],
    [
      "RouteUnservedReason",
      ROUTE_UNSERVED_REASONS,
      enumOf("RouteUnservedReason"),
    ],
  ] as const)(
    "knows exactly the %s values the contract lists, in its order",
    (_, values, listed) => {
      expect(values).toEqual(listed);
    },
  );

  it("reads every value it knows", () => {
    for (const match of MATCH_GRADES) {
      expect(
        parseBusinessesResponse(businesses({ ...business, match }))
          .suggestions[0]?.match,
      ).toBe(match);
    }
    for (const status of SOURCE_STATUSES) {
      expect(
        parseBusinessesResponse(businesses(business, status)).sources.people
          .status,
      ).toBe(status);
    }
    for (const role of PERSON_ROLES) {
      expect(
        parseBusinessesResponse(businesses(withPersonRole(role))).suggestions[0]
          ?.related.people.items[0]?.role,
      ).toBe(role);
    }
    for (const listed_as of ADDRESS_LISTINGS) {
      expect(
        parseBusinessesResponse(businesses(withAddressRole(listed_as)))
          .suggestions[0]?.related.addresses.items[0]?.listed_as,
      ).toBe(listed_as);
    }
  });
});

describe("a value the contract does not list yet", () => {
  // The enums say they are open: a client treats a value it does not know as
  // "other". Refusing the answer instead would take a typeahead down because
  // the service learned a grade, a status or a role first.
  it("keeps a match grade as sent, on every route", () => {
    expect(
      parseBusinessesResponse(businesses({ ...business, match: "phonetic" }))
        .suggestions[0]?.match,
    ).toBe("phonetic");
    expect(
      parseSuggestResponse(
        "people",
        peopleAnswer({ ...person("officer"), match: "fuzzy" }),
      ).suggestions[0]?.match,
    ).toBe("fuzzy");
    expect(
      parseSuggestResponse(
        "addresses",
        addressesAnswer({ ...address("principal"), match: "nearby" }),
      ).suggestions[0]?.match,
    ).toBe("nearby");
  });

  it("keeps a source status as sent", () => {
    const parsed = parseBusinessesResponse(businesses(business, "degraded"));

    expect(parsed.sources.people.status).toBe("degraded");
    expect(parsed.sources.addresses.status).toBe("ok");
  });

  it("keeps the role a person holds on a business as sent, on a business row and on a person row", () => {
    expect(
      parseBusinessesResponse(businesses(withPersonRole("director")))
        .suggestions[0]?.related.people.items[0]?.role,
    ).toBe("director");
    expect(
      parseSuggestResponse("people", peopleAnswer(person("director")))
        .suggestions[0]?.related.businesses.items[0]?.role,
    ).toBe("director");
  });

  it("keeps how a business filed an address as sent, on a business row and on an address row", () => {
    expect(
      parseBusinessesResponse(businesses(withAddressRole("head_office")))
        .suggestions[0]?.related.addresses.items[0]?.listed_as,
    ).toBe("head_office");
    expect(
      parseSuggestResponse("addresses", addressesAnswer(address("head_office")))
        .suggestions[0]?.related.businesses.items[0]?.listed_as,
    ).toBe("head_office");
  });

  it("keeps a structure as sent, and still reads a null one as null", () => {
    expect(
      parseBusinessesResponse(
        businesses({ ...business, structure: "FOUNDATION" }),
      ).suggestions[0]?.structure,
    ).toBe("FOUNDATION");
    expect(
      parseBusinessesResponse(businesses({ ...business, structure: null }))
        .suggestions[0]?.structure,
    ).toBeNull();
  });

  it("still refuses one that is not a string, naming where", () => {
    expect(() =>
      parseBusinessesResponse(businesses({ ...business, match: 3 })),
    ).toThrow("response.suggestions[0].match: expected a string");
    expect(() =>
      parseBusinessesResponse(businesses(business, true as unknown as string)),
    ).toThrow("response.sources.people.status: expected a string");
    expect(() =>
      parseBusinessesResponse(businesses(withPersonRole(1))),
    ).toThrow(
      "response.suggestions[0].related.people.items[0].role: expected a string",
    );
    expect(() =>
      parseBusinessesResponse(businesses(withAddressRole(["principal"]))),
    ).toThrow(
      "response.suggestions[0].related.addresses.items[0].listed_as: expected a string",
    );
  });

  it("reads an absent role as null, and a null one the same", () => {
    const absent = withPersonRole(undefined);
    delete (absent.related.people.items[0] as { role?: unknown }).role;

    for (const row of [absent, withPersonRole(null)]) {
      expect(
        parseBusinessesResponse(businesses(row)).suggestions[0]?.related.people
          .items[0]?.role,
      ).toBeNull();
    }
  });
});

describe("the `type` that stays closed", () => {
  it("refuses a related item that is not the entity its relation holds", () => {
    // A person row's businesses are what a pick spends: an item there that is
    // not a business must never be offered as one.
    const swapped = {
      ...business,
      related: {
        ...business.related,
        people: {
          ...business.related.people,
          items: [{ ...business.related.people.items[0], type: "address" }],
        },
      },
    };
    expect(() => parseBusinessesResponse(businesses(swapped))).toThrow(
      'response.suggestions[0].related.people.items[0].type: expected "person"',
    );
  });

  it("refuses a person row whose businesses hold another entity", () => {
    const swapped = person("officer");
    swapped.related.businesses.items[0]!.type = "person";

    expect(() => parseSuggestResponse("people", peopleAnswer(swapped))).toThrow(
      'response.suggestions[0].related.businesses.items[0].type: expected "business"',
    );
  });

  it("refuses an address row whose people hold another entity", () => {
    const swapped = {
      ...address("principal"),
      related: {
        ...address("principal").related,
        people: {
          count: 1,
          matched: null,
          truncated: false,
          items: [
            {
              type: "business",
              label: "Wesley Crane",
              matched: false,
              highlight: null,
            },
          ],
        },
      },
    };

    expect(() =>
      parseSuggestResponse("addresses", addressesAnswer(swapped)),
    ).toThrow(
      'response.suggestions[0].related.people.items[0].type: expected "person"',
    );
  });

  it("refuses a row that is not the entity its route answers", () => {
    expect(() =>
      parseSuggestResponse("people", peopleAnswer(address("principal"))),
    ).toThrow(ContractViolation);
    expect(() =>
      parseBusinessesResponse(businesses({ ...business, type: "company" })),
    ).toThrow('response.suggestions[0].type: expected "business"');
  });
});

describe("an address's components", () => {
  it("are null where the filing did not carry them, and each key is there", () => {
    const bare = {
      ...address("principal"),
      token: "tok-bare",
      components: {
        line1: null,
        line2: null,
        city: null,
        state: "PA",
        postal_code: null,
      },
    };

    const parsed = parseSuggestResponse("addresses", addressesAnswer(bare));

    expect(parsed.suggestions[0]!.components).toEqual({
      line1: null,
      line2: null,
      city: null,
      state: "PA",
      postal_code: null,
    });
    expect(() =>
      parseSuggestResponse(
        "addresses",
        addressesAnswer({
          ...bare,
          components: { line1: null, line2: null, state: "PA" },
        }),
      ),
    ).toThrow("response.suggestions[0].components.city");
  });
});
