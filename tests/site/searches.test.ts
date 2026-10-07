import { describe, expect, it, vi } from "vitest";

import { SAMPLE_SEARCH } from "../../site/demo/sample-search";
import {
  SEARCH_WAIT_SECONDS,
  describeSearchRefusal,
  isTerminal,
  parseSearch,
  runSearch,
  searchBody,
  type RunSearchOptions,
  type Search,
  type SearchOutcome,
} from "../../site/demo/searches";

// The demo's third step: `POST /searches` for a pick's token, held by the API
// until the search ends, and asked after when it is not.

type FetchImpl = (input: string, init?: RequestInit) => Promise<Response>;

const BASE = "https://api.example.test";
const TOKEN = "A4uYMdTtN1PuVsmNF8kQ2wZr7Hc-Xp0_LbVe9Jt3nGyU5sDa";

function reply(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

/** A fetch that answers each call in turn. */
function answering(...responses: Response[]) {
  const queue = [...responses];
  return vi.fn<FetchImpl>(async () => {
    const next = queue.shift();
    if (next === undefined) throw new Error("no answer was queued");
    return next;
  });
}

function options(
  fetchImpl: FetchImpl,
  more: Partial<RunSearchOptions> = {},
): RunSearchOptions {
  return {
    baseUrl: BASE,
    apiKey: "prod_secret",
    businessToken: TOKEN,
    fetchImpl,
    idempotencyKey: "key-1",
    sleep: async () => {},
    ...more,
  };
}

const pending: Search = {
  ...SAMPLE_SEARCH,
  state: "PENDING",
  business: null,
  scores: [],
  verified: null,
};

describe("the search body", () => {
  it("is the token alone: the API refuses it beside a name or an address", () => {
    expect(JSON.parse(searchBody(TOKEN))).toEqual({ business_token: TOKEN });
  });
});

describe("runSearch", () => {
  it("posts the token, asking the API to hold the call for the answer", async () => {
    const fetchImpl = answering(reply(201, SAMPLE_SEARCH));
    const outcome = await runSearch(options(fetchImpl));
    expect(outcome).toEqual({ kind: "done", search: SAMPLE_SEARCH });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(`${BASE}/searches`);
    expect(init?.method).toBe("POST");
    expect(init?.credentials).toBe("omit");
    expect(init?.headers).toEqual({
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-API-Key": "prod_secret",
      Prefer: `wait=${SEARCH_WAIT_SECONDS}`,
      "Idempotency-Key": "key-1",
    });
    expect(Object.keys(JSON.parse(init?.body as string))).toEqual([
      "business_token",
    ]);
  });

  it("names each search with a key of its own", async () => {
    const keys: (string | undefined)[] = [];
    for (let run = 0; run < 2; run++) {
      const fetchImpl = answering(reply(201, SAMPLE_SEARCH));
      await runSearch({
        baseUrl: BASE,
        apiKey: "prod_secret",
        businessToken: TOKEN,
        fetchImpl,
      });
      const headers = fetchImpl.mock.calls[0]![1]!.headers as Record<
        string,
        string
      >;
      keys.push(headers["Idempotency-Key"]);
    }
    expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(keys[1]).toMatch(/^[0-9a-f-]{36}$/);
    expect(keys[0]).not.toBe(keys[1]);
  });

  it("takes a search that found no business as an outcome, not an error", async () => {
    // The API answers 201 for it: the search ended, with `FAILED`.
    const failed: Search = {
      ...pending,
      state: "FAILED",
      error: "No match found.",
    };
    const outcome = await runSearch(options(answering(reply(201, failed))));
    expect(outcome).toEqual({ kind: "done", search: failed });
  });

  it("asks after a search the wait did not finish, then fetches it whole", async () => {
    const fetchImpl = answering(
      reply(202, pending),
      reply(200, { id: pending.id, state: "EXECUTING" }),
      reply(200, { id: pending.id, state: "COMPLETED" }),
      reply(200, SAMPLE_SEARCH),
    );
    const sleep = vi.fn<NonNullable<RunSearchOptions["sleep"]>>(async () => {});
    const outcome = await runSearch(options(fetchImpl, { sleep, pollMs: 500 }));
    expect(outcome).toEqual({ kind: "done", search: SAMPLE_SEARCH });
    expect(
      fetchImpl.mock.calls.map(
        ([url, init]) => `${init?.method ?? "GET"} ${url}`,
      ),
    ).toEqual([
      `POST ${BASE}/searches`,
      `GET ${BASE}/searches/${pending.id}/status`,
      `GET ${BASE}/searches/${pending.id}/status`,
      `GET ${BASE}/searches/${pending.id}`,
    ]);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep.mock.calls[0]![0]).toBe(500);
    // The questions carry the key and nothing that would start a search.
    expect(fetchImpl.mock.calls[1]![1]!.headers).toEqual({
      Accept: "application/json",
      "X-API-Key": "prod_secret",
    });
  });

  it("asks again after a question about a running search fails in passing", async () => {
    // A 503, a 429 and a 502 are the API's trouble, not the search's: the
    // search keeps running, so the page keeps asking after it.
    const fetchImpl = answering(
      reply(202, pending),
      reply(503, { detail: "x" }),
      reply(429, { code: 429, message: "slow", uri: null, metadata: {} }),
      reply(200, { id: pending.id, state: "COMPLETED" }),
      reply(502, { detail: "x" }),
      reply(200, { id: pending.id, state: "COMPLETED" }),
      reply(200, SAMPLE_SEARCH),
    );
    const outcome = await runSearch(options(fetchImpl, { pollMs: 500 }));
    expect(outcome).toEqual({ kind: "done", search: SAMPLE_SEARCH });
  });

  it("names the search when a question about it fails for good", async () => {
    const fetchImpl = answering(
      reply(202, pending),
      reply(401, { code: 21, message: "no", uri: null, metadata: {} }),
    );
    const outcome = await runSearch(options(fetchImpl));
    expect(outcome.kind).toBe("failed");
    const { message } = outcome as { message: string };
    // It was created and keeps running: not the words of a search that could
    // not be run, and the id to find it by.
    expect(message).toContain("does not recognize this key");
    expect(message).toContain("keeps running");
    expect(message).toContain(pending.id);
  });

  it("names the search when a question about it is answered with something else", async () => {
    const fetchImpl = answering(
      reply(202, pending),
      reply(200, { not: "a search" }),
    );
    const outcome = await runSearch(options(fetchImpl));
    expect(outcome.kind).toBe("failed");
    expect((outcome as { message: string }).message).toContain(pending.id);
  });

  it("makes its own key from random bytes where randomUUID is missing", async () => {
    // `crypto.randomUUID` exists only in secure contexts: a page served over
    // plain http from a host that is not localhost has no such function.
    vi.stubGlobal("crypto", {
      getRandomValues: globalThis.crypto.getRandomValues.bind(
        globalThis.crypto,
      ),
    });
    try {
      const fetchImpl = answering(reply(201, SAMPLE_SEARCH));
      await runSearch({
        baseUrl: BASE,
        apiKey: "prod_secret",
        businessToken: TOKEN,
        fetchImpl,
      });
      const headers = fetchImpl.mock.calls[0]![1]!.headers as Record<
        string,
        string
      >;
      expect(headers["Idempotency-Key"]).toMatch(/^[0-9a-f]{32}$/);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("gives up on a search that keeps running, naming it", async () => {
    const fetchImpl = vi.fn<FetchImpl>(async url =>
      url.endsWith("/searches")
        ? reply(202, pending)
        : reply(200, { id: pending.id, state: "EXECUTING" }),
    );
    const outcome = await runSearch(
      options(fetchImpl, { pollMs: 1_000, pollForMs: 3_000 }),
    );
    expect(outcome.kind).toBe("failed");
    const { message } = outcome as { message: string };
    expect(message).toContain(pending.id);
    // The page asked after it for 3 s, on top of the API's own wait: the words
    // must not give those 3 s as the search's age ("still executing after 3 s").
    expect(message).toContain("asked after it for 3 s and has stopped");
    expect(message).not.toMatch(/after 3 s/);
    // The post, then one question for each second the page waited.
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it.each([
    [401, null, /does not recognize this key/, false],
    [402, null, /locked/, false],
    [403, 30, /searches\.create/, false],
    [403, 37, /Autocomplete is not enabled/, false],
    [
      422,
      3040,
      /does not belong to this key's organization or environment/,
      true,
    ],
    [422, 3042, /expired.*15 minutes/, true],
    [422, 3023, /no longer on file/, true],
    [422, 3043, /sandbox application/, false],
    [503, 3041, /cannot search by pick/, false],
    [500, null, /could not run the search/, false],
  ])(
    "words a %i (code %s) and says whether to pick again",
    async (status, code, words, pickAgain) => {
      const body =
        code === null
          ? { detail: "x" }
          : { code, message: "m", uri: null, metadata: {} };
      const outcome = await runSearch(options(answering(reply(status, body))));
      expect(outcome).toMatchObject({
        kind: "refused",
        status,
        code,
        pickAgain,
      });
      expect((outcome as { message: string }).message).toMatch(words);
    },
  );

  it("tells a rate-limited key when to try again", async () => {
    const body = { code: 429, message: "slow", uri: null, metadata: {} };
    const outcome = await runSearch(
      options(answering(reply(429, body, { "retry-after": "12" }))),
    );
    expect(outcome).toMatchObject({ kind: "refused", status: 429 });
    expect((outcome as { message: string }).message).toContain("12 s");
  });

  it("carries a validation message through", () => {
    expect(describeSearchRefusal(422, null, "Field required")).toBe(
      "HTTP 422: Field required",
    );
    expect(describeSearchRefusal(418, 7, null)).toBe("HTTP 418, code 7");
  });

  it("reads a refusal's validation message when the body is the 422 list", async () => {
    const outcome = await runSearch(
      options(answering(reply(422, { detail: [{ msg: "Field required" }] }))),
    );
    expect((outcome as { message: string }).message).toBe(
      "HTTP 422: Field required",
    );
  });

  it("names CORS and the network when the API does not answer", async () => {
    const fetchImpl = vi.fn<FetchImpl>(async () => {
      throw new TypeError("Failed to fetch");
    });
    const outcome: SearchOutcome = await runSearch(options(fetchImpl));
    expect(outcome.kind).toBe("failed");
    expect((outcome as { message: string }).message).toMatch(/CORS/);
  });

  it("lets an abort through, for whoever stopped waiting", async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn<FetchImpl>(async (_url, init) => {
      controller.abort();
      throw init!.signal!.reason;
    });
    await expect(
      runSearch(options(fetchImpl, { signal: controller.signal })),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("does not take an answer it does not recognize for a search", async () => {
    for (const body of [{}, { id: "x", state: "WEIRD" }, [], "text"]) {
      const outcome = await runSearch(options(answering(reply(201, body))));
      expect(outcome.kind).toBe("failed");
    }
  });
});

describe("parseSearch", () => {
  it("holds on to a body with an id and a state this page knows", () => {
    expect(parseSearch({ id: "a", state: "COMPLETED", extra: 1 })).toEqual({
      id: "a",
      state: "COMPLETED",
      extra: 1,
    });
  });

  it("refuses the rest", () => {
    expect(parseSearch(null)).toBeNull();
    expect(parseSearch({ id: 1, state: "COMPLETED" })).toBeNull();
    expect(parseSearch({ id: "a", state: "DONE" })).toBeNull();
  });

  it("knows when a search has stopped", () => {
    expect(isTerminal("COMPLETED")).toBe(true);
    expect(isTerminal("FAILED")).toBe(true);
    expect(isTerminal("CANCELLED")).toBe(true);
    expect(isTerminal("PENDING")).toBe(false);
    expect(isTerminal("EXECUTING")).toBe(false);
  });
});
