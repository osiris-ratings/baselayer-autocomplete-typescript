import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createAutocompleteClient,
  type FetchLike,
  type MintFunction,
  type ResponseLike,
  type SessionScope,
} from "@baselayer-sdk/autocomplete";

import {
  DEBOUNCE_MS,
  DEFAULT_MESSAGES,
  useBusinessAutocomplete,
  useEntityAutocomplete,
} from "../../src/react";

const businesses = {
  query: "cinder",
  found: 0,
  found_capped: false,
  truncated: false,
  sources: { people: { status: "ok" }, addresses: { status: "ok" } },
  suggestions: [],
};

function reply(status: number, body: unknown): ResponseLike {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => body,
  };
}

function clientWith(scope: SessionScope) {
  const fetch = vi.fn<FetchLike>(async () => reply(200, businesses));
  const mint: MintFunction = async () => ({
    kind: "granted",
    grant: {
      sessionToken: "grant-1",
      expiresIn: 600,
      requestBudget: 10,
      pivotAllowance: 5,
      filterMinStem: 3,
      scope,
    },
  });
  return {
    client: createAutocompleteClient({
      baseUrl: "https://api.test",
      mint,
      fetch,
    }),
    fetch,
  };
}

const sent = (fetch: ReturnType<typeof clientWith>["fetch"]) =>
  new URL(fetch.mock.calls[0]![0]).searchParams;

async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
  });
}

describe("the typeahead under a session's scope", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("asks for its five rows, or the session's most when that is fewer", async () => {
    const roomy = clientWith({ routes: { businesses: [] }, maxLimit: 20 });
    const tight = clientWith({ routes: { businesses: [] }, maxLimit: 3 });

    renderHook(() =>
      useBusinessAutocomplete({
        query: "cinder",
        enabled: true,
        client: roomy.client,
      }),
    );
    renderHook(() =>
      useBusinessAutocomplete({
        query: "cinder",
        enabled: true,
        client: tight.client,
      }),
    );
    await settle();

    expect(sent(roomy.fetch).get("limit")).toBe("5");
    expect(sent(tight.fetch).get("limit")).toBe("3");
  });

  it("asks for the limit the host gave", async () => {
    const { client, fetch } = clientWith({
      routes: { businesses: [] },
      maxLimit: 20,
    });

    renderHook(() =>
      useBusinessAutocomplete({
        query: "cinder",
        enabled: true,
        client,
        limit: 8,
      }),
    );
    await settle();

    expect(sent(fetch).get("limit")).toBe("8");
  });

  it("asks only for the relations the scope grants, and leaves none to the service", async () => {
    const narrowed = clientWith({
      routes: { businesses: ["addresses"] },
      maxLimit: 20,
    });
    const bare = clientWith({ routes: { businesses: [] }, maxLimit: 20 });

    for (const { client } of [narrowed, bare]) {
      renderHook(() =>
        useBusinessAutocomplete({
          query: "cinder",
          enabled: true,
          client,
          include: ["people", "addresses"],
        }),
      );
    }
    await settle();

    expect(sent(narrowed.fetch).get("include")).toBe("addresses");
    expect(sent(bare.fetch).has("include")).toBe(false);
  });

  it("says a search is out of reach instead of searching forever", async () => {
    const { client, fetch } = clientWith({
      routes: { businesses: [] },
      maxLimit: 20,
    });

    const { result } = renderHook(() =>
      useEntityAutocomplete({
        relation: "people",
        query: "dana whitfield",
        enabled: true,
        client,
      }),
    );
    await settle();

    expect(fetch).not.toHaveBeenCalled();
    expect(result.current.isSearching).toBe(false);
    expect(result.current.errorKind).toBe("out_of_scope");
    expect(result.current.error).toBe(DEFAULT_MESSAGES.outOfScope);
  });
});
