import { describe, expect, it, vi, type Mock } from "vitest";

import { MINT_DAY_SCOPE } from "@baselayer-sdk/autocomplete";

import {
  DEFAULT_API_BASE_URL,
  SESSIONS_PATH,
  createMintHandler,
  mintForOrigin,
} from "../../src/server";

const API = "https://api.test";
const PAGE = "https://app.example.com";
const MINT_ENDPOINT = "https://merchant.example.com/api/autocomplete-session";

type FetchMock = Mock<typeof fetch>;

const granted = {
  session_token: "eyJhbGciOiJFZERTQSJ9.e30.sig",
  expires_in: 900,
  expires_at: "2026-09-23T12:15:00Z",
  request_budget: 150,
  pivot_allowance: 6,
  filter_min_stem: 3,
};

const daySpent = {
  code: 429,
  message: "The organization's autocomplete sessions for today are spent",
  uri: null,
  metadata: { scope: MINT_DAY_SCOPE, reason: "rate_limited" },
};

/** A fetch that answers every call with a fresh copy of one reply. */
function api(
  status: number,
  body: string | object | null,
  headers: Record<string, string> = {},
): FetchMock {
  return vi.fn<typeof fetch>(
    async () =>
      new Response(
        body === null || typeof body === "string" ? body : JSON.stringify(body),
        { status, headers: { "Content-Type": "application/json", ...headers } },
      ),
  );
}

function sentAt(fetchImpl: FetchMock, call = 0) {
  const args = fetchImpl.mock.calls[call];
  if (args === undefined) {
    throw new Error(`fetch was not called ${call + 1} times`);
  }
  const [input, init] = args;
  return {
    url: String(input),
    init,
    headers: new Headers(init?.headers),
  };
}

function pageRequest(
  init: { method?: string; headers?: Record<string, string> } = {},
): Request {
  return new Request(MINT_ENDPOINT, {
    method: init.method ?? "POST",
    headers: init.headers ?? { Origin: PAGE },
  });
}

