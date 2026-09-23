import { afterEach, describe, expect, it, vi } from "vitest";

import {
  MINT_DAY_SCOPE,
  defaultMint,
  parseMintResponse,
  type MintContext,
} from "@baselayer/autocomplete";

const SNAKE_GRANT = {
  session_token: "grant-1",
  expires_in: 180,
  request_budget: 150,
  pivot_allowance: 5,
  filter_min_stem: 5,
};
const CAMEL_GRANT = {
  sessionToken: "grant-1",
  expiresIn: 180,
  requestBudget: 150,
  pivotAllowance: 5,
  filterMinStem: 5,
};
const EXPIRES_AT = "2026-09-23T12:03:00Z";
const TOO_MANY = { code: 429, message: "too many" };

describe("parseMintResponse", () => {
  it("reads a snake_case 201 as the API sends it", () => {
    expect(parseMintResponse(201, null, SNAKE_GRANT)).toEqual({
      kind: "granted",
      grant: CAMEL_GRANT,
    });
  });

  it("reads a camelCase 201, so an adapter whose client camelCases need not undo it", () => {
    expect(parseMintResponse(201, null, CAMEL_GRANT)).toEqual({
      kind: "granted",
      grant: CAMEL_GRANT,
    });
  });

  it("reads the expiry the API states as a UTC timestamp", () => {
    expect(
      parseMintResponse(201, null, { ...SNAKE_GRANT, expires_at: EXPIRES_AT }),
    ).toEqual({
      kind: "granted",
      grant: { ...CAMEL_GRANT, expiresAtUtc: EXPIRES_AT },
    });
  });

  it("reads a camelCased expiry", () => {
    expect(
      parseMintResponse(201, null, { ...CAMEL_GRANT, expiresAt: EXPIRES_AT }),
    ).toEqual({
      kind: "granted",
      grant: { ...CAMEL_GRANT, expiresAtUtc: EXPIRES_AT },
    });
  });

  it("grants a body without the expiry, from an API that does not send it", () => {
    expect(parseMintResponse(201, null, SNAKE_GRANT)).toStrictEqual({
      kind: "granted",
      grant: CAMEL_GRANT,
    });
  });

  it.each<[string, unknown]>([
    ["a word", "soon"],
    ["an empty string", ""],
    ["a number", 123],
    ["null", null],
  ])(
    "grants a body whose expiry is %s, leaving the expiry out",
    (_name, expiresAt) => {
      expect(
        parseMintResponse(201, null, { ...SNAKE_GRANT, expires_at: expiresAt }),
      ).toStrictEqual({ kind: "granted", grant: CAMEL_GRANT });
    },
  );

  it("accepts a pivot allowance of zero", () => {
    expect(
      parseMintResponse(201, null, { ...SNAKE_GRANT, pivot_allowance: 0 }),
    ).toEqual({
      kind: "granted",
      grant: { ...CAMEL_GRANT, pivotAllowance: 0 },
    });
  });

  it.each<[string, unknown]>([
    ["no body", null],
    ["a string body", "created"],
    ["an empty token", { ...SNAKE_GRANT, session_token: "" }],
    ["a missing request budget", { ...SNAKE_GRANT, request_budget: undefined }],
    ["a fractional TTL", { ...SNAKE_GRANT, expires_in: 1.5 }],
    ["a zero TTL", { ...SNAKE_GRANT, expires_in: 0 }],
    ["a negative pivot allowance", { ...SNAKE_GRANT, pivot_allowance: -1 }],
    ["a zero filter stem", { ...SNAKE_GRANT, filter_min_stem: 0 }],
    ["a TTL sent as a string", { ...SNAKE_GRANT, expires_in: "180" }],
  ])("refuses a 201 with %s rather than caching garbage", (_name, body) => {
    expect(parseMintResponse(201, null, body)).toEqual({
      kind: "refused",
      status: 201,
      code: null,
      retryAfterSeconds: null,
      scope: null,
      message: null,
    });
  });

  it.each([
    [401, 1001, "Invalid credentials"],
    [402, 3004, "Organization is locked"],
    [403, 1003, "Not permitted"],
    [422, 1422, "Unprocessable"],
  ])(
    "carries the code and message of a %i envelope",
    (status, code, message) => {
      expect(parseMintResponse(status, {}, { code, message })).toEqual({
        kind: "refused",
        status,
        code,
        retryAfterSeconds: null,
        scope: null,
        message,
      });
    },
  );

  it("names the window for a 429 on the ten-minute pool", () => {
    const outcome = parseMintResponse(
      429,
      { "retry-after": "595" },
      {
        ...TOO_MANY,
        metadata: {
          scope: "autocomplete_session_mint:organization",
          limit: 20,
          window_seconds: 600,
        },
      },
    );

    expect(outcome).toEqual({
      kind: "refused",
      status: 429,
      code: 429,
      retryAfterSeconds: 595,
      scope: "window",
      message: "too many",
    });
  });

  it("names the window for a 429 that carries no envelope at all", () => {
    expect(parseMintResponse(429, {}, {})).toMatchObject({
      kind: "refused",
      code: null,
      scope: "window",
    });
  });

  it("names the day for a 429 on the organization's daily pool", () => {
    expect(MINT_DAY_SCOPE).toBe("autocomplete_session_mint_day:organization");
    const outcome = parseMintResponse(
      429,
      { "retry-after": "43200" },
      {
        ...TOO_MANY,
        metadata: { scope: MINT_DAY_SCOPE, limit: 50, window_seconds: 86_400 },
      },
    );

    expect(outcome).toMatchObject({
      kind: "refused",
      status: 429,
      retryAfterSeconds: 43_200,
      scope: "day",
    });
  });

  it("names no scope for a refusal that is not a 429, whatever the metadata says", () => {
    expect(
      parseMintResponse(
        503,
        {},
        { code: 503, message: "busy", metadata: { scope: MINT_DAY_SCOPE } },
      ),
    ).toMatchObject({ scope: null });
  });

  describe("Retry-After", () => {
    it("is read from a Headers object", () => {
      expect(
        parseMintResponse(429, new Headers({ "Retry-After": "600" }), TOO_MANY),
      ).toMatchObject({ retryAfterSeconds: 600 });
    });

    it("is read from an axios-style plain record with lowercase keys", () => {
      expect(
        parseMintResponse(
          429,
          { "content-type": "application/json", "retry-after": "600" },
          TOO_MANY,
        ),
      ).toMatchObject({ retryAfterSeconds: 600 });
    });

    it("is read from a plain record whatever its key's case", () => {
      expect(
        parseMintResponse(429, { "Retry-After": "600" }, TOO_MANY),
      ).toMatchObject({ retryAfterSeconds: 600 });
    });

    it("is read from the first value of a record's array", () => {
      expect(
        parseMintResponse(429, { "retry-after": ["600", "30"] }, TOO_MANY),
      ).toMatchObject({ retryAfterSeconds: 600 });
    });

    it("is read from any object with a get method", () => {
      const get = vi.fn((name: string) =>
        name.toLowerCase() === "retry-after" ? 600 : null,
      );

      expect(parseMintResponse(429, { get }, TOO_MANY)).toMatchObject({
        retryAfterSeconds: 600,
      });
      expect(get).toHaveBeenCalledWith("Retry-After");
    });

    it("keeps a fractional number of seconds", () => {
      expect(
        parseMintResponse(429, { "retry-after": "1.5" }, TOO_MANY),
      ).toMatchObject({ retryAfterSeconds: 1.5 });
    });

    it.each<[string, Record<string, unknown> | null | undefined]>([
      ["an HTTP date", { "retry-after": "Wed, 21 Oct 2015 07:28:00 GMT" }],
      ["a word", { "retry-after": "soon" }],
      ["an empty value", { "retry-after": "" }],
      ["zero", { "retry-after": "0" }],
      ["a negative number", { "retry-after": "-5" }],
      ["infinity", { "retry-after": "Infinity" }],
      ["no header", { "content-type": "application/json" }],
      ["a null value", { "retry-after": null }],
      ["null headers", null],
      ["undefined headers", undefined],
    ])("is null for %s", (_name, headers) => {
      expect(parseMintResponse(429, headers, TOO_MANY)).toMatchObject({
        retryAfterSeconds: null,
      });
    });
  });

  it("carries 503 code 481, the deployment that cannot mint", () => {
    expect(
      parseMintResponse(503, {}, { code: 481, message: "not configured" }),
    ).toEqual({
      kind: "refused",
      status: 503,
      code: 481,
      retryAfterSeconds: null,
      scope: null,
      message: "not configured",
    });
  });
});

