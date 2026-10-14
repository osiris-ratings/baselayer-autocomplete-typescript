import { describe, expect, it, vi } from "vitest";

import {
  AutocompleteError,
  createAutocompleteClient,
  type AutocompleteClientConfig,
  type FetchLike,
  type MintFunction,
  type RequestEvent,
  type ResponseLike,
  type SessionScope,
} from "@baselayer-sdk/autocomplete";

import { golden, type GoldenName } from "./fixtures/golden";

// What a filtered query does while its text is shorter than the session's
// filter stem, on each route. The grant's stem is 5.

const STEM = 5;

const SCOPE: SessionScope = {
  routes: {
    businesses: ["people", "addresses"],
    people: ["businesses", "addresses"],
    addresses: ["businesses", "people"],
  },
  maxLimit: 20,
};

interface RouteCase {
  route: "businesses" | "people" | "addresses";
  answer: GoldenName;
  /** One character short of the stem. */
  short: string;
  /** Exactly the stem. */
  long: string;
  filters: object;
  /** The query parameter the filter travels as. */
  param: string;
}

const ROUTES: RouteCase[] = [
  {
    route: "businesses",
    answer: "businesses",
    short: "halc",
    long: "halcy",
    filters: { state: ["DE"] },
    param: "state",
  },
  {
    route: "people",
    answer: "people",
    short: "mari",
    long: "maris",
    filters: { business: { state: ["DE"] } },
    param: "business.state",
  },
  {
    route: "addresses",
    answer: "addresses",
    short: "pier",
    long: "piers",
    filters: { state: ["DE"] },
    param: "state",
  },
];

function reply(body: unknown): ResponseLike {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => body,
  };
}

function setup(config: Partial<AutocompleteClientConfig> = {}) {
  const fetch = vi.fn<FetchLike>(async url => {
    const route = ROUTES.find(r => url.includes(`/autocomplete/${r.route}`));
    return reply(golden(route?.answer ?? "businesses"));
  });
  const mint = vi.fn<MintFunction>(async () => ({
    kind: "granted",
    grant: {
      sessionToken: "grant-1",
      expiresIn: 600,
      requestBudget: 50,
      pivotAllowance: 5,
      filterMinStem: STEM,
      scope: SCOPE,
    },
  }));
  const client = createAutocompleteClient({
    baseUrl: "https://api.test",
    mint,
    fetch,
    ...config,
  });
  const events: RequestEvent[] = [];
  client.on("request", event => events.push(event));
  return { client, fetch, mint, events };
}

/** The client's search, whatever the route: the cases carry their own filters. */
function ask(
  client: ReturnType<typeof setup>["client"],
  { route, filters }: RouteCase,
  q: string,
  withFilters = true,
) {
  return client.search(route, {
    q,
    ...(withFilters ? { filters } : {}),
  } as never);
}

function sentTo(fetch: ReturnType<typeof setup>["fetch"], at = 0): URL {
  return new URL(String(fetch.mock.calls[at]?.[0]));
}

