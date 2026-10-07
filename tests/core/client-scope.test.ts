import { describe, expect, it, vi, type Mock } from "vitest";

import {
  AutocompleteError,
  createAutocompleteClient,
  type FetchLike,
  type MintFunction,
  type MintedGrant,
  type RequestEvent,
  type ResponseLike,
  type SessionScope,
} from "@baselayer-sdk/autocomplete";

type FetchMock = Mock<FetchLike>;

const BUSINESSES_ONLY: SessionScope = {
  routes: { businesses: ["addresses"] },
  maxLimit: 5,
};

function grant(scope: SessionScope | undefined): MintedGrant {
  return {
    sessionToken: "grant-1",
    expiresIn: 600,
    requestBudget: 10,
    pivotAllowance: 5,
    filterMinStem: 3,
    ...(scope !== undefined ? { scope } : {}),
  };
}

function reply(status: number, body: unknown): ResponseLike {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => body,
  };
}

const empty = (sources: string[]) => ({
  query: "q",
  found: 0,
  found_capped: false,
  truncated: false,
  sources: Object.fromEntries(sources.map(s => [s, { status: "ok" }])),
  suggestions: [],
});

function clientWith(scope: SessionScope | undefined, fetch: FetchMock) {
  const mint = vi.fn<MintFunction>(async () => ({
    kind: "granted",
    grant: grant(scope),
  }));
  const client = createAutocompleteClient({
    baseUrl: "https://api.test",
    mint,
    fetch,
  });
  const events: RequestEvent[] = [];
  client.on("request", event => events.push(event));
  return { client, mint, events };
}

async function refusal(promise: Promise<unknown>): Promise<AutocompleteError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AutocompleteError) return error;
    throw error;
  }
  throw new Error("expected a refusal");
}

