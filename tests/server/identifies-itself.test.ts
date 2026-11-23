import { readFileSync } from "node:fs";

import { describe, expect, it, vi, type Mock } from "vitest";

import { createMintHandler, mintForOrigin } from "../../src/server";

// The mint says which SDK makes it, in `User-Agent` (the usual place on a
// server) and in `X-Baselayer-Client` (the header the browser client sends),
// and sends nothing else it did not before.

const API = "https://api.test";
const PAGE = "https://app.example.com";
const { version } = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
) as { version: string };

// Spelled out, not taken from the SDK's constants, so a change to either is a
// change to this test.
const PRODUCT = `baselayer-autocomplete-typescript/${version}`;

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
  const [input, init] = fetchImpl.mock.calls[0]!;
  return {
    url: String(input),
    init,
    headers: new Headers(init?.headers),
    names: [...new Headers(init?.headers).keys()].sort(),
  };
}

describe("the mint's request", () => {
  it("names the SDK and its version in User-Agent and in X-Baselayer-Client", async () => {
    const fetchImpl = api();

    await mintForOrigin({
      apiKey: "key-1",
      origin: PAGE,
      apiBaseUrl: API,
      fetch: fetchImpl,
    });

    const { headers } = sent(fetchImpl);
    expect(headers.get("X-Baselayer-Client")).toBe(PRODUCT);
    // The runtime's own token follows: whatever runs the tests says what it is.
    expect(headers.get("User-Agent")).toMatch(
      new RegExp(`^${PRODUCT.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")} \\S+`),
    );
  });

  it("is otherwise the request it was: same URL, method and headers, no body", async () => {
    const fetchImpl = api();

    await mintForOrigin({
      apiKey: "key-1",
      origin: PAGE,
      apiBaseUrl: API,
      fetch: fetchImpl,
    });

    const { url, init, headers, names } = sent(fetchImpl);
    expect(url).toBe("https://api.test/autocomplete/sessions");
    expect(init?.method).toBe("POST");
    expect(init?.body).toBeUndefined();
    expect(Object.keys(init ?? {}).sort()).toEqual(["headers", "method"]);
    expect(names).toEqual([
      "accept",
      "origin",
      "user-agent",
      "x-api-key",
      "x-baselayer-client",
    ]);
    expect(headers.get("Accept")).toBe("application/json");
    expect(headers.get("X-API-Key")).toBe("key-1");
    expect(headers.get("Origin")).toBe(PAGE);
  });

  it("keeps the scope's body and Content-Type, and adds nothing to them", async () => {
    const fetchImpl = api();

    await mintForOrigin({
      apiKey: "key-1",
      origin: PAGE,
      apiBaseUrl: API,
      fetch: fetchImpl,
      scope: { routes: { people: ["businesses"] }, maxLimit: 5 },
    });

    const { init, headers, names } = sent(fetchImpl);
    expect(names).toEqual([
      "accept",
      "content-type",
      "origin",
      "user-agent",
      "x-api-key",
      "x-baselayer-client",
    ]);
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(JSON.parse(String(init?.body))).toEqual({
      scope: { routes: { people: ["businesses"] }, max_limit: 5 },
    });
    expect(headers.get("X-Baselayer-Client")).toBe(PRODUCT);
  });

  it("is the same through createMintHandler", async () => {
    const fetchImpl = api();
    const handler = createMintHandler({
      apiKey: "key-1",
      apiBaseUrl: API,
      fetch: fetchImpl,
    });

    const response = await handler(
      new Request("https://app.example.com/api/ac-session", {
        method: "POST",
        headers: { Origin: PAGE },
      }),
    );

    expect(response.status).toBe(201);
    const { headers, names } = sent(fetchImpl);
    expect(headers.get("X-Baselayer-Client")).toBe(PRODUCT);
    expect(headers.get("User-Agent")).toContain(PRODUCT);
    expect(names).toEqual([
      "accept",
      "origin",
      "user-agent",
      "x-api-key",
      "x-baselayer-client",
    ]);
  });
});
