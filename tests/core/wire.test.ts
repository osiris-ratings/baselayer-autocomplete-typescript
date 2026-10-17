import { describe, expect, it } from "vitest";

import {
  BUSINESS_STRUCTURES,
  ContractViolation,
  parseBusinessesResponse,
  parseErrorEnvelope,
  parseSuggestResponse,
  validationErrors,
  type AddressSuggestion,
  type BusinessSuggestion,
  type ErrorEnvelope,
  type PersonSuggestion,
} from "@baselayer-sdk/autocomplete";

import { firstValidationMessage } from "../../src/core/wire";

import { faultsAgainst, schemaNamed } from "./fixtures/contract";
import { golden, type GoldenName } from "./fixtures/golden";

// The wire shape of `GET /autocomplete/businesses` as the autocomplete service
// serves it today: every key present, nulls spelled out.
const suggestion = {
  type: "business",
  token: "tok-cinder-rigging",
  label: "CINDER RIGGING, INC.",
  matched_name: null,
  match: "strong",
  domicile_state: "DE",
  states: ["DE", "CA"],
  structure: "C_CORPORATION",
  related: {
    people: {
      count: 3,
      matched: 1,
      truncated: false,
      items: [
        {
          type: "person",
          label: "Wesley Crane",
          role: "officer",
          matched: true,
          highlight: null,
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
          label: "1200 TIDECASTER RD FL 3, OAKLAND, CA 94606",
          listed_as: "principal",
          matched: false,
          highlight: null,
        },
      ],
    },
  },
  highlight: [{ text: "CINDER", matched: true }],
};

const response = {
  query: "cind",
  found: 0,
  found_capped: true,
  truncated: false,
  sources: {
    people: { status: "ok" },
    addresses: { status: "ok" },
  },
  suggestions: [],
};

/** A business listed under a person or an address, which `POST /searches` redeems. */
const relatedBusiness = {
  type: "business",
  token: "tok-cinder-rigging",
  label: "CINDER RIGGING, INC.",
  matched: false,
  matched_name: null,
  highlight: null,
  address: "1200 Tidecaster Rd, Oakland, CA 94606",
  states: ["CA", "DE"],
  domicile_state: "DE",
};

const businessOfPerson = { ...relatedBusiness, role: "officer" };

const businessOfAddress = {
  ...relatedBusiness,
  listed_as: "registered_office",
};

