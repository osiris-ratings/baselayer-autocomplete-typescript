import { describe, expect, it } from "vitest";

import {
  ContractViolation,
  parseBusinessesResponse,
  parseErrorEnvelope,
  type BusinessSuggestion,
} from "@baselayer-sdk/autocomplete";

import { firstValidationMessage } from "../../src/core/wire";

// The wire shape of `GET /autocomplete/businesses` as the tier serves it
// today: every key present, nulls spelled out.
const suggestion = {
  type: "business",
  token: "tok-cinder-rigging",
  label: "CINDER RIGGING, INC.",
  matched_name: null,
  match: "strong",
  domicile_state: "DE",
  states: ["DE", "CA"],
  related: {
    people: {
      count: 3,
      matched: 1,
      truncated: false,
      items: [
        {
          type: "person",
          token: null,
          label: "Wesley Crane",
          role: "officer",
          matched: true,
        },
      ],
    },
    addresses: {
      count: 2,
      matched: 0,
      truncated: false,
      items: [
        {
          type: "address",
          token: "tok-7f1a2c3d",
          label: "1200 EMBARCADERO RD FL 3, OAKLAND, CA 94606",
          role: "principal",
          matched: false,
        },
      ],
    },
    liens: { count: null, matched: null, truncated: false, items: [] },
  },
  highlight: [{ text: "CINDER", matched: true }],
};

const response = {
  query: "cind",
  found: 0,
  found_capped: true,
  sources: {
    people: { status: "ok" },
    addresses: { status: "ok" },
    liens: { status: "unavailable" },
  },
  suggestions: [],
};

/**
 * The console parsed one suggestion with `businessSuggestionSchema`; the SDK
 * validates suggestions as part of a response, so this reads one back out.
 */
function parseSuggestion(value: unknown): BusinessSuggestion {
  const [parsed] = parseBusinessesResponse({
    ...response,
    suggestions: [value],
  }).suggestions;
  if (parsed === undefined) {
    throw new Error("the response parsed without its suggestion");
  }
  return parsed;
}