describe.each(ROUTES)("a filtered $route query", spec => {
  describe("by default, shorter than the grant's stem", () => {
    it("sends nothing, and answers with no suggestions", async () => {
      const { client, fetch, events } = setup();

      const result = await ask(client, spec, spec.short);

      expect(fetch).not.toHaveBeenCalled();
      expect(events).toEqual([]);
      expect(result.response.suggestions).toEqual([]);
      expect(result.response.found).toBe(0);
      expect(result.response.query).toBe(spec.short);
      expect(result.requestId).toBeNull();
      expect(result.filtersWaiting).toBe(true);
      expect(result.filtersWithheld).toBe(false);
    });

    it("says no relation was asked for", async () => {
      const { client } = setup();

      const { response } = await ask(client, spec, spec.short);

      const sources = Object.values(response.sources);
      expect(sources.length).toBeGreaterThan(0);
      for (const source of sources) {
        expect(source.status).toBe("not_requested");
      }
    });

    it("counts the characters still missing", async () => {
      const { client } = setup();

      expect((await ask(client, spec, spec.short)).charsNeeded).toBe(1);
      expect(
        (await ask(client, spec, spec.short.slice(0, 3))).charsNeeded,
      ).toBe(2);
    });

    it("still mints the session, and spends none of its budget", async () => {
      const { client, mint } = setup();

      await ask(client, spec, spec.short);

      expect(mint).toHaveBeenCalledTimes(1);
      expect(client.getSnapshot().usage.requestsSinceMint).toBe(0);
    });

    it("measures the stem the way the autocomplete service does", async () => {
      // As long as the stem, but one is a metacharacter the service drops.
      const { client, fetch } = setup();

      const result = await ask(client, spec, `${spec.short}%`);

      expect(fetch).not.toHaveBeenCalled();
      expect(result.charsNeeded).toBe(1);
    });
  });

  it("sends the filters once the query reaches the stem", async () => {
    const { client, fetch } = setup();

    const result = await ask(client, spec, spec.long);

    expect(fetch).toHaveBeenCalledTimes(1);
    const url = sentTo(fetch);
    expect(url.pathname).toBe(`/autocomplete/${spec.route}`);
    expect(url.searchParams.get("q")).toBe(spec.long);
    expect(url.searchParams.get(spec.param)).toBe("DE");
    expect(result.response.suggestions.length).toBeGreaterThan(0);
    expect(result.filtersWaiting).toBe(false);
    expect(result.charsNeeded).toBe(0);
    expect(result.filtersWithheld).toBe(false);
  });

  it("is asked as before when it carries no filter, however short", async () => {
    const { client, fetch } = setup();

    const result = await ask(client, spec, spec.short.slice(0, 3), false);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(sentTo(fetch).searchParams.has(spec.param)).toBe(false);
    expect(result.filtersWaiting).toBe(false);
    expect(result.charsNeeded).toBe(0);
  });

  it("is asked as before when its filters are all empty", async () => {
    const { client, fetch } = setup();

    const result = await client.search(spec.route, {
      q: spec.short,
      filters: { state: [] },
    } as never);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.filtersWaiting).toBe(false);
  });

  describe("under onShortStem: withhold", () => {
    it("is asked without the filters, and says so", async () => {
      const { client, fetch, events } = setup({ onShortStem: "withhold" });

      const result = await ask(client, spec, spec.short);

      expect(fetch).toHaveBeenCalledTimes(1);
      const url = sentTo(fetch);
      expect(url.searchParams.get("q")).toBe(spec.short);
      expect(url.searchParams.has(spec.param)).toBe(false);
      expect(result.filtersWithheld).toBe(true);
      expect(result.filtersWaiting).toBe(false);
      expect(result.charsNeeded).toBe(0);
      expect(events[0]?.filtersWithheld).toBe(true);
    });
  });

  describe("under onShortStem: send", () => {
    it("is asked with the filters anyway", async () => {
      const { client, fetch } = setup({ onShortStem: "send" });

      const result = await ask(client, spec, spec.short);

      expect(sentTo(fetch).searchParams.get(spec.param)).toBe("DE");
      expect(result.filtersWithheld).toBe(false);
      expect(result.filtersWaiting).toBe(false);
    });
  });

  describe("under onShortStem: throw", () => {
    it("is refused before it is sent", async () => {
      const { client, fetch } = setup({ onShortStem: "throw" });

      const failure = ask(client, spec, spec.short);

      await expect(failure).rejects.toBeInstanceOf(AutocompleteError);
      await expect(failure).rejects.toMatchObject({ kind: "query_invalid" });
      expect(fetch).not.toHaveBeenCalled();
    });
  });
});

