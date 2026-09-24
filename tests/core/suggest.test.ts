import { afterEach, describe, expect, it, vi, type Mock } from "vitest";

import {
  AutocompleteError,
  ContractViolation,
  DEFAULT_REQUEST_POLICY,
  buildBusinessesUrl,
  createAutocompleteClient,
  depunct,
  recoveryFor,
  stemLength,
  strippedQuery,
  type AutocompleteClient,
  type AutocompleteClientConfig,
  type ClientSnapshot,
  type FetchLike,
  type MintFunction,
  type MintReason,
  type MintedGrant,
  type Query,
  type RequestEvent,
  type ResponseLike,
} from "@baselayer-sdk/autocomplete";

const {
  authBrakeMs: AUTH_BRAKE_MS,
  authFailuresBeforeBrake: AUTH_FAILURES_BEFORE_BRAKE,
  indexHeader: INDEX_HEADER,
  maxRetryAfterMs: MAX_RETRY_AFTER_MS,
  sessionHeader: SESSION_HEADER,
} = DEFAULT_REQUEST_POLICY;

const BASE_URL = "https://api.test";

type FetchMock = Mock<FetchLike>;
type MintMock = Mock<MintFunction>;

function grant(
  sessionToken: string,
  overrides: Partial<MintedGrant> = {},
): MintedGrant {
  return {
    sessionToken,
    expiresIn: 600,
    requestBudget: 150,
    pivotAllowance: 6,
    filterMinStem: 3,
    ...overrides,
  };
}

/** A mint that grants `grant-1`, `grant-2`, and so on, one per call. */
function mintInSequence(overrides: Partial<MintedGrant> = {}): MintMock {
  let minted = 0;
  return vi.fn<MintFunction>(async () => {
    minted += 1;
    return { kind: "granted", grant: grant(`grant-${minted}`, overrides) };
  });
}

function reply(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): ResponseLike {
  const lower = Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]),
  );
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: name => lower[name.toLowerCase()] ?? null },
    json: async () => body,
  };
}

const suggestion = {
  type: "business",
  token: "tok-cinder-rigging",
  label: "CINDER RIGGING, INC.",
  matched_name: null,
  match: "strong",
  domicile_state: "DE",
  states: ["DE", "CA"],
  related: {
    people: {
      count: 3,
      matched: 1,
      truncated: false,
      items: [
        {
          type: "person",
          id: null,
          label: "Wesley Crane",
          role: "officer",
          matched: true,
        },
      ],
    },
    addresses: { count: 2, matched: 0, truncated: false, items: [] },
    liens: { count: null, matched: null, truncated: false, items: [] },
  },
  highlight: [{ text: "CINDER", matched: true }],
};

const okBody = {
  query: "cind",
  found: 1,
  found_capped: false,
  sources: {
    people: { status: "ok" },
    addresses: { status: "not_requested" },
    liens: { status: "unavailable" },
  },
  suggestions: [suggestion],
};

function envelope(code: number, reason?: string) {
  return {
    code,
    message: `code ${code}`,
    uri: null,
    metadata: reason ? { reason } : {},
  };
}

function sentAt(fetchImpl: FetchMock, call: number) {
  const args = fetchImpl.mock.calls[call];
  if (args === undefined) {
    throw new Error(`fetch was not called ${call + 1} times`);
  }
  const [url, init] = args;
  return { url: new URL(url), init };
}

function headerOf(fetchImpl: FetchMock, call: number): string | undefined {
  return sentAt(fetchImpl, call).init.headers[SESSION_HEADER];
}

function mintsFor(mint: MintMock, reason: MintReason): number {
  return mint.mock.calls.filter(([context]) => context.reason === reason)
    .length;
}

const clients: AutocompleteClient[] = [];

/**
 * A fresh client per test: the brake the console kept per tab (and reset with
 * `resetAuthBrake()`) is per client in the SDK.
 */
function setup(
  config: Partial<AutocompleteClientConfig> = {},
  grantOverrides: Partial<MintedGrant> = {},
) {
  const fetchImpl: FetchMock = vi.fn<FetchLike>();
  const mint = mintInSequence(grantOverrides);
  const client = createAutocompleteClient({
    baseUrl: BASE_URL,
    mint,
    fetch: fetchImpl,
    ...config,
  });
  clients.push(client);
  return { client, fetchImpl, mint };
}

function recordRequests(client: AutocompleteClient): RequestEvent[] {
  const events: RequestEvent[] = [];
  client.on("request", event => {
    events.push(event);
  });
  return events;
}