describe("defaultMint", () => {
  const URL = "/api/autocomplete/session";

  function context(signal = new AbortController().signal): MintContext {
    return { reason: "cold", signal };
  }

  function respond(
    status: number,
    body: string,
    headers: Record<string, string> = {},
  ) {
    return vi.fn<typeof fetch>(
      async () => new Response(body, { status, headers }),
    );
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts to the URL with the host's own cookie and reads the grant", async () => {
    const fetchMock = respond(201, JSON.stringify(SNAKE_GRANT), {
      "content-type": "application/json",
    });
    const signal = new AbortController().signal;

    const outcome = await defaultMint(URL, { fetch: fetchMock })(
      context(signal),
    );

    expect(outcome).toEqual({ kind: "granted", grant: CAMEL_GRANT });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(URL, {
      method: "POST",
      headers: { Accept: "application/json" },
      credentials: "same-origin",
      signal,
    });
  });

  it("sends the credentials mode it is given", async () => {
    const fetchMock = respond(201, JSON.stringify(SNAKE_GRANT));

    await defaultMint(URL, { fetch: fetchMock, credentials: "include" })(
      context(),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      URL,
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("adds the extra headers, asking for them on every mint", async () => {
    const fetchMock = respond(201, JSON.stringify(SNAKE_GRANT));
    let n = 0;
    const headers = vi.fn(async () => {
      n += 1;
      return { "X-CSRF-Token": `csrf-${n}` };
    });
    const mint = defaultMint(URL, { fetch: fetchMock, headers });

    await mint(context());
    await mint(context());

    expect(headers).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      URL,
      expect.objectContaining({
        headers: { Accept: "application/json", "X-CSRF-Token": "csrf-1" },
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      URL,
      expect.objectContaining({
        headers: { Accept: "application/json", "X-CSRF-Token": "csrf-2" },
      }),
    );
  });

  it("takes extra headers from a synchronous function too", async () => {
    const fetchMock = respond(201, JSON.stringify(SNAKE_GRANT));

    await defaultMint(URL, {
      fetch: fetchMock,
      headers: () => ({ "X-CSRF-Token": "csrf" }),
    })(context());

    expect(fetchMock).toHaveBeenCalledWith(
      URL,
      expect.objectContaining({
        headers: { Accept: "application/json", "X-CSRF-Token": "csrf" },
      }),
    );
  });

  it("passes the reset signal to fetch", async () => {
    const fetchMock = respond(201, JSON.stringify(SNAKE_GRANT));
    const controller = new AbortController();

    await defaultMint(URL, { fetch: fetchMock })(context(controller.signal));

    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.signal).toBe(controller.signal);
  });

  it("reads the status, envelope and Retry-After the backend passed through", async () => {
    const fetchMock = respond(
      429,
      JSON.stringify({
        ...TOO_MANY,
        metadata: { scope: MINT_DAY_SCOPE },
      }),
      { "content-type": "application/json", "Retry-After": "3600" },
    );

    expect(await defaultMint(URL, { fetch: fetchMock })(context())).toEqual({
      kind: "refused",
      status: 429,
      code: 429,
      retryAfterSeconds: 3600,
      scope: "day",
      message: "too many",
    });
  });

  it.each([
    [502, "<html>Bad Gateway</html>"],
    [201, "created"],
    [503, ""],
  ])("reads a %i with a non-JSON body as refused", async (status, body) => {
    const fetchMock = respond(status, body, { "content-type": "text/html" });

    expect(await defaultMint(URL, { fetch: fetchMock })(context())).toEqual({
      kind: "refused",
      status,
      code: null,
      retryAfterSeconds: null,
      scope: null,
      message: null,
    });
  });

  it("lets a network failure reject, for the client to read as status 0", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => {
      throw new TypeError("Failed to fetch");
    });

    await expect(
      defaultMint(URL, { fetch: fetchMock })(context()),
    ).rejects.toThrow("Failed to fetch");
  });

  it("falls back to the global fetch, looked up when it mints", async () => {
    const mint = defaultMint(URL);
    const fetchMock = respond(201, JSON.stringify(SNAKE_GRANT));
    vi.stubGlobal("fetch", fetchMock);

    expect(await mint(context())).toEqual({
      kind: "granted",
      grant: CAMEL_GRANT,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
