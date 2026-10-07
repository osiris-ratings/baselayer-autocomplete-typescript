import { describe, expect, it, vi, type Mock } from "vitest";

import {
  ContractViolation,
  ENTITY_OF,
  RELATION_OF,
  ROUTES,
  buildBusinessesUrl,
  buildSuggestUrl,
  createAutocompleteClient,
  parseBusinessesResponse,
  parseSuggestResponse,
  type FetchLike,
  type MintFunction,
  type RequestEvent,
  type ResponseLike,
} from "@baselayer-sdk/autocomplete";

// Rows for every route: businesses, and the people and addresses that lead to
// them.
const related = (count: number | null) => ({
  count,
  matched: null,
  truncated: false,
  items: [],
});

const envelope = (sources: string[], suggestions: unknown[]) => ({
  query: "q",
  found: suggestions.length,
  found_capped: false,
  truncated: false,
  sources: Object.fromEntries(sources.map(s => [s, { status: "ok" }])),
  suggestions,
});

const base = (type: string, relations: string[]) => ({
  type,
  token: `tok-${type}`,
  label: "Label",
  matched_name: null,
  match: "strong",
  related: Object.fromEntries(relations.map(r => [r, related(0)])),
  highlight: [{ text: "Label", matched: true }],
});

describe("the entity model", () => {
  it("pairs every entity type with its relation, both ways", () => {
    for (const [type, relation] of Object.entries(RELATION_OF)) {
      expect(ENTITY_OF[relation as keyof typeof ENTITY_OF]).toBe(type);
    }
  });

  it("serves every route, each with its include set and default", () => {
    expect(Object.keys(ROUTES)).toEqual(["businesses", "people", "addresses"]);
    expect(
      Object.entries(ROUTES)
        .filter(([, route]) => route.served)
        .map(([relation]) => relation),
    ).toEqual(["businesses", "people", "addresses"]);
    expect(ROUTES.businesses.includes).toEqual(["people", "addresses"]);
    expect(ROUTES.people.includes).toEqual(["businesses", "addresses"]);
    expect(ROUTES.people.defaultInclude).toEqual(["businesses"]);
    expect(ROUTES.addresses.includes).toEqual(["businesses", "people"]);
    expect(ROUTES.addresses.defaultInclude).toEqual(["businesses"]);
  });
});

describe("parseSuggestResponse", () => {
  it("reads a person row with the people route's relations", () => {
    const relations = ["businesses", "addresses"];
    const parsed = parseSuggestResponse(
      "people",
      envelope(relations, [base("person", relations)]),
    );
    expect(parsed.suggestions[0]!.type).toBe("person");
    expect(Object.keys(parsed.suggestions[0]!.related).sort()).toEqual(
      [...relations].sort(),
    );
    expect(Object.keys(parsed.sources).sort()).toEqual([...relations].sort());
  });

  it("reads an address row's components", () => {
    const relations = ["businesses", "people"];
    const row = {
      ...base("address", relations),
      components: {
        line1: "1200 River Rd",
        line2: null,
        city: "Pittsburgh",
        state: "PA",
        postal_code: "15212",
      },
    };
    const parsed = parseSuggestResponse(
      "addresses",
      envelope(relations, [row]),
    );
    expect(parsed.suggestions[0]!.components).toEqual(row.components);
  });

  it("refuses a row of another type on a route", () => {
    const relations = ["businesses", "addresses"];
    expect(() =>
      parseSuggestResponse(
        "people",
        envelope(relations, [base("business", relations)]),
      ),
    ).toThrow(ContractViolation);
  });

  it("drops fields it has never seen", () => {
    const relations = ["businesses", "addresses"];
    const row = {
      ...base("person", relations),
      a_field_from_a_later_release: true,
    };
    const parsed = parseSuggestResponse("people", envelope(relations, [row]));
    expect(parsed.suggestions[0]).not.toHaveProperty(
      "a_field_from_a_later_release",
    );
  });

  it("is what parseBusinessesResponse is, for businesses", () => {
    const relations = ["people", "addresses"];
    const body = envelope(relations, [
      { ...base("business", relations), domicile_state: "DE", states: ["DE"] },
    ]);
    expect(parseSuggestResponse("businesses", body)).toEqual(
      parseBusinessesResponse(body),
    );
  });
});

describe("buildSuggestUrl", () => {
  it("builds a businesses URL exactly as buildBusinessesUrl does", () => {
    const query = {
      q: "harbor concrete",
      limit: 5,
      include: ["people" as const],
      filters: {
        state: ["PA", "OH"],
        domicileState: "PA",
        person: { name: "dana", role: "officer" as const },
        address: {
          text: "1200 river",
          city: "Pittsburgh",
          postalCode: "15212",
          state: "PA",
        },
      },
    };
    expect(buildSuggestUrl("https://api.test", "businesses", query)).toBe(
      buildBusinessesUrl("https://api.test", query),
    );
  });

  it("sends the people route's business state, comma list joined", () => {
    const url = new URL(
      buildSuggestUrl("https://api.test/", "people", {
        q: "tim",
        include: ["businesses", "addresses"],
        filters: { business: { state: ["CA", "DE"] } },
      }),
    );
    expect(url.pathname).toBe("/autocomplete/people");
    expect([...url.searchParams]).toEqual([
      ["q", "tim"],
      ["include", "businesses,addresses"],
      ["business.state", "CA,DE"],
    ]);
  });
});

describe("client.search", () => {
  it("asks the route it is given and parses its rows", async () => {
    const relations = ["businesses", "addresses"];
    const fetch: Mock<FetchLike> = vi.fn<FetchLike>(
      async (): Promise<ResponseLike> => ({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => envelope(relations, [base("person", relations)]),
      }),
    );
    const mint: MintFunction = async () => ({
      kind: "granted",
      grant: {
        sessionToken: "grant-1",
        expiresIn: 600,
        requestBudget: 30,
        pivotAllowance: 5,
        filterMinStem: 3,
      },
    });
    const client = createAutocompleteClient({
      baseUrl: "https://api.test",
      mint,
      fetch,
    });
    const events: RequestEvent[] = [];
    client.on("request", event => events.push(event));
    const result = await client.search("people", { q: "tim cook" });
    expect(new URL(fetch.mock.calls[0]![0]).pathname).toBe(
      "/autocomplete/people",
    );
    expect(result.response.suggestions[0]!.type).toBe("person");
    expect(events[0]!.relation).toBe("people");
  });

  it("keeps suggest as the businesses search", async () => {
    const relations = ["people", "addresses"];
    const fetch = vi.fn<FetchLike>(async (): Promise<ResponseLike> => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () =>
        envelope(relations, [
          {
            ...base("business", relations),
            domicile_state: "DE",
            states: ["DE"],
          },
        ]),
    }));
    const mint: MintFunction = async () => ({
      kind: "granted",
      grant: {
        sessionToken: "grant-1",
        expiresIn: 600,
        requestBudget: 30,
        pivotAllowance: 5,
        filterMinStem: 3,
      },
    });
    const client = createAutocompleteClient({
      baseUrl: "https://api.test",
      mint,
      fetch,
    });
    await client.suggest({ q: "cinder" });
    expect(new URL(fetch.mock.calls[0]![0]).pathname).toBe(
      "/autocomplete/businesses",
    );
  });
});