describe("mintForOrigin", () => {
  it("posts to the sessions route with the key and the page's Origin", async () => {
    const fetchImpl = api(201, granted);

    await mintForOrigin({
      apiKey: "key-1",
      origin: PAGE,
      apiBaseUrl: `${API}/`,
      fetch: fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const { url, init, headers } = sentAt(fetchImpl);
    expect(url).toBe(`${API}${SESSIONS_PATH}`);
    expect(url).toBe("https://api.test/autocomplete/sessions");
    expect(init?.method).toBe("POST");
    expect(headers.get("X-API-Key")).toBe("key-1");
    expect(headers.get("Origin")).toBe(PAGE);
    expect(headers.get("Accept")).toBe("application/json");
    expect(init?.credentials).not.toBe("include");
  });

  it("defaults to the production API", async () => {
    const fetchImpl = api(201, granted);

    await mintForOrigin({ apiKey: "key-1", origin: PAGE, fetch: fetchImpl });

    expect(sentAt(fetchImpl).url).toBe(
      `${DEFAULT_API_BASE_URL}/autocomplete/sessions`,
    );
  });

  it("passes the caller's signal through", async () => {
    const fetchImpl = api(201, granted);
    const controller = new AbortController();

    await mintForOrigin({
      apiKey: "key-1",
      origin: PAGE,
      apiBaseUrl: API,
      fetch: fetchImpl,
      signal: controller.signal,
    });

    expect(sentAt(fetchImpl).init?.signal).toBe(controller.signal);
  });

  it.each<[string, number, object, Record<string, string>]>([
    ["a grant", 201, granted, { "X-Request-ID": "req-1" }],
    [
      "an invalid key",
      401,
      { code: 28, message: "Invalid API key", uri: null, metadata: null },
      {},
    ],
    [
      "an organization that is not enrolled",
      403,
      {
        code: 403,
        message: "Autocomplete is not enabled",
        uri: null,
        metadata: null,
      },
      {},
    ],
    ["a spent day, with its wait", 429, daySpent, { "Retry-After": "3600" }],
    [
      "a deployment that cannot mint",
      503,
      {
        code: 481,
        message: "Autocomplete sessions are not configured",
        uri: null,
        metadata: null,
      },
      {},
    ],
  ])("passes %s through unchanged", async (_, status, body, headers) => {
    const fetchImpl = api(status, body, headers);

    const result = await mintForOrigin({
      apiKey: "key-1",
      origin: PAGE,
      apiBaseUrl: API,
      fetch: fetchImpl,
    });

    expect(result.status).toBe(status);
    expect(result.body).toEqual(body);
    expect(result.headers).toEqual({
      "Content-Type": "application/json",
      ...headers,
    });
  });

  it("drops every response header but Retry-After and X-Request-ID", async () => {
    const fetchImpl = api(429, daySpent, {
      "Retry-After": "3600",
      "X-Request-ID": "req-2",
      "Set-Cookie": "api_session=secret",
      "X-Internal-Trace": "shard-4",
    });

    const result = await mintForOrigin({
      apiKey: "key-1",
      origin: PAGE,
      apiBaseUrl: API,
      fetch: fetchImpl,
    });

    expect(result.headers).toEqual({
      "Content-Type": "application/json",
      "Retry-After": "3600",
      "X-Request-ID": "req-2",
    });
  });

  it("reads a body that is not JSON, or no body, as null", async () => {
    const html = await mintForOrigin({
      apiKey: "key-1",
      origin: PAGE,
      apiBaseUrl: API,
      fetch: api(502, "<html>Bad Gateway</html>"),
    });
    expect(html).toMatchObject({ status: 502, body: null });

    const empty = await mintForOrigin({
      apiKey: "key-1",
      origin: PAGE,
      apiBaseUrl: API,
      fetch: api(502, null),
    });
    expect(empty).toMatchObject({ status: 502, body: null });
  });

  it("refuses to mint without a key or an origin", async () => {
    const fetchImpl = api(201, granted);

    await expect(
      mintForOrigin({ apiKey: "", origin: PAGE, fetch: fetchImpl }),
    ).rejects.toThrow("apiKey is empty");
    // An unbound grant works from any page.
    await expect(
      mintForOrigin({ apiKey: "key-1", origin: "", fetch: fetchImpl }),
    ).rejects.toThrow("origin is required");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("createMintHandler", () => {
  it("refuses anything but a POST with 405", async () => {
    const fetchImpl = api(201, granted);
    const handler = createMintHandler({ apiKey: "key-1", fetch: fetchImpl });

    const response = await handler(pageRequest({ method: "GET" }));

    expect(response.status).toBe(405);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses a request with no Origin with 400", async () => {
    const fetchImpl = api(201, granted);
    const handler = createMintHandler({ apiKey: "key-1", fetch: fetchImpl });

    const response = await handler(pageRequest({ headers: {} }));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: 400 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses an origin outside the list with 403, without calling the API", async () => {
    const fetchImpl = api(201, granted);
    const handler = createMintHandler({
      apiKey: "key-1",
      allowedOrigins: [PAGE],
      fetch: fetchImpl,
    });

    const response = await handler(
      pageRequest({ headers: { Origin: "https://stranger.example" } }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 403 });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("compares listed origins case-insensitively and without a trailing slash", async () => {
    const fetchImpl = api(201, granted);
    const handler = createMintHandler({
      apiKey: "key-1",
      apiBaseUrl: API,
      allowedOrigins: ["https://App.Example.com/"],
      fetch: fetchImpl,
    });

    expect(
      (await handler(pageRequest({ headers: { Origin: PAGE } }))).status,
    ).toBe(201);
    expect(
      (
        await handler(
          pageRequest({ headers: { Origin: "HTTPS://APP.EXAMPLE.COM/" } }),
        )
      ).status,
    ).toBe(201);
    // A look-alike is still a stranger.
    expect(
      (
        await handler(
          pageRequest({ headers: { Origin: "https://app.example.com.evil" } }),
        )
      ).status,
    ).toBe(403);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("asks a function whether the origin may mint", async () => {
    const fetchImpl = api(201, granted);
    const allowedOrigins = vi.fn((origin: string) => origin === PAGE);
    const handler = createMintHandler({
      apiKey: "key-1",
      apiBaseUrl: API,
      allowedOrigins,
      fetch: fetchImpl,
    });

    const refused = await handler(
      pageRequest({ headers: { Origin: "https://stranger.example" } }),
    );
    expect(refused.status).toBe(403);
    expect(fetchImpl).not.toHaveBeenCalled();

    const minted = await handler(pageRequest({ headers: { Origin: PAGE } }));
    expect(minted.status).toBe(201);
    expect(allowedOrigins).toHaveBeenCalledWith(PAGE);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("mints for an allowed origin and passes the answer through", async () => {
    const fetchImpl = api(429, daySpent, { "Retry-After": "3600" });
    const handler = createMintHandler({
      apiKey: "key-1",
      apiBaseUrl: API,
      allowedOrigins: [PAGE],
      fetch: fetchImpl,
    });

    const response = await handler(pageRequest());

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual(daySpent);
    expect(response.headers.get("Retry-After")).toBe("3600");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Content-Type")).toBe("application/json");
    const { url, headers } = sentAt(fetchImpl);
    expect(url).toBe(`${API}${SESSIONS_PATH}`);
    expect(headers.get("Origin")).toBe(PAGE);
    expect(headers.get("X-API-Key")).toBe("key-1");
  });

  it("hands a grant back as the API wrote it", async () => {
    const handler = createMintHandler({
      apiKey: "key-1",
      apiBaseUrl: API,
      allowedOrigins: [PAGE],
      fetch: api(201, granted),
    });

    const response = await handler(pageRequest());

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual(granted);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("never forwards the incoming request's cookies or credentials", async () => {
    const fetchImpl = api(201, granted);
    const handler = createMintHandler({
      apiKey: "key-1",
      apiBaseUrl: API,
      allowedOrigins: [PAGE],
      fetch: fetchImpl,
    });

    await handler(
      pageRequest({
        headers: {
          Origin: PAGE,
          Cookie: "merchant_session=secret",
          Authorization: "Bearer merchant-user",
        },
      }),
    );

    const { init, headers } = sentAt(fetchImpl);
    expect([...headers.keys()].sort()).toEqual([
      "accept",
      "origin",
      "x-api-key",
    ]);
    expect(init?.credentials).not.toBe("include");
  });
});