describe("a business suggestion", () => {
  it("parses today's wire shape", () => {
    expect(parseSuggestion(suggestion)).toEqual(suggestion);
    expect(
      parseBusinessesResponse({
        ...response,
        truncated: false,
        suggestions: [suggestion],
      }),
    ).toEqual({ ...response, truncated: false, suggestions: [suggestion] });
  });

  it("does not go dark over a related type or a grade it has never seen", () => {
    // The contract anticipates growth ("null only for type: person, until the
    // person entity ships"); nothing renders `type` or `match`, so a new value
    // on the tier must degrade nothing, the way `sources.*.status` already does.
    const grown = {
      ...suggestion,
      match: "fuzzy",
      related: {
        ...suggestion.related,
        liens: {
          count: 1,
          matched: null,
          truncated: false,
          items: [
            {
              type: "ucc_filing",
              token: "tok-8f1a2c3d",
              label: "UCC-1 2024-001",
              role: null,
              matched: false,
            },
          ],
        },
      },
    };

    expect(() => parseSuggestion(grown)).not.toThrow();
    expect(() =>
      parseBusinessesResponse({
        ...response,
        sources: { ...response.sources, liens: { status: "degraded" } },
      }),
    ).not.toThrow();
  });

  it("reads an absent optional key as null, as the published contract allows", () => {
    // `openapi.json` leaves `matched_name`, `RelatedItem.token`, `role`,
    // `RelatedSet.count` and `matched` out of `required`. The tier spells them
    // as null today; a build that omits them instead is still on contract.
    const withoutMatchedName: Partial<typeof suggestion> = { ...suggestion };
    delete withoutMatchedName.matched_name;
    const sparse = {
      ...withoutMatchedName,
      related: {
        people: {
          truncated: false,
          items: [{ type: "person", label: "Wesley Crane", matched: true }],
        },
        addresses: { truncated: false, items: [] },
        liens: { truncated: false, items: [] },
      },
    };

    const parsed = parseSuggestion(sparse);

    expect(parsed.matched_name).toBeNull();
    expect(parsed.related.people.count).toBeNull();
    expect(parsed.related.people.matched).toBeNull();
    expect(parsed.related.people.items[0]?.token).toBeNull();
    expect(parsed.related.people.items[0]?.role).toBeNull();
  });

  it("takes a related item's handle as the opaque string it is", () => {
    // It used to be a uuid and the schema said so; a sealed handle is 94
    // base64url characters and nothing about it should have to parse.
    const handle =
      "AwICAgICAgICAgICAgTWyUlKV8H908y8yFynwrKjtdHv67GNcd2H4Pt4-3R_dX8eN20E6j1HG_3f6xiVVArRqtWIzh89LQ";
    const tokened = {
      ...suggestion,
      related: {
        ...suggestion.related,
        addresses: {
          count: 1,
          matched: null,
          truncated: false,
          items: [
            {
              type: "address",
              token: handle,
              label: "412 Orchard Ln, Springfield, MO 65806",
              role: "principal",
              matched: false,
            },
          ],
        },
      },
    };

    const parsed = parseSuggestion(tokened);

    expect(parsed.related.addresses.items[0]?.token).toBe(handle);
  });

  it("drops a raw id a rolled-back tier still sends, and reads no handle", () => {
    // The version-skew tripwire, which needs an `id` fed IN to mean anything:
    // asserting `not.toHaveProperty("id")` on a fixture that never had one
    // passes under any parser that drops unknown keys.
    // 0.5.0 of the tier served `id` and no `token`; this is that wire shape.
    const rolledBack = {
      ...suggestion,
      related: {
        ...suggestion.related,
        addresses: {
          count: 1,
          matched: null,
          truncated: false,
          items: [
            {
              type: "address",
              id: "7f1a2c3d-4e5f-4a0c-9c0e-0d3b2b6e2b7e",
              label: "412 Orchard Ln, Springfield, MO 65806",
              role: "principal",
              matched: false,
            },
          ],
        },
      },
    };

    const parsed = parseSuggestion(rolledBack);

    const item = parsed.related.addresses.items[0];
    expect(item).not.toHaveProperty("id");
    expect(item?.token).toBeNull();
    expect(item?.label).toBe("412 Orchard Ln, Springfield, MO 65806");
  });

  describe("truncated", () => {
    it("reads the flag the tier sends", () => {
      expect(
        parseBusinessesResponse({ ...response, truncated: true }).truncated,
      ).toBe(true);
      expect(
        parseBusinessesResponse({ ...response, truncated: false }).truncated,
      ).toBe(false);
    });

    it("survives a tier that predates the field, omitted or null", () => {
      // The console can deploy ahead of the tier. An omitted key and an
      // explicit null both have to parse, and both read as complete, rather
      // than taking the whole typeahead down over one caveat.
      expect(parseBusinessesResponse(response).truncated).toBe(false);
      expect(
        parseBusinessesResponse({ ...response, truncated: null }).truncated,
      ).toBe(false);
    });

    it("still refuses a value that is not a boolean", () => {
      expect(() =>
        parseBusinessesResponse({ ...response, truncated: "yes" }),
      ).toThrow(ContractViolation);
    });
  });

  it("still refuses a row that is not a business suggestion", () => {
    expect(() => parseSuggestion({ ...suggestion, type: "person" })).toThrow(
      ContractViolation,
    );
    expect(() => parseSuggestion({ ...suggestion, token: "" })).toThrow(
      ContractViolation,
    );
    expect(() =>
      parseBusinessesResponse({
        query: "cind",
        found: -1,
        found_capped: false,
        sources: {
          people: { status: "ok" },
          addresses: { status: "ok" },
          liens: { status: "unavailable" },
        },
        suggestions: [],
      }),
    ).toThrow(ContractViolation);
  });

  it("names the path it refused", () => {
    let caught: unknown;
    try {
      parseSuggestion({ ...suggestion, token: "" });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ContractViolation);
    expect(caught).toMatchObject({
      path: "response.suggestions[0].token",
      message: "response.suggestions[0].token: expected a non-empty string",
    });
    expect(() =>
      parseSuggestion({
        ...suggestion,
        related: {
          ...suggestion.related,
          people: {
            ...suggestion.related.people,
            items: [{ type: "person", label: "Wesley Crane" }],
          },
        },
      }),
    ).toThrow("response.suggestions[0].related.people.items[0].matched");
  });

  it("refuses a missing relation, a fractional count and a body that is not an object", () => {
    const twoRelations: Partial<typeof suggestion.related> = {
      ...suggestion.related,
    };
    delete twoRelations.liens;
    expect(() =>
      parseSuggestion({ ...suggestion, related: twoRelations }),
    ).toThrow(ContractViolation);
    expect(() => parseBusinessesResponse({ ...response, found: 1.5 })).toThrow(
      ContractViolation,
    );
    for (const body of [null, "cind", [], 200]) {
      expect(() => parseBusinessesResponse(body)).toThrow(ContractViolation);
    }
  });

  it("hands back exactly the contract, whatever else the tier sent", () => {
    const parsed = parseBusinessesResponse({
      ...response,
      elapsed_ms: 4,
      suggestions: [{ ...suggestion, score: 0.93 }],
    });

    expect(parsed).not.toHaveProperty("elapsed_ms");
    expect(parsed.suggestions[0]).not.toHaveProperty("score");
  });
});

