import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  BUSINESS_STRUCTURES,
  ContractViolation,
  ENTITY_TYPES,
  MATCH_GRADES,
  RELATED_ROLES,
  ROUTE_UNSERVED_REASONS,
  SOURCE_STATUSES,
  parseBusinessesResponse,
  parseSuggestResponse,
} from "@baselayer-sdk/autocomplete";

// Every closed value on the wire is a typed union here, pinned to the enum the
// autocomplete service's contract declares. A value the SDK does not know is
// refused: the SDK learns a value before the service sends it.
const schemas = (
  JSON.parse(
    readFileSync(
      join(__dirname, "../../contracts/autocomplete-openapi.json"),
      "utf8",
    ),
  ) as { components: { schemas: Record<string, { enum?: string[] }> } }
).components.schemas;

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
          token: null,
          label: "Wesley Crane",
          role: "officer",
          matched: false,
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
          token: "tok-address",
          label: "1200 Tidecaster Rd, Oakland, CA 94606",
          role: "principal",
          matched: false,
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

describe("the closed values on the wire", () => {
  it.each([
    ["MatchGrade", MATCH_GRADES],
    ["EntityType", ENTITY_TYPES],
    ["SourceStatus", SOURCE_STATUSES],
    ["RelatedRole", RELATED_ROLES],
    ["BusinessStructure", BUSINESS_STRUCTURES],
    ["RouteUnservedReason", ROUTE_UNSERVED_REASONS],
  ] as const)(
    "knows exactly the %s values the contract lists, in its order",
    (name, values) => {
      expect(values).toEqual(schemas[name]?.enum);
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
    for (const role of [...RELATED_ROLES, null]) {
      expect(
        parseBusinessesResponse(businesses(withPersonRole(role))).suggestions[0]
          ?.related.people.items[0]?.role,
      ).toBe(role);
    }
  });

  it("refuses a match grade it does not know, naming where", () => {
    expect(() =>
      parseBusinessesResponse(businesses({ ...business, match: "phonetic" })),
    ).toThrow(
      "response.suggestions[0].match: expected one of exact, strong, partial",
    );
  });

  it("refuses a source status it does not know", () => {
    expect(() =>
      parseBusinessesResponse(businesses(business, "degraded")),
    ).toThrow(ContractViolation);
  });

  it("refuses a role it does not know, and still reads an absent one as null", () => {
    expect(() =>
      parseBusinessesResponse(businesses(withPersonRole("director"))),
    ).toThrow("response.suggestions[0].related.people.items[0].role");

    const absent = withPersonRole(undefined);
    delete (absent.related.people.items[0] as { role?: unknown }).role;
    expect(
      parseBusinessesResponse(businesses(absent)).suggestions[0]?.related.people
        .items[0]?.role,
    ).toBeNull();
  });

  it("refuses a structure it does not know, and still reads an absent one as null", () => {
    expect(() =>
      parseBusinessesResponse(
        businesses({ ...business, structure: "FOUNDATION" }),
      ),
    ).toThrow("response.suggestions[0].structure");
    expect(
      parseBusinessesResponse(businesses({ ...business, structure: null }))
        .suggestions[0]?.structure,
    ).toBeNull();
  });

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
    const person = {
      type: "person",
      token: "tok-person",
      label: "Dana Whitfield",
      matched_name: null,
      match: "exact",
      highlight: [{ text: "Dana Whitfield", matched: true }],
      related: {
        businesses: {
          count: 1,
          matched: null,
          truncated: false,
          items: [
            {
              type: "person",
              token: "tok-x",
              label: "Harbor Concrete Pumping Co., Inc.",
              role: "officer",
              matched: false,
            },
          ],
        },
        addresses: { count: null, matched: null, truncated: false, items: [] },
      },
    };
    expect(() =>
      parseSuggestResponse("people", {
        query: "dana",
        found: 1,
        found_capped: false,
        truncated: false,
        sources: {
          businesses: { status: "ok" },
          addresses: { status: "not_requested" },
        },
        suggestions: [person],
      }),
    ).toThrow(
      'response.suggestions[0].related.businesses.items[0].type: expected "business"',
    );
  });

  it("reads an address's components as null where the filing did not carry them", () => {
    const address = {
      type: "address",
      token: "tok-address",
      label: "Pier 9, Erie",
      matched_name: null,
      match: "strong",
      highlight: [{ text: "Pier", matched: true }],
      components: { line1: "Pier 9", line2: null, city: "Erie" },
      related: {
        businesses: { count: 0, matched: null, truncated: false, items: [] },
        people: { count: null, matched: null, truncated: false, items: [] },
      },
    };
    const bare = {
      ...address,
      token: "tok-bare",
      components: { line1: null, line2: null, state: "PA" },
    };

    const parsed = parseSuggestResponse("addresses", {
      query: "pier 9",
      found: 1,
      found_capped: false,
      truncated: false,
      sources: {
        businesses: { status: "ok" },
        people: { status: "not_requested" },
      },
      suggestions: [address, bare],
    });

    expect(parsed.suggestions[0]!.components).toEqual({
      line1: "Pier 9",
      line2: null,
      city: "Erie",
      state: null,
      postal_code: null,
    });
    // No street and no city: the street is null, the city absent.
    expect(parsed.suggestions[1]!.components).toEqual({
      line1: null,
      line2: null,
      city: null,
      state: "PA",
      postal_code: null,
    });
  });
});
