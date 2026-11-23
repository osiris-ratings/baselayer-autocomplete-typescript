import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it, vi, type Mock } from "vitest";

import {
  createAutocompleteClient,
  type AutocompleteClient,
  type FetchLike,
  type MintFunction,
  type MintedGrant,
  type ResponseLike,
  type Route,
  type SessionScope,
} from "@baselayer-sdk/autocomplete";

import { golden, type GoldenName } from "./fixtures/golden";

// Every suggest request names the SDK and its version in `X-Baselayer-Client`,
// and sends nothing else it did not before: the autocomplete service answers
// CORS for a fixed list of request headers, so a header it does not know
// fails the preflight and with it every search.

const BASE_URL = "https://api.test";
const { version } = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
) as { version: string };

// Spelled out here, not taken from the SDK's own constants, so a change to
// either is a change to this test.
const HEADER = "X-Baselayer-Client";
const PRODUCT = `baselayer-autocomplete-typescript/${version}`;

/** What a request on the SDK's suggest path carried before the header. */
const BEFORE = ["Accept", "X-Autocomplete-Session"];

type FetchMock = Mock<FetchLike>;

const everyRoute: SessionScope = {
  routes: {
    businesses: ["people", "addresses"],
    people: ["businesses", "addresses"],
    addresses: ["businesses", "people"],
  },
  maxLimit: 20,
};

function granted(token: string): MintedGrant {
  return {
    sessionToken: token,
    expiresIn: 600,
    requestBudget: 150,
    pivotAllowance: 6,
    filterMinStem: 3,
    scope: everyRoute,
  };
}

function answer(name: GoldenName): ResponseLike {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => golden(name),
  };
}

const clients: AutocompleteClient[] = [];

function setup(name: GoldenName) {
  const fetchImpl: FetchMock = vi.fn<FetchLike>(async () => answer(name));
  let minted = 0;
  const mint = vi.fn<MintFunction>(async () => {
    minted += 1;
    return { kind: "granted", grant: granted(`grant-${minted}`) };
  });
  const client = createAutocompleteClient({
    baseUrl: BASE_URL,
    mint,
    fetch: fetchImpl,
  });
  clients.push(client);
  return { client, fetchImpl };
}

function sentAt(fetchImpl: FetchMock, call = 0) {
  const args = fetchImpl.mock.calls[call];
  if (args === undefined) {
    throw new Error(`fetch was not called ${call + 1} times`);
  }
  const [url, init] = args;
  return { url, init };
}

afterEach(() => {
  clients.splice(0).forEach(client => client.reset());
});

const ROUTES: readonly [Route, GoldenName][] = [
  ["businesses", "businesses"],
  ["people", "people"],
  ["addresses", "addresses"],
];

describe("the header a suggest request carries", () => {
  it.each(ROUTES)("is on a %s request", async (route, name) => {
    const { client, fetchImpl } = setup(name);

    await client.search(route, { q: "cind" });

    const { url, init } = sentAt(fetchImpl);
    expect(url).toBe(`${BASE_URL}/autocomplete/${route}?q=cind`);
    expect(init.headers[HEADER]).toBe(PRODUCT);
  });

  it("is on a business request made through `suggest`", async () => {
    const { client, fetchImpl } = setup("businesses");

    await client.suggest({ q: "cind", limit: 5 });

    expect(sentAt(fetchImpl).init.headers[HEADER]).toBe(PRODUCT);
  });

  it("is on every request of a session, not the first only", async () => {
    const { client, fetchImpl } = setup("businesses");

    await client.suggest({ q: "cind" });
    await client.suggest({ q: "cinder" });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sentAt(fetchImpl, 0).init.headers[HEADER]).toBe(PRODUCT);
    expect(sentAt(fetchImpl, 1).init.headers[HEADER]).toBe(PRODUCT);
  });
});

describe("what else a suggest request carries", () => {
  it.each(ROUTES)(
    "is what it was on a %s request: the same URL, the same init, the same other headers",
    async (route, name) => {
      const { client, fetchImpl } = setup(name);

      await client.search(route, { q: "cind", limit: 5 });

      const { url, init } = sentAt(fetchImpl);
      expect(url).toBe(`${BASE_URL}/autocomplete/${route}?q=cind&limit=5`);
      // No method (a GET), no body, no cache or mode: the init is these two
      // keys, as it has been since 0.1.0.
      expect(Object.keys(init).sort()).toEqual(["credentials", "headers"]);
      expect(init.credentials).toBe("omit");
      // The headers are what they were, and the one new header.
      expect(Object.keys(init.headers).sort()).toEqual(
        [...BEFORE, HEADER].sort(),
      );
      expect(init.headers).toEqual({
        Accept: "application/json",
        "X-Autocomplete-Session": "grant-1",
        [HEADER]: PRODUCT,
      });
    },
  );

  it("keeps the caller's signal, and still only adds the signal key", async () => {
    const { client, fetchImpl } = setup("businesses");
    const controller = new AbortController();

    await client.suggest({ q: "cind" }, { signal: controller.signal });

    const { init } = sentAt(fetchImpl);
    expect(Object.keys(init).sort()).toEqual([
      "credentials",
      "headers",
      "signal",
    ]);
    expect(init.signal).toBe(controller.signal);
  });
});