describe("a request the session's scope leaves out", () => {
  it("is refused before it is sent: a route outside the scope", async () => {
    const fetch = vi.fn<FetchLike>();
    const { client, events } = clientWith(BUSINESSES_ONLY, fetch);

    const error = await refusal(client.search("people", { q: "dana" }));

    expect(error.kind).toBe("out_of_scope");
    expect(error.route).toBe("people");
    expect(error.relation).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    expect(events).toEqual([]);
    expect(client.getSnapshot().usage.requestsSinceMint).toBe(0);
  });

  it("is refused before it is sent: an include outside the route's relations", async () => {
    const fetch = vi.fn<FetchLike>();
    const { client } = clientWith(BUSINESSES_ONLY, fetch);

    const error = await refusal(
      client.search("businesses", { q: "harbor", include: ["people"] }),
    );

    expect(error).toMatchObject({
      kind: "out_of_scope",
      route: "businesses",
      relation: "people",
      param: "include",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("is refused before it is sent: a filter on a relation outside them", async () => {
    const fetch = vi.fn<FetchLike>();
    const { client } = clientWith(BUSINESSES_ONLY, fetch);

    const error = await refusal(
      client.search("businesses", {
        q: "harbor",
        filters: { person: { name: "dana" } },
      }),
    );

    expect(error).toMatchObject({
      kind: "out_of_scope",
      route: "businesses",
      relation: "people",
      param: "person.name",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("still sends what the scope allows, and a direct filter, which touches no relation", async () => {
    const fetch = vi.fn<FetchLike>(async () =>
      reply(200, empty(["people", "addresses"])),
    );
    const { client } = clientWith(BUSINESSES_ONLY, fetch);

    await client.search("businesses", {
      q: "harbor",
      include: ["addresses"],
      filters: { state: ["PA"], address: { city: "Erie" } },
    });

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("refuses a limit past the session's most, and leaves an omitted one to the service", async () => {
    const fetch = vi.fn<FetchLike>(async () =>
      reply(200, empty(["people", "addresses"])),
    );
    const { client } = clientWith(BUSINESSES_ONLY, fetch);

    const error = await refusal(
      client.search("businesses", { q: "harbor", limit: 6 }),
    );
    expect(error.kind).toBe("query_invalid");
    expect(error.message).toContain("5");
    expect(fetch).not.toHaveBeenCalled();

    await client.search("businesses", { q: "harbor" });
    expect(new URL(fetch.mock.calls[0]![0]).searchParams.has("limit")).toBe(
      false,
    );
  });

  it("reads a grant without a scope as businesses only", async () => {
    const fetch = vi.fn<FetchLike>();
    const { client } = clientWith(undefined, fetch);

    expect(
      (await refusal(client.search("addresses", { q: "1200 river" }))).kind,
    ).toBe("out_of_scope");
  });
});

describe("the autocomplete service refusing the scope", () => {
  const wide: SessionScope = {
    routes: { businesses: ["people", "addresses"], people: ["businesses"] },
    maxLimit: 20,
  };

  it("reads a 501 as out of scope, and neither retries nor re-mints", async () => {
    const fetch = vi.fn<FetchLike>(async () =>
      reply(403, {
        code: 501,
        message: "This session's scope does not reach this autocomplete route.",
        metadata: { reason: "route_not_in_scope", route: "people" },
      }),
    );
    const { client, mint, events } = clientWith(wide, fetch);

    const error = await refusal(client.search("people", { q: "dana" }));

    expect(error).toMatchObject({
      kind: "out_of_scope",
      status: 403,
      code: 501,
      reason: "route_not_in_scope",
      route: "people",
      relation: null,
      param: null,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(mint).toHaveBeenCalledTimes(1);
    expect(events).toHaveLength(1);
    expect(events[0]!.error?.kind).toBe("out_of_scope");
  });

  it("reads a 502 as out of scope, naming the relation and the parameter", async () => {
    const fetch = vi.fn<FetchLike>(async () =>
      reply(403, {
        code: 502,
        message: "This session's scope does not reach that relation.",
        metadata: {
          reason: "relation_not_in_scope",
          param: "include",
          relation: "addresses",
        },
      }),
    );
    const { client, mint } = clientWith(wide, fetch);

    const error = await refusal(client.search("people", { q: "dana" }));

    expect(error).toMatchObject({
      kind: "out_of_scope",
      code: 502,
      route: "people",
      relation: "addresses",
      param: "include",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(mint).toHaveBeenCalledTimes(1);
  });

  it("reads a 502 in the mint's shape, which names the route instead of the parameter", async () => {
    const fetch = vi.fn<FetchLike>(async () =>
      reply(403, {
        code: 502,
        message: "No.",
        metadata: { route: "businesses", relation: "people" },
      }),
    );
    const { client } = clientWith(wide, fetch);

    expect(
      await refusal(client.search("businesses", { q: "harbor" })),
    ).toMatchObject({
      kind: "out_of_scope",
      route: "businesses",
      relation: "people",
      param: null,
    });
  });

  it("names no relation it does not know", async () => {
    const fetch = vi.fn<FetchLike>(async () =>
      reply(403, {
        code: 502,
        message: "No.",
        metadata: { param: "vehicle.make", relation: "vehicles" },
      }),
    );
    const { client } = clientWith(wide, fetch);

    expect(
      await refusal(client.search("businesses", { q: "harbor" })),
    ).toMatchObject({ kind: "out_of_scope", relation: null });
  });
});

describe("requests per route", () => {
  it("counts each route's requests on the grant, as the service budgets them", async () => {
    const fetch = vi.fn<FetchLike>(async (url: string) =>
      reply(
        200,
        url.includes("/people")
          ? empty(["businesses", "addresses"])
          : empty(["people", "addresses"]),
      ),
    );
    const { client, events } = clientWith(
      {
        routes: { businesses: ["people", "addresses"], people: ["businesses"] },
        maxLimit: 20,
      },
      fetch,
    );

    await client.search("businesses", { q: "harbor" });
    await client.search("people", { q: "dana" });
    await client.search("people", { q: "dana w" });

    expect(client.getSnapshot().usage.requestsSinceMint).toBe(3);
    expect(client.getSnapshot().usage.requestsByRoute).toEqual({
      businesses: 1,
      people: 2,
      addresses: 0,
    });
    expect(events.map(event => event.requestsOnRoute)).toEqual([1, 1, 2]);
  });
});
