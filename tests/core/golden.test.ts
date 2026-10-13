import { describe, expect, it } from "vitest";

import {
  ContractViolation,
  parseErrorEnvelope,
  parseSuggestResponse,
  validationErrors,
  type ErrorEnvelope,
  type Route,
} from "@baselayer-sdk/autocomplete";

import { firstValidationMessage } from "../../src/core/wire";

import { faultsAgainst, responseSchema } from "./fixtures/contract";
import { golden, type GoldenName } from "./fixtures/golden";

// The files under `fixtures/golden/` are answers of the autocomplete service
// as its contract describes them, with made-up names and `<sealed token>` for
// every token. They are read here as a client reads a response, and held to
// the vendored contract itself, so a fixture that has drifted from the wire
// fails here first.
const ANSWERS = [
  ["businesses", "businesses"],
  ["businesses_filtered", "businesses"],
  ["people", "people"],
  ["addresses", "addresses"],
] as const satisfies readonly (readonly [GoldenName, Route])[];

const SEALED = "<sealed token>";

describe("the golden answers against the vendored contract", () => {
  it.each(ANSWERS)(
    "%s is a 200 the contract describes, with no key it does not declare",
    (name, route) => {
      expect(
        faultsAgainst(
          responseSchema(`/autocomplete/${route}`, 200),
          golden(name),
        ),
      ).toEqual([]);
    },
  );

  it("has invalid_request as the 422 the contract describes", () => {
    expect(
      faultsAgainst(
        responseSchema("/autocomplete/businesses", 422),
        golden("invalid_request"),
      ),
    ).toEqual([]);
  });

  describe("the check itself", () => {
    // A check that passes everything would make the tests above say nothing.
    const business = () => {
      const body = golden("businesses") as {
        suggestions: {
          related: { people: { items: Record<string, unknown>[] } };
        }[];
      } & Record<string, unknown>;
      return body;
    };
    const schema = responseSchema("/autocomplete/businesses", 200);

    it("finds a key the contract requires, left out", () => {
      const body = business();
      delete body.truncated;
      delete body.suggestions[0]!.related.people.items[0]!.matched;

      expect(faultsAgainst(schema, body)).toEqual([
        "$.truncated: required",
        "$.suggestions[0].related.people.items[0].matched: required",
      ]);
    });

    it("finds a key the contract does not declare, such as the draft's `held_as`", () => {
      const body = business();
      body.suggestions[0]!.related.people.items[0]!.held_as = "officer";

      expect(faultsAgainst(schema, body)).toEqual([
        "$.suggestions[0].related.people.items[0].held_as: not declared",
      ]);
    });

    it("finds a wrong type, a value outside an enum and a null that may not be", () => {
      const body = business();
      const item = body.suggestions[0]!.related.people.items[0]!;
      item.type = "parcel";
      item.label = null;
      body.found = "2";

      expect(faultsAgainst(schema, body)).toEqual([
        "$.found: expected integer",
        "$.suggestions[0].related.people.items[0].label: expected string",
        "$.suggestions[0].related.people.items[0].type: expected one of person",
      ]);
    });

    it("finds a null where the contract gives no null", () => {
      const body = golden("people") as {
        suggestions: {
          related: { businesses: { items: Record<string, unknown>[] } };
        }[];
      };
      body.suggestions[0]!.related.businesses.items[0]!.token = null;

      expect(
        faultsAgainst(responseSchema("/autocomplete/people", 200), body),
      ).toEqual([
        "$.suggestions[0].related.businesses.items[0].token: expected string",
      ]);
    });
  });
});

