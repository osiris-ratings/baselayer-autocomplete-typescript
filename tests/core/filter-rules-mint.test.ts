import { describe, expect, it, vi } from "vitest";

import {
  createAutocompleteClient,
  parseMintResponse,
  type FetchLike,
  type MintedGrant,
  type ResponseLike,
} from "@baselayer-sdk/autocomplete";

import { golden } from "./fixtures/golden";

// The per-route rules a session may carry, and what the client does with them.
// A session without them (an older API) falls back to today's rules.

const GRANT = {
  session_token: "grant-1",
  expires_in: 180,
  request_budget: 150,
  pivot_allowance: 5,
  filter_min_stem: 5,
};

const RULES = {
  businesses: {
    min_stem: 3,
    count: "stem",
    gated: ["state", "person.name"],
    short_allowed_with: [],
  },
  people: {
    min_stem: 4,
    count: "person_name",
    gated: ["business.state", "business.name", "address.text"],
    short_allowed_with: ["business.name"],
  },
};

function grantOf(body: object): MintedGrant {
  const outcome = parseMintResponse(201, null, { ...GRANT, ...body });
  if (outcome.kind !== "granted") throw new Error("expected a grant");
  return outcome.grant;
}

describe("a session's filter rules", () => {
  it("are read for the routes the session names, in snake_case", () => {
    const grant = grantOf({ filter_rules: RULES, min_query_chars: 2 });

    expect(grant.filterRules).toEqual({
      businesses: {
        minStem: 3,
        count: "stem",
        gated: ["state", "person.name"],
        shortAllowedWith: [],
      },
      people: {
        minStem: 4,
        count: "person_name",
        gated: ["business.state", "business.name", "address.text"],
        shortAllowedWith: ["business.name"],
      },
    });
    expect(grant.minQueryChars).toBe(2);
    expect(grant.filterRules?.addresses).toBeUndefined();
  });

  it("are read in camelCase too", () => {
    const grant = grantOf({
      filterRules: {
        addresses: {
          minStem: 3,
          count: "stem",
          gated: ["state"],
          shortAllowedWith: [],
        },
      },
      minQueryChars: 2,
    });

    expect(grant.filterRules?.addresses?.minStem).toBe(3);
    expect(grant.minQueryChars).toBe(2);
  });

  it("are absent from a grant of an API that sends none", () => {
    const grant = grantOf({});

    expect(grant).not.toHaveProperty("filterRules");
    expect(grant).not.toHaveProperty("minQueryChars");
  });

  it.each([
    ["not an object", "soon"],
    ["an array", []],
    ["null", null],
  ])("are ignored, the grant kept, when they are %s", (_, value) => {
    const grant = grantOf({ filter_rules: value });

    expect(grant.filterMinStem).toBe(5);
    expect(grant).not.toHaveProperty("filterRules");
  });

  it.each([
    [
      "a stem that is not a positive integer",
      { ...RULES.businesses, min_stem: 0 },
    ],
    ["a count it does not know", { ...RULES.businesses, count: "soundex" }],
    [
      "gated filters that are not a list of names",
      { ...RULES.businesses, gated: 7 },
    ],
    [
      "a list of names that are not strings",
      { ...RULES.businesses, short_allowed_with: [1] },
    ],
  ])("drop only the route with %s, and the grant is kept", (_, bad) => {
    const grant = grantOf({
      filter_rules: { businesses: bad, people: RULES.people },
    });

    expect(grant.filterRules?.businesses).toBeUndefined();
    expect(grant.filterRules?.people?.minStem).toBe(4);
  });

  it("take every filter as gated when the session says `all`", () => {
    const grant = grantOf({
      filter_rules: {
        addresses: {
          min_stem: 3,
          count: "stem",
          gated: "all",
          short_allowed_with: [],
        },
      },
    });

    expect(grant.filterRules?.addresses?.gated).toBe("all");
  });

  it("let a missing short_allowed_with mean none", () => {
    const grant = grantOf({
      filter_rules: {
        businesses: { min_stem: 3, count: "stem", gated: ["state"] },
      },
    });

    expect(grant.filterRules?.businesses?.shortAllowedWith).toEqual([]);
  });
});

function reply(body: unknown): ResponseLike {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => body,
  };
}

function clientWith(body: object) {
  const fetch = vi.fn<FetchLike>(async url =>
    reply(
      golden(
        url.includes("/autocomplete/people")
          ? "people"
          : url.includes("/autocomplete/addresses")
            ? "addresses"
            : "businesses",
      ),
    ),
  );
  const client = createAutocompleteClient({
    baseUrl: "https://api.test",
    fetch,
    mint: async () => ({
      kind: "granted",
      grant: {
        ...grantOf({
          ...body,
          scope: {
            routes: {
              businesses: ["people", "addresses"],
              people: ["businesses", "addresses"],
              addresses: ["businesses", "people"],
            },
            max_limit: 20,
          },
        }),
      },
    }),
  });
  return { client, fetch };
}

describe("the client, with a session that carries rules", () => {
  it("reads each route's own stem, not the grant's strictest", async () => {
    const { client, fetch } = clientWith({ filter_rules: RULES });

    const sent = await client.search("businesses", {
      q: "hal",
      filters: { state: ["DE"] },
    });
    const waiting = await client.search("people", {
      q: "mar",
      filters: { business: { state: ["DE"] } },
    });

    expect(sent.filtersWaiting).toBe(false);
    expect(waiting.filtersWaiting).toBe(true);
    expect(waiting.charsNeeded).toBe(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("holds only the filters the rule gates", async () => {
    const { client, fetch } = clientWith({ filter_rules: RULES });

    const ungated = await client.search("businesses", {
      q: "ha",
      filters: { address: { text: "1200 tallowmere" } },
    });
    const gated = await client.search("businesses", {
      q: "ha",
      filters: { person: { name: "dana" } },
    });

    expect(ungated.filtersWaiting).toBe(false);
    expect(gated.filtersWaiting).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("falls back to today's rules and the grant's stem for a route the rules leave out", async () => {
    const { client, fetch } = clientWith({ filter_rules: RULES });

    const waiting = await client.search("addresses", {
      q: "1200",
      filters: { state: ["DE"] },
    });

    expect(waiting.filtersWaiting).toBe(true);
    expect(waiting.charsNeeded).toBe(1);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("lets a short name through beside the business name the rule names", async () => {
    const { client, fetch } = clientWith({ filter_rules: RULES });

    const result = await client.search("people", {
      q: "tim",
      filters: { business: { name: "osiris" } },
    });

    expect(result.filtersWaiting).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("follows a lowered stem with no release: the session says 3, the client asks at 3", async () => {
    const { client } = clientWith({
      filter_rules: {
        businesses: {
          min_stem: 3,
          count: "stem",
          gated: "all",
          short_allowed_with: [],
        },
      },
      filter_min_stem: 3,
    });

    expect(
      (
        await client.search("businesses", {
          q: "hal",
          filters: { state: ["DE"] },
        })
      ).filtersWaiting,
    ).toBe(false);
  });

  it("behaves as before against an API that sends no rules", async () => {
    const { client, fetch } = clientWith({});

    const waiting = await client.search("businesses", {
      q: "halc",
      filters: { state: ["DE"] },
    });
    const sent = await client.search("businesses", {
      q: "halcy",
      filters: { state: ["DE"] },
    });

    expect(waiting.filtersWaiting).toBe(true);
    expect(waiting.charsNeeded).toBe(1);
    expect(sent.filtersWaiting).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
