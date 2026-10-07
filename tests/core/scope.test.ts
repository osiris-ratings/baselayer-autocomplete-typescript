import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_SESSION_SCOPE,
  createAutocompleteClient,
  parseMintResponse,
  parseSessionScope,
  type FetchLike,
  type MintFunction,
} from "@baselayer-sdk/autocomplete";

const GRANT = {
  session_token: "grant-1",
  expires_in: 180,
  request_budget: 10,
  pivot_allowance: 5,
  filter_min_stem: 5,
};

const SCOPE = {
  routes: { businesses: ["addresses"], people: ["businesses"] },
  max_limit: 5,
};

describe("parseSessionScope", () => {
  it("reads the routes and the most rows, in the SDK's order", () => {
    expect(
      parseSessionScope({
        routes: {
          people: ["businesses", "addresses"],
          businesses: ["addresses", "people"],
        },
        max_limit: 20,
      }),
    ).toEqual({
      routes: {
        businesses: ["people", "addresses"],
        people: ["businesses", "addresses"],
      },
      maxLimit: 20,
    });
  });

  it("reads a camelCase scope, as an adapter's client may hand it over", () => {
    expect(
      parseSessionScope({ routes: { businesses: [] }, maxLimit: 3 }),
    ).toEqual({ routes: { businesses: [] }, maxLimit: 3 });
  });

  it("drops a route or a relation it does not know, which can only narrow", () => {
    expect(
      parseSessionScope({
        routes: {
          businesses: ["people", "vehicles", "people"],
          vehicles: ["businesses"],
          people: ["people", "businesses"],
        },
        max_limit: 10,
      }),
    ).toEqual({
      routes: { businesses: ["people"], people: ["businesses"] },
      maxLimit: 10,
    });
  });

  it("reads most rows past the SDK's 20 as 20, which can only narrow", () => {
    // An API that raised its cap must not take down an older SDK's typeahead.
    expect(
      parseSessionScope({ routes: { businesses: [] }, max_limit: 50 }),
    ).toEqual({ routes: { businesses: [] }, maxLimit: 20 });
    expect(
      parseSessionScope({ routes: { businesses: [] }, max_limit: 21 })
        ?.maxLimit,
    ).toBe(20);
  });

  it.each([
    ["not an object", "everything"],
    ["routes not an object", { routes: ["businesses"], max_limit: 5 }],
    [
      "relations not a list",
      { routes: { businesses: "people" }, max_limit: 5 },
    ],
    ["a relation not a string", { routes: { businesses: [3] }, max_limit: 5 }],
    ["no most rows", { routes: { businesses: [] } }],
    ["most rows of 0", { routes: { businesses: [] }, max_limit: 0 }],
    ["a negative most rows", { routes: { businesses: [] }, max_limit: -3 }],
    ["most rows not whole", { routes: { businesses: [] }, max_limit: 2.5 }],
    ["most rows as text", { routes: { businesses: [] }, max_limit: "5" }],
  ])("refuses a scope with %s", (_name, value) => {
    expect(parseSessionScope(value)).toBeNull();
  });
});

describe("the scope on a grant", () => {
  it("reads the scope the mint answers", () => {
    expect(
      parseMintResponse(201, null, { ...GRANT, scope: SCOPE }),
    ).toMatchObject({
      kind: "granted",
      grant: {
        scope: {
          routes: { businesses: ["addresses"], people: ["businesses"] },
          maxLimit: 5,
        },
      },
    });
  });

  it("carries no scope of its own when the mint answers none", () => {
    const outcome = parseMintResponse(201, null, GRANT);

    expect(outcome.kind).toBe("granted");
    expect(outcome.kind === "granted" && outcome.grant).not.toHaveProperty(
      "scope",
    );
  });

  it("refuses a grant whose scope is malformed, as it refuses any other bad grant", () => {
    expect(
      parseMintResponse(201, null, {
        ...GRANT,
        scope: { routes: {}, max_limit: 0 },
      }),
    ).toMatchObject({ kind: "refused", status: 201 });
  });

  it("grants a session whose most rows is past the SDK's, at the SDK's", () => {
    expect(
      parseMintResponse(201, null, {
        ...GRANT,
        scope: { routes: { businesses: [] }, max_limit: 99 },
      }),
    ).toMatchObject({
      kind: "granted",
      grant: { scope: { maxLimit: 20 } },
    });
  });

  it("reads a grant without a scope as businesses with people and addresses, and 20", async () => {
    expect(DEFAULT_SESSION_SCOPE).toEqual({
      routes: { businesses: ["people", "addresses"] },
      maxLimit: 20,
    });
    const client = createAutocompleteClient({
      baseUrl: "https://api.test",
      mint: async () => parseMintResponse(201, null, GRANT),
      fetch: vi.fn<FetchLike>(),
    });

    expect((await client.getSession()).scope).toEqual(DEFAULT_SESSION_SCOPE);
  });

  it("holds the session to the scope the mint answered", async () => {
    const mint: MintFunction = async () =>
      parseMintResponse(201, null, { ...GRANT, scope: SCOPE });
    const client = createAutocompleteClient({
      baseUrl: "https://api.test",
      mint,
      fetch: vi.fn<FetchLike>(),
    });

    expect((await client.getSession()).scope).toEqual({
      routes: { businesses: ["addresses"], people: ["businesses"] },
      maxLimit: 5,
    });
  });
});

describe("a grant kept in sessionStorage", () => {
  const store = new Map<string, string>();

  afterEach(() => {
    store.clear();
    vi.unstubAllGlobals();
  });

  it("reads one stored by a release without scopes as the default scope", async () => {
    vi.stubGlobal("location", { origin: "https://app.test" });
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
    });
    const now = Date.now();
    store.set(
      "bl.autocomplete.grant.v1",
      JSON.stringify({
        origin: "https://app.test",
        grant: {
          sessionToken: "stored-grant",
          expiresIn: 180,
          requestBudget: 10,
          pivotAllowance: 5,
          filterMinStem: 5,
          mintedAt: now,
          refreshAt: now + 144_000,
          expiresAt: now + 180_000,
        },
      }),
    );
    const mint = vi.fn<MintFunction>();
    const client = createAutocompleteClient({
      baseUrl: "https://api.test",
      mint,
      fetch: vi.fn<FetchLike>(),
      persistGrant: "sessionStorage",
    });

    const grant = await client.getSession();

    expect(mint).not.toHaveBeenCalled();
    expect(grant.sessionToken).toBe("stored-grant");
    expect(grant.scope).toEqual(DEFAULT_SESSION_SCOPE);
  });
});