describe("decoding the golden answers", () => {
  it.each(ANSWERS)(
    "reads %s whole: nothing the contract lists is dropped, nothing is added",
    (name, route) => {
      expect(parseSuggestResponse(route, golden(name))).toStrictEqual(
        golden(name),
      );
    },
  );

  it.each(ANSWERS)("reads %s on its own route only", (name, route) => {
    const others = (["businesses", "people", "addresses"] as const).filter(
      other => other !== route,
    );
    for (const other of others) {
      expect(() => parseSuggestResponse(other, golden(name))).toThrow(
        ContractViolation,
      );
    }
  });

  describe("a business answer", () => {
    const { query, found, truncated, sources, suggestions } =
      parseSuggestResponse("businesses", golden("businesses"));
    const [ferry, tide] = suggestions;

    it("reads the answer's own keys", () => {
      expect({ query, found, truncated }).toEqual({
        query: "halcyon",
        found: 2,
        truncated: false,
      });
      expect(Object.keys(sources)).toEqual(["people", "addresses"]);
      expect(sources.people).toEqual({ status: "ok" });
    });

    it("reads the row: a structure where the filing has one, null where not", () => {
      expect(ferry).toMatchObject({
        type: "business",
        token: SEALED,
        label: "HALCYON FERRY WORKS LLC",
        matched_name: null,
        match: "strong",
        domicile_state: "DE",
        states: ["DE", "WA"],
        structure: "LLC",
      });
      expect(tide?.structure).toBeNull();
    });

    it("puts the role a person holds on `role`, and on nothing else", () => {
      const people = ferry!.related.people.items;

      expect(people.map(person => [person.label, person.role])).toEqual([
        ["Marisol Quennell", "officer"],
        ["Pell Harbor Registered Agents Inc", "agent"],
        ["Tobias Wren-Alder", "agent"],
      ]);
      for (const person of people) {
        // A person listed has no handle of its own, and no jurisdiction.
        expect(Object.keys(person).sort()).toEqual([
          "highlight",
          "label",
          "matched",
          "role",
          "type",
        ]);
      }
    });

    it("puts how a business filed an address on `listed_as`, the agent's office as `registered_office`", () => {
      const addresses = ferry!.related.addresses.items;

      expect(
        addresses.map(address => [address.label, address.listed_as]),
      ).toEqual([
        ["400 Lantern Ave, Wilmington, DE 19801", "principal"],
        ["12 Pier Road, Port Calder, WA 98300", "mailing"],
        ["7 Mill Race Way, Bracken, OR 97000", "registered_office"],
      ]);
      expect(
        tide!.related.addresses.items.map(address => address.listed_as),
      ).toEqual(["principal", "registered_office"]);
      for (const address of addresses) {
        expect(address).not.toHaveProperty("role");
        expect(address).not.toHaveProperty("token");
      }
    });

    it("reads each relation's count, and that nothing was filtered or cut", () => {
      expect(ferry!.related.people).toMatchObject({
        count: 3,
        matched: null,
        truncated: false,
      });
      expect(tide!.related.addresses).toMatchObject({
        count: 2,
        matched: null,
        truncated: false,
      });
    });
  });

  describe("a business answer a filter narrowed", () => {
    const [ferry, tide] = parseSuggestResponse(
      "businesses",
      golden("businesses_filtered"),
    ).suggestions;

    it("says how many items matched, and that the list was cut to them", () => {
      expect(ferry!.related.people).toMatchObject({
        count: 3,
        matched: 1,
        truncated: true,
      });
      expect(ferry!.related.people.items).toHaveLength(1);
      expect(ferry!.related.addresses).toMatchObject({
        count: 3,
        matched: 1,
        truncated: false,
      });
      expect(tide!.related.people).toMatchObject({
        matched: 1,
        truncated: true,
      });
    });

    it("marks the item a filter matched, with its parts, and leaves the rest without", () => {
      const [marisol] = ferry!.related.people.items;
      expect(marisol).toMatchObject({
        label: "Marisol Quennell",
        role: "officer",
        matched: true,
        highlight: [
          { text: "Marisol", matched: true },
          { text: " Quennell", matched: false },
        ],
      });
      const [pier, lantern, mill] = ferry!.related.addresses.items;
      expect(pier).toMatchObject({
        listed_as: "mailing",
        matched: true,
        highlight: [
          { text: "12 Pier", matched: true },
          { text: " Road, Port Calder, WA 98300", matched: false },
        ],
      });
      expect(lantern).toMatchObject({ matched: false, highlight: null });
      expect(mill).toMatchObject({ matched: false, highlight: null });
    });
  });

  describe("a person answer", () => {
    const { sources, suggestions } = parseSuggestResponse(
      "people",
      golden("people"),
    );
    const [marisol] = suggestions;

    it("reads the row: its own token and the states of the businesses it holds a role on", () => {
      expect(Object.keys(sources)).toEqual(["businesses", "addresses"]);
      expect(marisol).toMatchObject({
        type: "person",
        token: SEALED,
        label: "Marisol Quennell",
        match: "exact",
        states: ["DE", "WA"],
      });
      // A person has no `matched_name` and no jurisdiction of its own.
      expect(marisol).not.toHaveProperty("matched_name");
      expect(marisol).not.toHaveProperty("domicile_state");
    });

    it("lists the businesses with a token each, the role held on `role`", () => {
      const businesses = marisol!.related.businesses.items;

      expect(
        businesses.map(item => [item.label, item.token, item.role]),
      ).toEqual([
        ["HALCYON FERRY WORKS LLC", SEALED, "officer"],
        ["HALCYON TIDE PARTNERS LP", SEALED, "officer"],
      ]);
      expect(businesses[0]).toMatchObject({
        address: "400 Lantern Ave, Wilmington, DE 19801",
        domicile_state: "DE",
        states: ["DE", "WA"],
        matched_name: null,
        highlight: null,
      });
      for (const item of businesses) {
        expect(item).not.toHaveProperty("listed_as");
      }
    });

    it("lists the addresses with neither a token nor a role", () => {
      const addresses = marisol!.related.addresses.items;

      expect(addresses.map(item => item.label)).toEqual([
        "12 Pier Road, Port Calder, WA 98300",
        "400 Lantern Ave, Wilmington, DE 19801",
      ]);
      for (const item of addresses) {
        expect(Object.keys(item).sort()).toEqual([
          "highlight",
          "label",
          "matched",
          "type",
        ]);
      }
    });
  });

  describe("an address answer", () => {
    const { sources, suggestions } = parseSuggestResponse(
      "addresses",
      golden("addresses"),
    );
    const [pier] = suggestions;

    it("reads the row: its components, null where the filing carries none", () => {
      expect(Object.keys(sources)).toEqual(["businesses", "people"]);
      expect(pier).toMatchObject({
        type: "address",
        token: SEALED,
        label: "12 Pier Road, Port Calder, WA 98300",
        match: "exact",
        components: {
          line1: "12 Pier Road",
          line2: null,
          city: "Port Calder",
          state: "WA",
          postal_code: "98300",
        },
      });
      expect(pier).not.toHaveProperty("matched_name");
    });

    it("lists the businesses with a token each, how each filed the address on `listed_as`", () => {
      const businesses = pier!.related.businesses.items;

      expect(
        businesses.map(item => [item.label, item.token, item.listed_as]),
      ).toEqual([
        ["HALCYON TIDE PARTNERS LP", SEALED, "principal"],
        ["HALCYON FERRY WORKS LLC", SEALED, "mailing"],
      ]);
      for (const item of businesses) {
        expect(item).not.toHaveProperty("role");
      }
    });

    it("lists the people with neither a token nor a role", () => {
      const people = pier!.related.people.items;

      expect(people.map(item => item.label)).toEqual([
        "Marisol Quennell",
        "Tobias Wren-Alder",
      ]);
      for (const item of people) {
        expect(Object.keys(item).sort()).toEqual([
          "highlight",
          "label",
          "matched",
          "type",
        ]);
      }
    });
  });
});

describe("the 422 golden", () => {
  const envelope = parseErrorEnvelope(
    golden("invalid_request"),
  ) as ErrorEnvelope;

  it("parses as the catalog envelope", () => {
    expect(envelope).toEqual({
      code: 422,
      message: "The request is invalid.",
      uri: null,
      metadata: {
        reason: "request_invalid",
        errors: [
          {
            type: "enum",
            loc: ["query", "person.role"],
            msg: `Input should be 'officer' or 'agent', not "debtor"`,
            ctx: { expected: "'officer' or 'agent'" },
          },
        ],
      },
    });
  });

  it("names the parameter that failed, and what the check held", () => {
    expect(validationErrors(envelope)).toEqual([
      {
        type: "enum",
        loc: ["query", "person.role"],
        msg: `Input should be 'officer' or 'agent', not "debtor"`,
        ctx: { expected: "'officer' or 'agent'" },
      },
    ]);
  });

  it("says what failed first, not the envelope's own generic message", () => {
    expect(firstValidationMessage(envelope)).toBe(
      `Input should be 'officer' or 'agent', not "debtor"`,
    );
  });
});