describe.each(ROUTES)("charsToFilters on the $route route", spec => {
  const query = (q: string, withFilters = true) =>
    ({ q, ...(withFilters ? { filters: spec.filters } : {}) }) as never;

  it("is 0 while no session is held, which only a mint can tell", () => {
    const { client, mint } = setup();

    expect(client.charsToFilters?.(spec.route, query(spec.short))).toBe(0);
    expect(mint).not.toHaveBeenCalled();
  });

  it("counts the characters a filtered query lacks, once a session is held", async () => {
    const { client, fetch } = setup();
    await client.getSession();

    expect(client.charsToFilters?.(spec.route, query(spec.short))).toBe(1);
    expect(
      client.charsToFilters?.(spec.route, query(spec.short.slice(0, 3))),
    ).toBe(2);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("is 0 at the stem, with no filter, and with only empty ones", async () => {
    const { client } = setup();
    await client.getSession();

    expect(client.charsToFilters?.(spec.route, query(spec.long))).toBe(0);
    expect(client.charsToFilters?.(spec.route, query(spec.short, false))).toBe(
      0,
    );
    expect(
      client.charsToFilters?.(spec.route, {
        q: spec.short,
        filters: { state: [] },
      } as never),
    ).toBe(0);
  });

  it.each(["withhold", "send", "throw"] as const)(
    "is 0 under onShortStem: %s, which does not wait",
    async policy => {
      const { client } = setup({ onShortStem: policy });
      await client.getSession();

      expect(client.charsToFilters?.(spec.route, query(spec.short))).toBe(0);
    },
  );
});

describe("charsToFilters", () => {
  it("is 0 for a filter the session's scope leaves out, which search refuses", async () => {
    const client = createAutocompleteClient({
      baseUrl: "https://api.test",
      fetch: vi.fn<FetchLike>(),
      mint: async () => ({
        kind: "granted",
        grant: {
          sessionToken: "grant-1",
          expiresIn: 600,
          requestBudget: 50,
          pivotAllowance: 5,
          filterMinStem: STEM,
          scope: { routes: { people: ["businesses"] }, maxLimit: 5 },
        },
      }),
    });
    await client.getSession();

    expect(
      client.charsToFilters?.("people", {
        q: "mari",
        filters: { address: { text: "77 quillback ln" } },
      }),
    ).toBe(0);
  });
});

describe("a query waiting for its filters", () => {
  it("is still refused when the session's scope leaves its filter out", async () => {
    const fetch = vi.fn<FetchLike>();
    const client = createAutocompleteClient({
      baseUrl: "https://api.test",
      fetch,
      mint: async () => ({
        kind: "granted",
        grant: {
          sessionToken: "grant-1",
          expiresIn: 600,
          requestBudget: 50,
          pivotAllowance: 5,
          filterMinStem: STEM,
          scope: { routes: { people: ["businesses"] }, maxLimit: 5 },
        },
      }),
    });

    const failure = client.search("people", {
      q: "mari",
      filters: { address: { text: "77 quillback ln" } },
    });

    await expect(failure).rejects.toMatchObject({
      kind: "out_of_scope",
      relation: "addresses",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reads the stem from the grant, not a constant", async () => {
    const fetch = vi.fn<FetchLike>(async () => reply(golden("businesses")));
    const client = createAutocompleteClient({
      baseUrl: "https://api.test",
      fetch,
      mint: async () => ({
        kind: "granted",
        grant: {
          sessionToken: "grant-1",
          expiresIn: 600,
          requestBudget: 50,
          pivotAllowance: 5,
          filterMinStem: 3,
          scope: SCOPE,
        },
      }),
    });

    const waiting = await client.search("businesses", {
      q: "ha",
      filters: { state: ["DE"] },
    });
    const sent = await client.search("businesses", {
      q: "hal",
      filters: { state: ["DE"] },
    });

    expect(waiting.charsNeeded).toBe(1);
    expect(sent.charsNeeded).toBe(0);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("the people search's short name beside a business name", () => {
  const tooShort = (minLength = 5, extra: object = { with: "filters" }) => ({
    code: 422,
    message: "The request is invalid.",
    uri: null,
    metadata: {
      reason: "request_invalid",
      errors: [
        {
          type: "string_too_short",
          loc: ["query", "q"],
          msg: `Filters need a query of at least ${minLength} characters`,
          ctx: { min_length: minLength, ...extra },
        },
      ],
    },
  });
  const refused = (body: unknown): ResponseLike => ({
    ok: false,
    status: 422,
    headers: { get: () => null },
    json: async () => body,
  });
  const query = {
    q: "tim",
    filters: { business: { name: "osiris" } },
  } as const;

  it("is sent, because the service answers it when the business name is narrow", async () => {
    const { client, fetch } = setup();

    const result = await client.search("people", query);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(
      new URL(String(fetch.mock.calls[0]?.[0])).searchParams.get("q"),
    ).toBe("tim");
    expect(result.filtersWaiting).toBe(false);
    expect(result.response.suggestions.length).toBeGreaterThan(0);
  });

  it("reads the service's refusal, for a business name too wide, as waiting and not as an error", async () => {
    const { client, fetch, events } = setup();
    fetch.mockResolvedValue(refused(tooShort(5)));

    const result = await client.search("people", query);

    expect(result.filtersWaiting).toBe(true);
    expect(result.charsNeeded).toBe(2);
    expect(result.response.suggestions).toEqual([]);
    expect(result.filtersWithheld).toBe(false);
    expect(events).toEqual([
      expect.objectContaining({ status: 422, error: null }),
    ]);
    // The service refused it before admitting it: nothing was spent.
    const { usage } = client.getSnapshot();
    expect(usage.requestsSinceMint).toBe(0);
    expect(usage.requestsByRoute.people).toBe(0);
  });

  it("takes the stem from the refusal, not from what the client counted", async () => {
    const { client, fetch } = setup();
    fetch.mockResolvedValue(refused(tooShort(8)));

    const result = await client.search("people", query);

    expect(result.charsNeeded).toBe(5);
  });

  it.each([
    ["a too short q that is not about filters", tooShort(2, {})],
    ["a refusal that names no length", tooShort(5, { with: "filters" })],
  ])("still reads %s as an error", async (name, body) => {
    const { client, fetch } = setup();
    fetch.mockResolvedValue(
      refused(
        name.startsWith("a refusal")
          ? {
              ...(body as object),
              metadata: {
                reason: "request_invalid",
                errors: [
                  {
                    type: "string_too_short",
                    loc: ["query", "q"],
                    msg: "Filters need a query",
                    ctx: { with: "filters" },
                  },
                ],
              },
            }
          : body,
      ),
    );

    await expect(client.search("people", query)).rejects.toMatchObject({
      kind: "request_failed",
      status: 422,
    });
  });

  it("is an error when the query carried no filter to wait for", async () => {
    const { client, fetch } = setup();
    fetch.mockResolvedValue(refused(tooShort(5)));

    await expect(client.search("people", { q: "tim" })).rejects.toMatchObject({
      status: 422,
    });
  });

  it("is an error under onShortStem: send, which asks for exactly that", async () => {
    const { client, fetch } = setup({ onShortStem: "send" });
    fetch.mockResolvedValue(refused(tooShort(5)));

    await expect(client.search("people", query)).rejects.toMatchObject({
      status: 422,
    });
  });
});