const person = {
  type: "person",
  token: "tok-wesley-crane",
  label: "Wesley Crane",
  match: "exact",
  states: ["CA", "DE"],
  highlight: [{ text: "Wesley Crane", matched: true }],
  related: {
    businesses: {
      count: 1,
      matched: null,
      truncated: false,
      items: [businessOfPerson],
    },
    addresses: { count: 0, matched: null, truncated: false, items: [] },
  },
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

function parsePerson(value: unknown): PersonSuggestion {
  const [parsed] = parseSuggestResponse("people", {
    ...response,
    sources: { businesses: { status: "ok" }, addresses: { status: "ok" } },
    suggestions: [value],
  }).suggestions;
  if (parsed === undefined) {
    throw new Error("the response parsed without its suggestion");
  }
  return parsed;
}

function parseAddress(value: unknown): AddressSuggestion {
  const [parsed] = parseSuggestResponse("addresses", {
    ...response,
    sources: { businesses: { status: "ok" }, people: { status: "ok" } },
    suggestions: [value],
  }).suggestions;
  if (parsed === undefined) {
    throw new Error("the response parsed without its suggestion");
  }
  return parsed;
}

/** `body` with the key at `path` taken out. */
function without(body: unknown, path: (string | number)[]): unknown {
  const copy = structuredClone(body);
  let at = copy as Record<string | number, unknown>;
  for (const step of path.slice(0, -1)) {
    at = at[step] as Record<string | number, unknown>;
  }
  delete at[path[path.length - 1]!];
  return copy;
}

function pathOf(steps: (string | number)[]): string {
  return steps.reduce<string>(
    (path, step) =>
      typeof step === "number" ? `${path}[${step}]` : `${path}.${step}`,
    "response",
  );
}

describe("a business suggestion", () => {
  it("parses today's wire shape", () => {
    expect(parseSuggestion(suggestion)).toEqual(suggestion);
    expect(
      parseBusinessesResponse({ ...response, suggestions: [suggestion] }),
    ).toEqual({ ...response, suggestions: [suggestion] });
  });

  it("is the shape the vendored contract describes", () => {
    // The fixtures above are hand-written: held to the contract itself, so
    // the tests that read them are not reading a shape the service never sends.
    expect(
      faultsAgainst(schemaNamed("BusinessSuggestion"), suggestion),
    ).toEqual([]);
    expect(faultsAgainst(schemaNamed("PersonSuggestion"), person)).toEqual([]);
    expect(
      faultsAgainst(schemaNamed("BusinessesResponse"), {
        ...response,
        suggestions: [suggestion],
      }),
    ).toEqual([]);
  });

  it("refuses a related item of a type it has never seen", () => {
    // `type` is the one value that stays closed: a relation holds the one
    // entity it is for, and a client tells the entities apart by it. An
    // unknown `match` or `status` is another matter (see `wire-enums`).
    const grown = {
      ...suggestion,
      related: {
        ...suggestion.related,
        addresses: {
          count: 1,
          matched: null,
          truncated: false,
          items: [
            {
              type: "parcel",
              label: "PARCEL 12-004-118",
              matched: false,
              highlight: null,
            },
          ],
        },
      },
    };

    expect(() => parseSuggestion(grown)).toThrow(
      'response.suggestions[0].related.addresses.items[0].type: expected "address"',
    );
  });

  it("reads an absent role as null, as the published contract allows", () => {
    // `role` and `listed_as` are the keys the contract leaves out of
    // `required`: the service sends them only where the filing names a role.
    expect(schemaNamed("RelatedPerson").required).not.toContain("role");
    expect(schemaNamed("RelatedAddress").required).not.toContain("listed_as");
    expect(schemaNamed("RelatedBusiness").required).not.toContain("role");
    expect(schemaNamed("RelatedBusiness").required).not.toContain("listed_as");
    const person = { ...suggestion.related.people.items[0] };
    delete (person as { role?: unknown }).role;
    const address = { ...suggestion.related.addresses.items[0] };
    delete (address as { listed_as?: unknown }).listed_as;

    const parsed = parseSuggestion({
      ...suggestion,
      related: {
        people: { ...suggestion.related.people, items: [person] },
        addresses: { ...suggestion.related.addresses, items: [address] },
      },
    });

    expect(parsed.related.people.items[0]?.role).toBeNull();
    expect(parsed.related.addresses.items[0]?.listed_as).toBeNull();
  });

  it("reads a role the service sent as null the same", () => {
    const parsed = parseSuggestion({
      ...suggestion,
      related: {
        ...suggestion.related,
        people: {
          ...suggestion.related.people,
          items: [{ ...suggestion.related.people.items[0], role: null }],
        },
      },
    });

    expect(parsed.related.people.items[0]?.role).toBeNull();
  });

  it("takes a related business's handle as the opaque string it is", () => {
    // It used to be a uuid and the schema said so; a sealed handle is 94
    // base64url characters and nothing about it should have to parse.
    const handle =
      "AwICAgICAgICAgICAgTWyUlKV8H908y8yFynwrKjtdHv67GNcd2H4Pt4-3R_dX8eN20E6j1HG_3f6xiVVArRqtWIzh89LQ";
    const tokened = {
      ...person,
      related: {
        ...person.related,
        businesses: {
          ...person.related.businesses,
          items: [{ ...businessOfPerson, token: handle }],
        },
      },
    };

    const parsed = parsePerson(tokened);

    expect(parsed.related.businesses.items[0]?.token).toBe(handle);
  });

  it("drops a raw id a rolled-back autocomplete service still sends", () => {
    // The version-skew tripwire, which needs an `id` fed IN to mean anything:
    // asserting `not.toHaveProperty("id")` on a fixture that never had one
    // passes under any parser that drops unknown keys.
    const stray = {
      ...person,
      related: {
        ...person.related,
        businesses: {
          ...person.related.businesses,
          items: [
            { ...businessOfPerson, id: "7f1a2c3d-4e5f-4a0c-9c0e-0d3b2b6e2b7e" },
          ],
        },
      },
    };

    const item = parsePerson(stray).related.businesses.items[0];

    expect(item).not.toHaveProperty("id");
    expect(item?.token).toBe("tok-cinder-rigging");
  });

  it("refuses a related business that carries an id and no handle", () => {
    // 0.5.0 of the autocomplete service served `id` and no `token`. A business
    // listed under a person is what a pick spends, so one with no handle is a
    // contract error, not a line that quietly cannot be picked.
    const unsealed = without(businessOfPerson, ["token"]) as object;
    const rolledBack = {
      ...person,
      related: {
        ...person.related,
        businesses: {
          ...person.related.businesses,
          items: [{ ...unsealed, id: "7f1a2c3d-4e5f-4a0c-9c0e-0d3b2b6e2b7e" }],
        },
      },
    };

    expect(() => parsePerson(rolledBack)).toThrow(
      "response.suggestions[0].related.businesses.items[0].token",
    );
    expect(() =>
      parsePerson({
        ...person,
        related: {
          ...person.related,
          businesses: {
            ...person.related.businesses,
            items: [{ ...businessOfPerson, token: "" }],
          },
        },
      }),
    ).toThrow("response.suggestions[0].related.businesses.items[0].token");
  });

  describe("structure", () => {
    const autocomplete = {
      schemas: {
        BusinessStructure: schemaNamed("BusinessStructure") as {
          enum?: string[];
        },
        BusinessSuggestion: schemaNamed("BusinessSuggestion") as {
          required?: string[];
        },
      },
    };

    it("knows every structure the autocomplete service's contract lists, in its order", () => {
      expect(BUSINESS_STRUCTURES).toEqual(
        autocomplete.schemas.BusinessStructure.enum,
      );
    });

    it("reads the structure the autocomplete service sends", () => {
      expect(parseSuggestion(suggestion).structure).toBe("C_CORPORATION");
      for (const structure of BUSINESS_STRUCTURES) {
        expect(parseSuggestion({ ...suggestion, structure }).structure).toBe(
          structure,
        );
      }
    });

    it("reads a null structure as null, and refuses an absent one", () => {
      // The contract lists it as `required`, and nullable: null is the answer
      // for a business whose structure is not known, a missing key is not.
      expect(autocomplete.schemas.BusinessSuggestion.required).toContain(
        "structure",
      );
      const older: Partial<typeof suggestion> = { ...suggestion };
      delete older.structure;

      expect(
        parseSuggestion({ ...suggestion, structure: null }).structure,
      ).toBe(null);
      expect(() => parseSuggestion(older)).toThrow(
        "response.suggestions[0].structure: expected a value, or null",
      );
    });

    it("keeps a structure this build does not know as sent, and refuses one that is not a string", () => {
      expect(
        parseSuggestion({ ...suggestion, structure: "FOUNDATION" }).structure,
      ).toBe("FOUNDATION");
      expect(() => parseSuggestion({ ...suggestion, structure: 3 })).toThrow(
        "response.suggestions[0].structure: expected a string",
      );
    });
  });

  describe("truncated", () => {
    it("reads the flag the autocomplete service sends", () => {
      expect(
        parseBusinessesResponse({ ...response, truncated: true }).truncated,
      ).toBe(true);
      expect(
        parseBusinessesResponse({ ...response, truncated: false }).truncated,
      ).toBe(false);
    });

    it("is required: an answer without it, omitted or null, is a contract error", () => {
      // It was optional while the autocomplete service predated the field. A
      // service that answers without it is not the one this build reads, and
      // reading it as complete would put "0 matches" where a search did not
      // finish.
      expect(() =>
        parseBusinessesResponse(without(response, ["truncated"])),
      ).toThrow("response.truncated: expected a boolean");
      expect(() =>
        parseBusinessesResponse({ ...response, truncated: null }),
      ).toThrow(ContractViolation);
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
      parseBusinessesResponse({ ...response, found: -1, found_capped: false }),
    ).toThrow("response.found: expected a non-negative integer");
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
    const oneRelation: Partial<typeof suggestion.related> = {
      ...suggestion.related,
    };
    delete oneRelation.addresses;
    expect(() =>
      parseSuggestion({ ...suggestion, related: oneRelation }),
    ).toThrow(ContractViolation);
    expect(() => parseBusinessesResponse({ ...response, found: 1.5 })).toThrow(
      ContractViolation,
    );
    for (const body of [null, "cind", [], 200]) {
      expect(() => parseBusinessesResponse(body)).toThrow(ContractViolation);
    }
  });

  it("hands back exactly the contract, whatever else the autocomplete service sent", () => {
    const parsed = parseBusinessesResponse({
      ...response,
      elapsed_ms: 4,
      suggestions: [
        {
          ...suggestion,
          score: 0.93,
          related: {
            ...suggestion.related,
            people: {
              ...suggestion.related.people,
              items: [{ ...suggestion.related.people.items[0], tenure: 4 }],
            },
          },
        },
      ],
    });

    expect(parsed).not.toHaveProperty("elapsed_ms");
    expect(parsed.suggestions[0]).not.toHaveProperty("score");
    expect(parsed.suggestions[0]?.related.people.items[0]).not.toHaveProperty(
      "tenure",
    );
  });

  it("drops a relation the route does not expand, from sources and related", () => {
    const parsed = parseBusinessesResponse({
      ...response,
      sources: { ...response.sources, vehicles: { status: "unavailable" } },
      suggestions: [
        {
          ...suggestion,
          related: {
            ...suggestion.related,
            vehicles: {
              count: null,
              matched: null,
              truncated: false,
              items: [],
            },
          },
        },
      ],
    });

    expect(Object.keys(parsed.sources)).toEqual(["people", "addresses"]);
    expect(Object.keys(parsed.suggestions[0]!.related)).toEqual([
      "people",
      "addresses",
    ]);
  });
});

describe("a person suggestion and an address suggestion", () => {
  const address = {
    type: "address",
    token: "tok-tidecaster",
    label: "1200 Tidecaster Rd, Oakland, CA 94606",
    match: "strong",
    highlight: [{ text: "1200", matched: true }],
    components: {
      line1: "1200 Tidecaster Rd",
      line2: null,
      city: "Oakland",
      state: "CA",
      postal_code: "94606",
    },
    related: {
      businesses: {
        count: 1,
        matched: null,
        truncated: false,
        items: [businessOfAddress],
      },
      people: {
        count: 1,
        matched: null,
        truncated: false,
        items: [
          {
            type: "person",
            label: "Wesley Crane",
            matched: false,
            highlight: null,
          },
        ],
      },
    },
  };

  it("parse today's wire shape, and the contract describes it", () => {
    expect(parsePerson(person)).toEqual(person);
    expect(parseAddress(address)).toEqual(address);
    expect(faultsAgainst(schemaNamed("AddressSuggestion"), address)).toEqual(
      [],
    );
  });

  it("read a person's states, which it has from its businesses", () => {
    expect(parsePerson(person).states).toEqual(["CA", "DE"]);
    expect(() => parsePerson({ ...person, states: undefined })).toThrow(
      "response.suggestions[0].states: expected an array",
    );
  });

  it("read no role on an address listed under a person", () => {
    const parsed = parsePerson({
      ...person,
      related: {
        ...person.related,
        addresses: {
          count: 1,
          matched: null,
          truncated: false,
          items: [
            {
              type: "address",
              label: "1200 Tidecaster Rd, Oakland, CA 94606",
              matched: false,
              highlight: null,
              // Not the contract's for an address under a person: dropped, not
              // read as a role.
              listed_as: "principal",
            },
          ],
        },
      },
    });

    expect(parsed.related.addresses.items[0]).not.toHaveProperty("listed_as");
    expect(Object.keys(parsed.related.addresses.items[0]!).sort()).toEqual([
      "highlight",
      "label",
      "matched",
      "type",
    ]);
  });

  it("drop a token, a name and states a person listed under an address has no place for", () => {
    const parsed = parseAddress({
      ...address,
      related: {
        ...address.related,
        people: {
          ...address.related.people,
          items: [
            {
              ...address.related.people.items[0],
              token: "tok-wesley-crane",
              matched_name: null,
              states: ["DE"],
            },
          ],
        },
      },
    });

    const wesley = parsed.related.people.items[0]!;
    expect(wesley).not.toHaveProperty("token");
    expect(wesley).not.toHaveProperty("matched_name");
    expect(wesley).not.toHaveProperty("states");
  });

  it("read no `matched_name` on either: it is a business's alone", () => {
    expect(
      parsePerson({ ...person, matched_name: "W. CRANE" }),
    ).not.toHaveProperty("matched_name");
    expect(parseAddress({ ...address, matched_name: "x" })).not.toHaveProperty(
      "matched_name",
    );
  });
});

describe("a key the contract requires", () => {
  // Each is taken out of a golden answer in turn. The contract leaves a key
  // null where there is nothing to say, never absent: a missing one is a
  // service that is not speaking this contract, so it is refused, naming it.
  type Steps = (string | number)[];
  const lacking = (
    name: GoldenName,
    under: Steps,
    keys: string[],
  ): [GoldenName, Steps][] => keys.map(key => [name, [...under, key]]);

  const row = ["suggestions", 0];
  const businessItems = [...row, "related", "businesses", "items", 0];
  const CASES: [GoldenName, Steps][] = [
    ...lacking(
      "businesses",
      [],
      ["query", "found", "found_capped", "truncated", "sources", "suggestions"],
    ),
    ...lacking("businesses", ["sources"], ["people", "addresses"]),
    ["businesses", ["sources", "people", "status"]],
    ...lacking("businesses", row, [
      "type",
      "token",
      "label",
      "matched_name",
      "match",
      "domicile_state",
      "structure",
      "states",
      "related",
      "highlight",
    ]),
    ...lacking("businesses", [...row, "related"], ["people", "addresses"]),
    ...lacking(
      "businesses",
      [...row, "related", "people"],
      ["count", "matched", "truncated", "items"],
    ),
    ...lacking(
      "businesses",
      [...row, "related", "people", "items", 0],
      ["type", "label", "matched", "highlight"],
    ),
    ...lacking(
      "businesses",
      [...row, "related", "addresses", "items", 0],
      ["type", "label", "matched", "highlight"],
    ),
    ...lacking("people", row, [
      "type",
      "token",
      "label",
      "match",
      "states",
      "highlight",
      "related",
    ]),
    ...lacking("people", businessItems, [
      "type",
      "token",
      "label",
      "matched",
      "matched_name",
      "highlight",
      "address",
      "states",
      "domicile_state",
    ]),
    ...lacking("addresses", row, [
      "type",
      "token",
      "label",
      "match",
      "components",
      "highlight",
      "related",
    ]),
    ...lacking(
      "addresses",
      [...row, "components"],
      ["line1", "line2", "city", "state", "postal_code"],
    ),
    ...lacking(
      "addresses",
      [...row, "related", "people", "items", 0],
      ["highlight"],
    ),
  ];
  const routeOf = {
    businesses: "businesses",
    businesses_filtered: "businesses",
    businesses_corrected: "businesses",
    people: "people",
    addresses: "addresses",
    invalid_request: "businesses",
  } as const;

  it.each(CASES)(
    "%s answer without %j is refused, naming the key",
    (name, steps) => {
      let caught: unknown;
      try {
        parseSuggestResponse(routeOf[name], without(golden(name), steps));
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(ContractViolation);
      expect(caught).toMatchObject({ path: pathOf(steps) });
    },
  );
});

describe("a related item from before this contract", () => {
  // The contract before this one named how a business filed an address, and
  // the role a person held at one, `role`, as it names the role a person holds
  // on a business. Read as today's, an address's `role` would be no listing at
  // all, so it is refused, and the message says why. A person's `role` on a
  // business is the same key and the same meaning, and is read.
  const FORMER = /still serves the one before it/;

  type Body = {
    suggestions: {
      related: Record<string, { items: Record<string, unknown>[] }>;
    }[];
  };

  it.each([
    ["an address under a business", "businesses", "addresses"],
    ["a business under an address", "addresses", "businesses"],
    ["a person under an address", "addresses", "people"],
    ["an address under a person", "people", "addresses"],
  ] as const)("refuses %s that carries `role`", (_, route, relation) => {
    const body = golden(route) as Body;
    body.suggestions[0]!.related[relation]!.items[0]!.role = "officer";
    let caught: unknown;

    try {
      parseSuggestResponse(route, body);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ContractViolation);
    expect(caught).toMatchObject({
      path: `response.suggestions[0].related.${relation}.items[0].role`,
      message: expect.stringMatching(FORMER) as string,
    });
  });

  it("refuses one whose `role` is null too, as the key is what says it", () => {
    const body = golden("addresses") as Body;
    body.suggestions[0]!.related["people"]!.items[0]!.role = null;

    expect(() => parseSuggestResponse("addresses", body)).toThrow(
      "response.suggestions[0].related.people.items[0].role",
    );
  });

  it.each([
    ["a person under a business", "businesses", "people"],
    ["a business under a person", "people", "businesses"],
  ] as const)("reads the `role` of %s", (_, route, relation) => {
    const body = golden(route) as Body;
    body.suggestions[0]!.related[relation]!.items[0]!.role = "agent";

    const read = parseSuggestResponse(route, body) as unknown as {
      suggestions: {
        related: Record<string, { items: { role: string | null }[] }>;
      }[];
    };

    expect(read.suggestions[0]!.related[relation]!.items[0]!.role).toBe(
      "agent",
    );
  });

  it("reads the same answers without it, which is all that changed", () => {
    for (const route of ["businesses", "people", "addresses"] as const) {
      expect(() => parseSuggestResponse(route, golden(route))).not.toThrow();
    }
  });
});

describe("parseErrorEnvelope", () => {
  it("reads the catalog envelope the autocomplete service and the API refuse with", () => {
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
      uri: null,
      metadata: { reason: "session_budget_spent" },
    });
  });

  it("reads the uri when there is one, and an absent one as null", () => {
    expect(
      parseErrorEnvelope({
        code: 429,
        message: "slow down",
        uri: "https://docs.example.test/errors/rate-limited",
        metadata: null,
      }),
    ).toMatchObject({ uri: "https://docs.example.test/errors/rate-limited" });
    expect(
      parseErrorEnvelope({ code: 429, message: "slow down" }),
    ).toMatchObject({ uri: null });
  });

  it("reads absent or null metadata as null", () => {
    expect(parseErrorEnvelope({ code: 481, message: "off" })).toEqual({
      code: 481,
      message: "off",
      uri: null,
      metadata: null,
    });
    expect(
      parseErrorEnvelope({ code: 481, message: "off", metadata: null }),
    ).toEqual({ code: 481, message: "off", uri: null, metadata: null });
  });

  it.each([
    ["null", null],
    ["a string", "Bad Gateway"],
    ["an array", [{ code: 480, message: "spent" }]],
    ["a pydantic validation body", { detail: [{ msg: "too short" }] }],
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

describe("the 422 envelope", () => {
  const invalid = (errors: unknown, reason = "request_invalid") =>
    ({
      code: 422,
      message: "The request is invalid.",
      uri: null,
      metadata: { reason, errors },
    }) satisfies ErrorEnvelope;

  describe("firstValidationMessage", () => {
    it("reads the first error's message", () => {
      expect(
        firstValidationMessage(
          invalid([
            {
              type: "string_too_short",
              loc: ["query", "q"],
              msg: "String should have at least 2 characters",
            },
            {
              type: "less_than_equal",
              loc: ["query", "limit"],
              msg: "Input should be less than or equal to 20",
            },
          ]),
        ),
      ).toBe("String should have at least 2 characters");
    });

    it("passes over an error it cannot read, to the first it can", () => {
      expect(
        firstValidationMessage(
          invalid([
            "too short",
            { type: "missing", loc: ["query", "q"], msg: 2 },
            { type: "missing", loc: ["query", "q"], msg: "Field required" },
          ]),
        ),
      ).toBe("Field required");
    });

    it.each([
      ["an envelope that names no errors", { ...invalid([]), metadata: null }],
      ["an empty list", invalid([])],
      ["errors that are not a list", invalid("invalid")],
      [
        "a message that is not a string",
        invalid([{ type: "x", loc: [], msg: 2 }]),
      ],
      ["an error that is not an object", invalid(["too short"])],
      ["an error with no `loc`", invalid([{ type: "x", msg: "too short" }])],
      [
        "errors under another reason",
        invalid([{ type: "x", loc: [], msg: "too short" }], "rate_limited"),
      ],
    ])("is null for %s", (_, envelope) => {
      expect(firstValidationMessage(envelope)).toBeNull();
    });
  });

  describe("validationErrors", () => {
    it("reads every error: where it failed, what was said and what the check held", () => {
      expect(
        validationErrors(
          invalid([
            {
              type: "enum",
              loc: ["query", "person.role"],
              msg: "Input should be 'officer' or 'agent'",
              ctx: { expected: "'officer' or 'agent'" },
            },
            { type: "missing", loc: ["query", "q"], msg: "Field required" },
          ]),
        ),
      ).toEqual([
        {
          type: "enum",
          loc: ["query", "person.role"],
          msg: "Input should be 'officer' or 'agent'",
          ctx: { expected: "'officer' or 'agent'" },
        },
        {
          type: "missing",
          loc: ["query", "q"],
          msg: "Field required",
          ctx: null,
        },
      ]);
    });

    it("keeps a type it does not know, and reads a number in `loc` as text", () => {
      expect(
        validationErrors(
          invalid([{ type: "a_new_check", loc: ["query", 0], msg: "No." }]),
        ),
      ).toEqual([
        { type: "a_new_check", loc: ["query", "0"], msg: "No.", ctx: null },
      ]);
    });

    it("is empty for a refusal that is not a 422's, whatever it carries", () => {
      expect(
        validationErrors({
          code: 429,
          message: "slow down",
          uri: null,
          metadata: { reason: "rate_limited" },
        }),
      ).toEqual([]);
      expect(
        validationErrors({
          code: 429,
          message: "slow down",
          uri: null,
          metadata: null,
        }),
      ).toEqual([]);
    });
  });
});
