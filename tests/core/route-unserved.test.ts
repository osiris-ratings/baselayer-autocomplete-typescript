import { describe, expect, it, vi } from "vitest";

import {
  AutocompleteError,
  createAutocompleteClient,
  type FetchLike,
  type MintFunction,
  type ResponseLike,
} from "@baselayer-sdk/autocomplete";

// A deployment that has the people route but cannot answer it yet: its index
// predates it, or its tokens are older than the route needs.

function reply(status: number, body: unknown): ResponseLike {
  return {
    ok: false,
    status,
    headers: { get: () => null },
    json: async () => body,
  };
}

function clientAnswering(body: unknown, status = 503) {
  const fetch = vi.fn<FetchLike>(async () => reply(status, body));
  const mint = vi.fn<MintFunction>(async () => ({
    kind: "granted",
    grant: {
      sessionToken: "grant-1",
      expiresIn: 600,
      requestBudget: 10,
      pivotAllowance: 5,
      filterMinStem: 3,
      scope: {
        routes: {
          businesses: [],
          people: ["businesses"],
          addresses: ["businesses"],
        },
        maxLimit: 20,
      },
    },
  }));
  return {
    fetch,
    mint,
    client: createAutocompleteClient({
      baseUrl: "https://api.test",
      mint,
      fetch,
    }),
  };
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

describe("a route the deployment cannot answer yet", () => {
  it.each([
    ["people", "index_too_old", 3, 4],
    ["people", "token_version_too_old", 5, 6],
    ["addresses", "index_too_old", 3, 4],
    ["addresses", "token_version_too_old", 5, 6],
  ] as const)(
    "reads a 503 on %s, %s, as route_unserved, with what it has and needs, and does not retry",
    async (route, reason, current, required) => {
      const { client, fetch, mint } = clientAnswering({
        code: 503,
        message: "This replica cannot answer this search yet.",
        uri: null,
        metadata: { reason, current, required },
      });

      const error = await refusal(client.search(route, { q: "dana" }));

      expect(error).toMatchObject({
        kind: "route_unserved",
        status: 503,
        code: 503,
        reason,
        route,
        unserved: { reason, current, required },
      });
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(mint).toHaveBeenCalledTimes(1);
    },
  );

  it("reads what it has and needs as null when the answer leaves them out", async () => {
    const { client } = clientAnswering({
      code: 503,
      message: "Not yet.",
      metadata: { reason: "index_too_old" },
    });

    expect(
      (await refusal(client.search("people", { q: "dana" }))).unserved,
    ).toEqual({ reason: "index_too_old", current: null, required: null });
  });

  it("leaves any other 503 as it was: no index served yet, or every worker busy", async () => {
    const { client } = clientAnswering({
      code: 503,
      message: "The query workers are busy.",
      metadata: { reason: "overloaded", action: "retry" },
    });

    const error = await refusal(client.search("people", { q: "dana" }));

    expect(error.kind).toBe("request_failed");
    expect(error.unserved).toBeNull();
  });

  it.each([500, 403])(
    "reads only a 503 that way: a %s with the same reason is the failure it is",
    async status => {
      const { client } = clientAnswering(
        {
          code: status,
          message: "Not this.",
          metadata: { reason: "index_too_old", current: 3, required: 4 },
        },
        status,
      );

      const error = await refusal(client.search("people", { q: "dana" }));

      expect(error.kind).toBe("request_failed");
      expect(error.unserved).toBeNull();
    },
  );

  it("reads what it has and needs only as whole numbers", async () => {
    const { client } = clientAnswering({
      code: 503,
      message: "Not yet.",
      metadata: { reason: "index_too_old", current: 3.5, required: "4" },
    });

    expect(
      (await refusal(client.search("people", { q: "dana" }))).unserved,
    ).toEqual({ reason: "index_too_old", current: null, required: null });
  });
});