afterEach(() => {
  clients.splice(0).forEach(client => client.reset());
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("buildBusinessesUrl", () => {
  it("sends the trimmed name and the limit, and nothing else", () => {
    // No filters given, none sent. The SDK sends `limit` only when given; the
    // React hook passes 5.
    expect(buildBusinessesUrl(BASE_URL, { q: " cind ", limit: 5 })).toBe(
      "https://api.test/autocomplete/businesses?q=cind&limit=5",
    );
    expect(buildBusinessesUrl(BASE_URL, { q: "o'brien & co", limit: 3 })).toBe(
      "https://api.test/autocomplete/businesses?q=o%27brien+%26+co&limit=3",
    );
  });

  it("leaves the limit to the tier when none is given", () => {
    // The console always sent `limit`, defaulting to 5; the tier's own default
    // is 10, and the SDK does not second-guess it.
    expect(buildBusinessesUrl(BASE_URL, { q: "cind" })).toBe(
      "https://api.test/autocomplete/businesses?q=cind",
    );
  });

  it("sends every filter once, under its own parameter, in a fixed order", () => {
    const url = new URL(
      buildBusinessesUrl(BASE_URL, {
        q: "cinder",
        limit: 5,
        include: ["people", "addresses", "liens"],
        filters: {
          address: {
            state: "CA",
            postalCode: "94105",
            city: "San Francisco",
            text: "535 Mission",
          },
          person: { role: "officer", name: "Wesley Crane" },
          domicileState: "DE",
          state: ["DE", "CA"],
        },
      }),
    );

    expect(url.origin + url.pathname).toBe(
      "https://api.test/autocomplete/businesses",
    );
    // One entry per parameter: the tier answers 422 to a repeated one.
    expect([...url.searchParams]).toEqual([
      ["q", "cinder"],
      ["limit", "5"],
      ["include", "people,addresses,liens"],
      ["state", "DE,CA"],
      ["domicile_state", "DE"],
      ["person.name", "Wesley Crane"],
      ["person.role", "officer"],
      ["address.text", "535 Mission"],
      ["address.city", "San Francisco"],
      ["address.postal_code", "94105"],
      ["address.state", "CA"],
    ]);
  });

  it("joins include into one parameter", () => {
    const url = new URL(
      buildBusinessesUrl(BASE_URL, { q: "cind", include: ["people"] }),
    );
    expect(url.searchParams.getAll("include")).toEqual(["people"]);
    expect(
      new URL(
        buildBusinessesUrl(BASE_URL, {
          q: "cind",
          include: ["addresses", "liens"],
        }),
      ).searchParams.getAll("include"),
    ).toEqual(["addresses,liens"]);
  });

  it("leaves out a filter with nothing in it", () => {
    expect(
      buildBusinessesUrl(BASE_URL, {
        q: "cind",
        filters: {
          state: [],
          domicileState: " ",
          person: { name: "" },
          address: { text: "  ", city: "", postalCode: "", state: "" },
        },
      }),
    ).toBe("https://api.test/autocomplete/businesses?q=cind");
  });

  it("drops the filters, and only the filters, when they are withheld", () => {
    expect(
      buildBusinessesUrl(
        BASE_URL,
        {
          q: "os",
          limit: 5,
          include: ["people"],
          filters: { state: ["DE"], person: { name: "Crane" } },
        },
        { withFilters: false },
      ),
    ).toBe(
      "https://api.test/autocomplete/businesses?q=os&limit=5&include=people",
    );
  });

  it("does not double the slash of a base URL that ends in one", () => {
    expect(buildBusinessesUrl("https://api.test/", { q: "cind" })).toBe(
      "https://api.test/autocomplete/businesses?q=cind",
    );
  });
});

describe("recoveryFor", () => {
  it.each([
    [401, null, "remint"],
    [401, "expired", "remint"],
    [429, "session_budget_spent", "remint"],
    [429, "session_pivots_exceeded", "remint"],
    [429, "rate_limited", "wait"],
    [429, "coverage_budget_spent", "none"],
    [429, null, "none"],
    [422, null, "none"],
    [503, null, "none"],
  ] as const)("%s with reason %s → %s", (status, reason, expected) => {
    expect(recoveryFor(status, reason)).toBe(expected);
  });
});

describe("the tier's measure of a query", () => {
  it("depuncts the way the tier does", () => {
    expect(depunct("Cinder & Co.")).toBe("cinder and co");
    // The tier's own cases (`depunct_matches_the_wrapper`).
    expect(depunct("AT&T Corp.")).toBe("at and t corp");
    expect(depunct("Tri-City  o'brien")).toBe("tri city o brien");
    expect(depunct("  Café  ")).toBe("cafe");
    expect(depunct("José Muñoz-Peña")).toBe("jose munoz pena");
    // A script that does not fold to ASCII survives; `~` is punctuation.
    expect(depunct("Газпром, Ltd.")).toBe("газпром ltd");
    expect(depunct("~s ca")).toBe("s ca");
  });

  it("strips the pattern metacharacters and every form that folds to one", () => {
    expect(strippedQuery(" 100% Pure_Water*? ")).toBe("100 PureWater");
    // Fullwidth and small variants: ％ ＊ ＿ ？ ﹪.
    expect(strippedQuery("ab％＊＿？﹪")).toBe("ab");
  });

  it("measures the stem on the stripped, depuncted query", () => {
    expect(stemLength("Cinder & Co.")).toBe("cinder and co".length);
    expect(stemLength("os%_*?")).toBe(2);
    // Apostrophes are not letters to the index, so they are not stem either.
    expect(stemLength("ab'''''")).toBe(2);
    // A folded diacritic is still one character.
    expect(stemLength("Émile")).toBe(5);
    expect(stemLength("   ")).toBe(0);
  });
});

describe("client.suggest", () => {
  it("sends the grant header and reads the index the tier answered from", async () => {
    const { client, fetchImpl } = setup();
    fetchImpl.mockResolvedValue(
      reply(200, okBody, { [INDEX_HEADER]: "v1/202609131644" }),
    );

    // The SDK sends `limit` only when given; the React hook passes 5.
    const result = await client.suggest({ q: "cind", limit: 5 });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe("https://api.test/autocomplete/businesses?q=cind&limit=5");
    expect(init?.headers[SESSION_HEADER]).toBe("grant-1");
    expect(init?.credentials).toBe("omit");
    expect(result.response.suggestions[0]?.label).toBe("CINDER RIGGING, INC.");
    expect(result.indexTag).toBe("v1/202609131644");
    expect(result.roundTripMs).toBeGreaterThanOrEqual(0);
  });

  it("re-mints once on a 401 and replays with the new grant", async () => {
    const { client, fetchImpl, mint } = setup();
    fetchImpl
      .mockResolvedValueOnce(reply(401, envelope(29)))
      .mockResolvedValueOnce(reply(200, okBody));

    const result = await client.suggest({ q: "cind" });

    // The console watched `getAutocompleteSession({ force: true })`; the SDK's
    // forced re-mint reaches the mint with `reason: "forced"`.
    expect(mint).toHaveBeenCalledTimes(2);
    expect(mint).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ reason: "cold" }),
    );
    expect(mint).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ reason: "forced" }),
    );
    expect(headerOf(fetchImpl, 0)).toBe("grant-1");
    expect(headerOf(fetchImpl, 1)).toBe("grant-2");
    expect(result.response.found).toBe(1);
    expect(result.recovery).toBe("remint");
  });

  it("re-mints on a spent session budget", async () => {
    const { client, fetchImpl, mint } = setup();
    fetchImpl
      .mockResolvedValueOnce(reply(429, envelope(480, "session_budget_spent")))
      .mockResolvedValueOnce(reply(200, okBody));

    await client.suggest({ q: "cind" });

    expect(headerOf(fetchImpl, 1)).toBe("grant-2");
    expect(mintsFor(mint, "forced")).toBe(1);
  });

  it("re-mints when the tier refused the session for changing its query too often", async () => {
    const { client, fetchImpl, mint } = setup();
    fetchImpl
      .mockResolvedValueOnce(
        reply(429, envelope(482, "session_pivots_exceeded")),
      )
      .mockResolvedValueOnce(reply(200, okBody));

    await client.suggest({ q: "cinder rigging" });

    expect(headerOf(fetchImpl, 1)).toBe("grant-2");
    expect(mintsFor(mint, "forced")).toBe(1);
  });

  it("waits out Retry-After on rate_limited, then replays with the same grant", async () => {
    vi.useFakeTimers();
    const { client, fetchImpl, mint } = setup();
    fetchImpl
      .mockResolvedValueOnce(
        reply(429, envelope(429, "rate_limited"), { "Retry-After": "1" }),
      )
      .mockResolvedValueOnce(reply(200, okBody));

    const pending = client.suggest({ q: "cind" });
    await vi.advanceTimersByTimeAsync(999);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    await expect(pending).resolves.toMatchObject({ recovery: "wait" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(headerOf(fetchImpl, 1)).toBe("grant-1");
    expect(mint).toHaveBeenCalledTimes(1);
  });

  it("waits a second on rate_limited when the tier sent no Retry-After", async () => {
    vi.useFakeTimers();
    const { client, fetchImpl } = setup();
    fetchImpl
      .mockResolvedValueOnce(reply(429, envelope(429, "rate_limited")))
      .mockResolvedValueOnce(reply(200, okBody));

    const pending = client.suggest({ q: "cind" });
    await vi.advanceTimersByTimeAsync(999);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    await expect(pending).resolves.toBeDefined();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("gives up at once when the keystroke was already superseded", async () => {
    vi.useFakeTimers();
    const { client, fetchImpl } = setup();
    const controller = new AbortController();
    fetchImpl.mockImplementationOnce(async () => {
      // Aborted between the reply and the wait, which is the window a
      // keystroke lands in: the abort event has already fired.
      controller.abort();
      return reply(429, envelope(429, "rate_limited"), {
        "Retry-After": "1",
      });
    });

    const pending = client.suggest(
      { q: "cind" },
      { signal: controller.signal },
    );

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    // Nothing is left on the clock to fire later.
    expect(vi.getTimerCount()).toBe(0);
  });

  it("gives up during the wait when the keystroke is superseded mid-wait", async () => {
    vi.useFakeTimers();
    const { client, fetchImpl } = setup();
    const controller = new AbortController();
    fetchImpl.mockResolvedValueOnce(
      reply(429, envelope(429, "rate_limited"), { "Retry-After": "1" }),
    );

    const aborted = expect(
      client.suggest({ q: "cind" }, { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(500);
    controller.abort();
    await aborted;

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("never holds a keystroke longer than the cap on a huge Retry-After", async () => {
    vi.useFakeTimers();
    const { client, fetchImpl } = setup();
    fetchImpl
      .mockResolvedValueOnce(
        reply(429, envelope(429, "rate_limited"), { "Retry-After": "600" }),
      )
      .mockResolvedValueOnce(reply(200, okBody));

    const pending = client.suggest({ q: "cind" });
    await vi.advanceTimersByTimeAsync(MAX_RETRY_AFTER_MS - 1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    await expect(pending).resolves.toBeDefined();
    expect(MAX_RETRY_AFTER_MS).toBe(2000);
  });

  it("stops on a spent coverage budget without retrying", async () => {
    const { client, fetchImpl, mint } = setup();
    fetchImpl.mockResolvedValueOnce(
      reply(429, envelope(429, "coverage_budget_spent"), {
        "Retry-After": "30",
      }),
    );

    const failure = client.suggest({ q: "cind" });

    await expect(failure).rejects.toBeInstanceOf(AutocompleteError);
    await expect(failure).rejects.toMatchObject({
      kind: "request_failed",
      status: 429,
      code: 429,
      reason: "coverage_budget_spent",
      retryAfterMs: 30_000,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(mint).toHaveBeenCalledTimes(1);
  });

  it("recovers at most once", async () => {
    const { client, fetchImpl } = setup();
    fetchImpl.mockResolvedValue(reply(401, envelope(28)));

    await expect(client.suggest({ q: "cind" })).rejects.toMatchObject({
      kind: "request_failed",
      status: 401,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  describe("the brake on a tier that keeps refusing fresh grants", () => {
    // A key rotation out of step, or clock skew: every grant the API mints is
    // refused. Without a memory across keystrokes each debounce window would
    // mint again, and `POST /autocomplete/sessions` writes an Order per mint.
    const T0 = 1_700_000_000_000;

    function frozenAt(start: number) {
      let now = start;
      return {
        now: () => now,
        set: (value: number) => {
          now = value;
        },
      };
    }

    it("stops minting after consecutive calls that failed even after a re-mint", async () => {
      const clock = frozenAt(T0);
      const { client, fetchImpl, mint } = setup({ now: clock.now });
      fetchImpl.mockResolvedValue(reply(401, envelope(29)));

      for (let call = 0; call < AUTH_FAILURES_BEFORE_BRAKE; call += 1) {
        await expect(client.suggest({ q: "cind" })).rejects.toMatchObject({
          kind: "request_failed",
          status: 401,
          reason: null,
        });
      }
      // Each call fetched twice (the original and the replay) and re-minted
      // once. The console counted `getAutocompleteSession` calls, two per call;
      // the client caches the grant, so the only other mint is the cold one.
      expect(fetchImpl).toHaveBeenCalledTimes(2 * AUTH_FAILURES_BEFORE_BRAKE);
      expect(mintsFor(mint, "forced")).toBe(AUTH_FAILURES_BEFORE_BRAKE);
      expect(mint).toHaveBeenCalledTimes(1 + AUTH_FAILURES_BEFORE_BRAKE);
      expect(client.getSnapshot().brake).toEqual({ until: T0 + AUTH_BRAKE_MS });

      const braked = client.suggest({ q: "cinde" });
      await expect(braked).rejects.toBeInstanceOf(AutocompleteError);
      await expect(braked).rejects.toMatchObject({
        kind: "auth_braked",
        status: 401,
        reason: "auth_unavailable",
        until: T0 + AUTH_BRAKE_MS,
      });
      // Neither the tier nor the mint route heard from this keystroke.
      expect(fetchImpl).toHaveBeenCalledTimes(2 * AUTH_FAILURES_BEFORE_BRAKE);
      expect(mint).toHaveBeenCalledTimes(1 + AUTH_FAILURES_BEFORE_BRAKE);

      // Once the brake has held its time, the next keystroke tries again.
      clock.set(T0 + AUTH_BRAKE_MS);
      expect(client.getSnapshot().brake).toBeNull();
      await expect(client.suggest({ q: "cinder" })).rejects.toMatchObject({
        kind: "request_failed",
        status: 401,
        reason: null,
      });
      expect(fetchImpl).toHaveBeenCalledTimes(
        2 * AUTH_FAILURES_BEFORE_BRAKE + 2,
      );
    });

    it("keeps the brake to the client that armed it, until a reset", async () => {
      const clock = frozenAt(T0);
      const braked = setup({ now: clock.now });
      braked.fetchImpl.mockResolvedValue(reply(401, envelope(29)));
      for (let call = 0; call < AUTH_FAILURES_BEFORE_BRAKE; call += 1) {
        await expect(braked.client.suggest({ q: "cind" })).rejects.toThrow();
      }
      await expect(braked.client.suggest({ q: "cind" })).rejects.toMatchObject({
        kind: "auth_braked",
      });

      // The brake is per client; a second client starts clean.
      const other = setup({ now: clock.now });
      other.fetchImpl.mockResolvedValue(reply(200, okBody));
      await expect(other.client.suggest({ q: "cind" })).resolves.toBeDefined();

      // And a sign-out lifts it on the client that armed it.
      braked.client.reset();
      braked.fetchImpl.mockResolvedValue(reply(200, okBody));
      await expect(braked.client.suggest({ q: "cind" })).resolves.toBeDefined();
    });

    it("does not count a rate limit waited out and then followed by an expiry", async () => {
      // The brake means "the tier and the API disagree about a grant this client
      // just minted". A `rate_limited` reply spends the one recovery on a wait,
      // and a grant that expires during that wait is a grant dying of old age:
      // nothing was ever re-minted, so nothing here says anything about auth.
      vi.useFakeTimers();
      const { client, fetchImpl, mint } = setup();

      for (let call = 0; call < AUTH_FAILURES_BEFORE_BRAKE + 1; call += 1) {
        fetchImpl
          .mockResolvedValueOnce(
            reply(429, envelope(429, "rate_limited"), { "Retry-After": "1" }),
          )
          .mockResolvedValueOnce(reply(401, envelope(29)));
        // Attach the expectation before advancing the clock: the rejection
        // lands inside `advanceTimersByTimeAsync`, and a handler added after
        // it is one the runner has already seen go unhandled.
        const refused = expect(
          client.suggest({ q: "cind" }),
        ).rejects.toMatchObject({ kind: "request_failed", status: 401 });
        await vi.advanceTimersByTimeAsync(1000);
        await refused;
      }
      expect(mintsFor(mint, "forced")).toBe(0);

      // Past what would have armed the brake, the next keystroke still reaches
      // the tier rather than failing with `auth_unavailable`.
      fetchImpl.mockResolvedValue(reply(200, okBody));
      const before = fetchImpl.mock.calls.length;
      await expect(client.suggest({ q: "cinder" })).resolves.toMatchObject({
        response: { found: okBody.found },
      });
      expect(fetchImpl.mock.calls.length - before).toBe(1);
    });

    it("forgets the failures once a call succeeds", async () => {
      const clock = frozenAt(T0);
      const { client, fetchImpl } = setup({ now: clock.now });
      fetchImpl
        .mockResolvedValueOnce(reply(401, envelope(29)))
        .mockResolvedValueOnce(reply(401, envelope(29)))
        .mockResolvedValueOnce(reply(200, okBody))
        .mockResolvedValue(reply(401, envelope(29)));

      await expect(client.suggest({ q: "cind" })).rejects.toMatchObject({
        status: 401,
      });
      await expect(client.suggest({ q: "cinde" })).resolves.toBeDefined();
      // One failure after a success is one failure, not the second of two.
      await expect(client.suggest({ q: "cinder" })).rejects.toMatchObject({
        kind: "request_failed",
        status: 401,
        reason: null,
      });
      expect(fetchImpl).toHaveBeenCalledTimes(5);
      // So the keystroke after it still reaches the tier.
      await expect(client.suggest({ q: "cinder " })).rejects.toMatchObject({
        kind: "request_failed",
      });
      expect(fetchImpl).toHaveBeenCalledTimes(7);
    });

    it("does not count a rate limit or a validation error as an auth failure", async () => {
      const clock = frozenAt(T0);
      const { client, fetchImpl } = setup({ now: clock.now });
      fetchImpl
        .mockResolvedValueOnce(reply(422, { detail: [{ msg: "too short" }] }))
        .mockResolvedValueOnce(reply(422, { detail: [{ msg: "too short" }] }))
        .mockResolvedValueOnce(reply(422, { detail: [{ msg: "too short" }] }))
        .mockResolvedValue(reply(200, okBody));

      for (let call = 0; call < 3; call += 1) {
        await expect(client.suggest({ q: "cind" })).rejects.toMatchObject({
          status: 422,
        });
      }
      await expect(client.suggest({ q: "cinder" })).resolves.toBeDefined();
    });
  });

  it("surfaces the envelope's message, code and reason", async () => {
    const { client, fetchImpl } = setup();
    fetchImpl.mockResolvedValue(
      reply(503, {
        code: 503,
        message: "No index is being served yet",
        uri: null,
        metadata: { reason: "warming" },
      }),
    );

    const failure = client.suggest({ q: "cind" });

    await expect(failure).rejects.toThrow("No index is being served yet");
    await expect(failure).rejects.toMatchObject({
      kind: "request_failed",
      status: 503,
      code: 503,
      reason: "warming",
      userMessage: "No index is being served yet",
    });
  });

  it("surfaces a validation detail as the error message", async () => {
    const { client, fetchImpl } = setup();
    fetchImpl.mockResolvedValue(
      reply(422, {
        detail: [
          {
            type: "string_too_short",
            loc: ["query", "q"],
            msg: "String should have at least 2 characters",
          },
        ],
      }),
    );

    const failure = client.suggest({ q: "cind" });

    await expect(failure).rejects.toThrow(
      "String should have at least 2 characters",
    );
    await expect(failure).rejects.toMatchObject({
      kind: "request_failed",
      status: 422,
      code: null,
      userMessage: "String should have at least 2 characters",
    });
  });

  it("falls back to the status when the body is not JSON", async () => {
    const { client, fetchImpl } = setup();
    fetchImpl.mockResolvedValue({
      ok: false,
      status: 502,
      headers: { get: () => null },
      json: async () => {
        throw new SyntaxError("not json");
      },
    });

    const failure = client.suggest({ q: "cind" });

    await expect(failure).rejects.toThrow(
      "Autocomplete unavailable (HTTP 502)",
    );
    // Nothing the tier said is fit to show a user.
    await expect(failure).rejects.toMatchObject({
      status: 502,
      userMessage: null,
    });
  });

  it("reports a network failure as status 0", async () => {
    const { client, fetchImpl } = setup();
    const events = recordRequests(client);
    fetchImpl.mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(client.suggest({ q: "cind" })).rejects.toMatchObject({
      kind: "request_failed",
      status: 0,
    });
    expect(events).toEqual([
      expect.objectContaining({ status: 0, roundTripMs: null }),
    ]);
  });

  describe("the filter stem", () => {
    const filters = { state: ["DE"] };

    it("withholds the filters from a query shorter than the grant's stem, and says so", async () => {
      const { client, fetchImpl } = setup({}, { filterMinStem: 4 });
      fetchImpl.mockResolvedValue(reply(200, okBody));
      const events = recordRequests(client);

      const result = await client.suggest({ q: "cin", filters });

      const { url } = sentAt(fetchImpl, 0);
      expect(url.searchParams.get("q")).toBe("cin");
      expect(url.searchParams.has("state")).toBe(false);
      expect(result.filtersWithheld).toBe(true);
      expect(events[0]?.filtersWithheld).toBe(true);
    });

    it("measures the stem the way the tier does, not the raw length", async () => {
      // Four characters typed, three once the metacharacter is stripped.
      const { client, fetchImpl } = setup({}, { filterMinStem: 4 });
      fetchImpl.mockResolvedValue(reply(200, okBody));

      const result = await client.suggest({ q: "cin%", filters });

      expect(sentAt(fetchImpl, 0).url.searchParams.has("state")).toBe(false);
      expect(result.filtersWithheld).toBe(true);
    });

    it("sends the filters once the stem reaches the grant's", async () => {
      const { client, fetchImpl } = setup({}, { filterMinStem: 4 });
      fetchImpl.mockResolvedValue(reply(200, okBody));

      const result = await client.suggest({ q: "cind", filters });

      expect(sentAt(fetchImpl, 0).url.searchParams.get("state")).toBe("DE");
      expect(result.filtersWithheld).toBe(false);
    });

    it("reads the stem from the grant, not a constant", async () => {
      const { client, fetchImpl } = setup({}, { filterMinStem: 2 });
      fetchImpl.mockResolvedValue(reply(200, okBody));

      const result = await client.suggest({ q: "os", filters });

      expect(sentAt(fetchImpl, 0).url.searchParams.get("state")).toBe("DE");
      expect(result.filtersWithheld).toBe(false);
    });

    it("sends them anyway under onShortStem: send", async () => {
      const { client, fetchImpl } = setup(
        { onShortStem: "send" },
        { filterMinStem: 4 },
      );
      fetchImpl.mockResolvedValue(reply(200, okBody));

      const result = await client.suggest({ q: "cin", filters });

      expect(sentAt(fetchImpl, 0).url.searchParams.get("state")).toBe("DE");
      expect(result.filtersWithheld).toBe(false);
    });

    it("refuses before any fetch under onShortStem: throw", async () => {
      const { client, fetchImpl } = setup(
        { onShortStem: "throw" },
        { filterMinStem: 4 },
      );
      fetchImpl.mockResolvedValue(reply(200, okBody));

      const failure = client.suggest({ q: "cin", filters });

      await expect(failure).rejects.toBeInstanceOf(AutocompleteError);
      await expect(failure).rejects.toMatchObject({ kind: "query_invalid" });
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it("says nothing was withheld when there were no filters to withhold", async () => {
      const { client, fetchImpl } = setup({}, { filterMinStem: 4 });
      fetchImpl.mockResolvedValue(reply(200, okBody));

      const result = await client.suggest({
        q: "os",
        filters: { state: [], person: { name: " " } },
      });

      expect(result.filtersWithheld).toBe(false);
    });
  });

  describe("a query the tier would refuse", () => {
    it.each<[string, Query]>([
      ["a one-character stem", { q: "o" }],
      ["one character once the metacharacters are gone", { q: " o% " }],
      ["257 characters", { q: "a".repeat(257) }],
      ["limit 0", { q: "cind", limit: 0 }],
      ["limit 21", { q: "cind", limit: 21 }],
      ["a fractional limit", { q: "cind", limit: 2.5 }],
    ])("is refused locally: %s", async (_, query) => {
      const { client, fetchImpl, mint } = setup();

      const failure = client.suggest(query);

      await expect(failure).rejects.toBeInstanceOf(AutocompleteError);
      await expect(failure).rejects.toMatchObject({ kind: "query_invalid" });
      expect(fetchImpl).not.toHaveBeenCalled();
      expect(mint).not.toHaveBeenCalled();
    });

    it("sends the bounds themselves", async () => {
      const { client, fetchImpl } = setup();
      fetchImpl.mockResolvedValue(reply(200, okBody));

      await client.suggest({ q: "os" });
      await client.suggest({ q: ` ${"a".repeat(256)} ` });
      await client.suggest({ q: "cind", limit: 1 });
      await client.suggest({ q: "cind", limit: 20 });

      expect(fetchImpl).toHaveBeenCalledTimes(4);
    });
  });

  describe("a reply that breaks the contract", () => {
    it("is a contract error, not suggestions", async () => {
      const { client, fetchImpl } = setup();
      const events = recordRequests(client);
      fetchImpl.mockResolvedValue(reply(200, { ...okBody, found: "one" }));

      const error: unknown = await client
        .suggest({ q: "cind" })
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(AutocompleteError);
      expect(error).toMatchObject({
        kind: "contract",
        status: 200,
        message: expect.stringContaining("response.found"),
      });
      expect((error as AutocompleteError).cause).toBeInstanceOf(
        ContractViolation,
      );
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(events).toEqual([expect.objectContaining({ status: 200, error })]);
    });

    it("is a contract error when a 200 is not JSON at all", async () => {
      const { client, fetchImpl } = setup();
      fetchImpl.mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => {
          throw new SyntaxError("Unexpected token <");
        },
      });

      await expect(client.suggest({ q: "cind" })).rejects.toMatchObject({
        kind: "contract",
        status: 200,
      });
    });
  });

  describe("what the client reports", () => {
    const headers = {
      [INDEX_HEADER]: "v1/202609131644",
      "X-Request-ID": "req-7",
      "Server-Timing": "total;dur=4.2, sqlite;dur=1.1",
    };

    it("puts the request id and the server timing on the result", async () => {
      const { client, fetchImpl } = setup();
      fetchImpl.mockResolvedValue(reply(200, okBody, headers));

      const result = await client.suggest({ q: "cind" });

      expect(result).toMatchObject({
        indexTag: "v1/202609131644",
        requestId: "req-7",
        serverTiming: "total;dur=4.2, sqlite;dur=1.1",
        recovery: "none",
        filtersWithheld: false,
      });
    });

    it("remembers the index that answered last", async () => {
      const { client, fetchImpl } = setup();
      expect(client.getSnapshot().lastIndexTag).toBeNull();
      fetchImpl
        .mockResolvedValueOnce(reply(200, okBody, headers))
        .mockResolvedValueOnce(
          reply(200, okBody, { [INDEX_HEADER]: "v1/202609141200" }),
        );

      await client.suggest({ q: "cind" });
      expect(client.getSnapshot().lastIndexTag).toBe("v1/202609131644");
      await client.suggest({ q: "cinde" });
      expect(client.getSnapshot().lastIndexTag).toBe("v1/202609141200");
    });

    it("emits one request event per call, counting the requests since the mint", async () => {
      const { client, fetchImpl } = setup();
      const events = recordRequests(client);
      fetchImpl.mockResolvedValue(reply(200, okBody, headers));

      await client.suggest({ q: "cind" });
      await client.suggest({ q: "cinde" });

      expect(events).toEqual([
        expect.objectContaining({
          q: "cind",
          status: 200,
          requestsSinceMint: 1,
          requestBudget: 150,
          recovery: "none",
          indexTag: "v1/202609131644",
          requestId: "req-7",
          serverTiming: "total;dur=4.2, sqlite;dur=1.1",
          filtersWithheld: false,
          error: null,
        }),
        expect.objectContaining({ q: "cinde", requestsSinceMint: 2 }),
      ]);
      expect(events[0]?.roundTripMs).toBeGreaterThanOrEqual(0);
      expect(client.getSnapshot().usage).toEqual({
        requestsSinceMint: 2,
        requestBudget: 150,
        pivotAllowance: 6,
        pivotsExceededEvents: 0,
      });
    });

    it("starts the count again on a re-mint, and counts the pivots refused", async () => {
      const { client, fetchImpl } = setup();
      const events = recordRequests(client);
      fetchImpl
        .mockResolvedValueOnce(reply(200, okBody))
        .mockResolvedValueOnce(
          reply(429, envelope(482, "session_pivots_exceeded")),
        )
        .mockResolvedValueOnce(reply(200, okBody));

      await client.suggest({ q: "cind" });
      await client.suggest({ q: "emberline" });

      // The refused request is recovered, not reported: one event per call.
      expect(events).toEqual([
        expect.objectContaining({ requestsSinceMint: 1, recovery: "none" }),
        expect.objectContaining({ requestsSinceMint: 1, recovery: "remint" }),
      ]);
      expect(client.getSnapshot().usage).toMatchObject({
        requestsSinceMint: 1,
        pivotsExceededEvents: 1,
      });
    });

    it("counts a refused request in the snapshot and tells subscribers", async () => {
      const { client, fetchImpl } = setup();
      const events = recordRequests(client);
      fetchImpl
        .mockResolvedValueOnce(reply(200, okBody))
        .mockResolvedValueOnce(reply(422, { detail: [{ msg: "too short" }] }));

      const snapshots: ClientSnapshot[] = [];
      client.on("stateChange", snapshot => {
        snapshots.push(snapshot);
      });
      await client.suggest({ q: "cind" });
      // A host reads the snapshot between keystrokes, as a render does.
      expect(client.getSnapshot().usage.requestsSinceMint).toBe(1);
      const notified = snapshots.length;
      await expect(client.suggest({ q: "cinde" })).rejects.toMatchObject({
        status: 422,
      });

      expect(snapshots.length).toBeGreaterThan(notified);

      expect(events[1]).toMatchObject({
        status: 422,
        requestsSinceMint: 2,
        error: expect.any(AutocompleteError),
      });
      expect(client.getSnapshot().usage.requestsSinceMint).toBe(2);
      expect(snapshots.at(-1)?.usage.requestsSinceMint).toBe(2);
    });

    it("stops reporting to a handler once it unsubscribes", async () => {
      const { client, fetchImpl } = setup();
      fetchImpl.mockResolvedValue(reply(200, okBody));
      const handler = vi.fn();
      const off = client.on("request", handler);

      await client.suggest({ q: "cind" });
      off();
      await client.suggest({ q: "cinde" });

      expect(handler).toHaveBeenCalledTimes(1);
    });
  });
});
