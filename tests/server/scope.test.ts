import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi, type Mock } from "vitest";

import { MAX_LIMIT } from "@baselayer-sdk/autocomplete";

import {
  MAX_SCOPE_LIMIT,
  SCOPE_RELATIONS,
  createMintHandler,
  mintForOrigin,
  type SessionScopeRequest,
} from "../../src/server";

const API = "https://api.test";
const PAGE = "https://app.example.com";

type FetchMock = Mock<typeof fetch>;

function api(): FetchMock {
  return vi.fn<typeof fetch>(
    async () =>
      new Response(JSON.stringify({ session_token: "t" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
  );
}

function sent(fetchImpl: FetchMock) {
  const [, init] = fetchImpl.mock.calls[0]!;
  return {
    headers: new Headers(init?.headers),
    body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
  };
}

describe("the server's copy of the scope contract", () => {
  it("names exactly the contract's routes and the relations each may carry", () => {
    const contract = JSON.parse(
      readFileSync(
        join(__dirname, "../../contracts/autocomplete-scope.json"),
        "utf8",
      ),
    ) as { legal_relations: Record<string, string[]> };
    const sorted = (table: Record<string, readonly string[]>) =>
      Object.fromEntries(
        Object.entries(table)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([route, relations]) => [route, [...relations].sort()]),
      );

    expect(sorted(SCOPE_RELATIONS)).toEqual(sorted(contract.legal_relations));
  });

  it("caps the rows where the core does", () => {
    expect(MAX_SCOPE_LIMIT).toBe(MAX_LIMIT);
  });
});

describe("mintForOrigin with a scope", () => {
  it("asks for the scope in the body, as the API spells it", async () => {
    const fetchImpl = api();

    await mintForOrigin({
      apiKey: "key-1",
      origin: PAGE,
      apiBaseUrl: API,
      fetch: fetchImpl,
      scope: {
        routes: { businesses: ["addresses"], people: ["businesses"] },
        maxLimit: 5,
      },
    });

    const { headers, body } = sent(fetchImpl);
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(body).toEqual({
      scope: {
        routes: { businesses: ["addresses"], people: ["businesses"] },
        max_limit: 5,
      },
    });
  });

  it("leaves out the half the caller leaves out", async () => {
    const onlyRoutes = api();
    const onlyLimit = api();

    await mintForOrigin({
      apiKey: "key-1",
      origin: PAGE,
      fetch: onlyRoutes,
      scope: { routes: { businesses: [] } },
    });
    await mintForOrigin({
      apiKey: "key-1",
      origin: PAGE,
      fetch: onlyLimit,
      scope: { maxLimit: 3 },
    });

    expect(sent(onlyRoutes).body).toEqual({
      scope: { routes: { businesses: [] } },
    });
    expect(sent(onlyLimit).body).toEqual({ scope: { max_limit: 3 } });
  });

  it("sends no body without a scope, as an API from before scopes expects", async () => {
    const fetchImpl = api();

    await mintForOrigin({ apiKey: "key-1", origin: PAGE, fetch: fetchImpl });

    const { headers, body } = sent(fetchImpl);
    expect(body).toBeUndefined();
    expect(headers.has("Content-Type")).toBe(false);
  });

  it.each([
    ["names no route", { routes: {} }],
    ["asks for no rows", { maxLimit: 0 }],
    ["asks for more than 20 rows", { maxLimit: 21 }],
    ["asks for part of a row", { maxLimit: 2.5 }],
  ] as [string, SessionScopeRequest][])(
    "refuses, before calling the API, a scope that %s",
    async (_name, scope) => {
      const fetchImpl = api();

      await expect(
        mintForOrigin({
          apiKey: "key-1",
          origin: PAGE,
          fetch: fetchImpl,
          scope,
        }),
      ).rejects.toThrow("mintForOrigin: scope");
      expect(fetchImpl).not.toHaveBeenCalled();
    },
  );

  it("types each route's relations as the ones its rows may carry", () => {
    const narrow: SessionScopeRequest = {
      routes: { addresses: ["businesses"] },
    };
    const wrong: SessionScopeRequest = {
      // @ts-expect-error: a person row carries no people.
      routes: { people: ["people"] },
    };
    const unknown: SessionScopeRequest = {
      // @ts-expect-error: there is no vehicles route.
      routes: { vehicles: ["businesses"] },
    };

    expect([narrow, wrong, unknown]).toHaveLength(3);
  });
});

describe("createMintHandler with a scope", () => {
  const request = () =>
    new Request("https://merchant.example.com/api/session", {
      method: "POST",
      headers: { Origin: PAGE },
    });

  it("asks every mint for the scope it was given", async () => {
    const fetchImpl = api();
    const handler = createMintHandler({
      apiKey: "key-1",
      apiBaseUrl: API,
      fetch: fetchImpl,
      scope: { routes: { businesses: ["people"] }, maxLimit: 10 },
    });

    await handler(request());

    expect(sent(fetchImpl).body).toEqual({
      scope: { routes: { businesses: ["people"] }, max_limit: 10 },
    });
  });

  it("asks a function for the scope of each request", async () => {
    const fetchImpl = api();
    const scopeOf = vi.fn(async (incoming: Request) =>
      incoming.headers.get("Origin") === PAGE
        ? { routes: { people: ["businesses" as const] } }
        : undefined,
    );
    const handler = createMintHandler({
      apiKey: "key-1",
      apiBaseUrl: API,
      fetch: fetchImpl,
      scope: scopeOf,
    });

    await handler(request());

    expect(scopeOf).toHaveBeenCalledTimes(1);
    expect(sent(fetchImpl).body).toEqual({
      scope: { routes: { people: ["businesses"] } },
    });
  });

  it("mints without a body when the function answers none", async () => {
    const fetchImpl = api();
    const handler = createMintHandler({
      apiKey: "key-1",
      apiBaseUrl: API,
      fetch: fetchImpl,
      scope: () => undefined,
    });

    await handler(request());

    expect(sent(fetchImpl).body).toBeUndefined();
  });
});