describe("parseErrorEnvelope", () => {
  it("reads the catalog envelope the tier and the API refuse with", () => {
    expect(
      parseErrorEnvelope({
        code: 480,
        message: "The session's request budget is spent",
        uri: null,
        metadata: { reason: "session_budget_spent" },
      }),
    ).toEqual({
      code: 480,
      message: "The session's request budget is spent",
      metadata: { reason: "session_budget_spent" },
    });
  });

  it("reads absent or null metadata as null", () => {
    expect(parseErrorEnvelope({ code: 481, message: "off" })).toEqual({
      code: 481,
      message: "off",
      metadata: null,
    });
    expect(
      parseErrorEnvelope({ code: 481, message: "off", metadata: null }),
    ).toEqual({ code: 481, message: "off", metadata: null });
  });

  it.each([
    ["null", null],
    ["a string", "Bad Gateway"],
    ["an array", [{ code: 480, message: "spent" }]],
    ["a validation body", { detail: [{ msg: "too short" }] }],
    ["a string code", { code: "480", message: "spent" }],
    ["a fractional code", { code: 480.5, message: "spent" }],
    ["no message", { code: 480 }],
    ["a message that is not a string", { code: 480, message: 480 }],
    ["string metadata", { code: 480, message: "spent", metadata: "reason" }],
    ["array metadata", { code: 480, message: "spent", metadata: [] }],
  ])("is null for %s", (_, body) => {
    expect(parseErrorEnvelope(body)).toBeNull();
  });
});

describe("firstValidationMessage", () => {
  it("reads the first detail's message", () => {
    expect(
      firstValidationMessage({
        detail: [
          { loc: ["query", "q"], msg: "String should have at least 2" },
          { loc: ["query", "limit"], msg: "Input should be less than 21" },
        ],
      }),
    ).toBe("String should have at least 2");
  });

  it.each([
    ["an envelope", { code: 422, message: "invalid" }],
    ["an empty detail", { detail: [] }],
    ["a detail that is not a list", { detail: "invalid" }],
    ["a message that is not a string", { detail: [{ msg: 2 }] }],
    ["a detail item that is not an object", { detail: ["too short"] }],
    ["null", null],
  ])("is null for %s", (_, body) => {
    expect(firstValidationMessage(body)).toBeNull();
  });
});
