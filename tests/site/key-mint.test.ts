import { LEGAL_RELATIONS } from "@baselayer-sdk/autocomplete";
import { describe, expect, it, vi } from "vitest";

import { testKey } from "../../site/demo/connect";
import {
  keyMint,
  mintBody,
  NO_SESSION_SETTINGS,
  type SessionSettings,
} from "../../site/demo/credentials";

// What the demo's own mint sends: the same bodyless request it has always
// sent, until the page is asked to set something on the session: a scope (the
// routes it may query, the most rows a request may ask for) or a match profile.

const settings = (set: Partial<SessionSettings>): SessionSettings => ({
  ...NO_SESSION_SETTINGS,
  ...set,
});

const GRANT = {
  session_token: "session-token",
  expires_in: 300,
  request_budget: 50,
  pivot_allowance: 5,
  filter_min_stem: 3,
};

function api() {
  return vi.fn<(input: string, init?: RequestInit) => Promise<Response>>(
    async () =>
      new Response(JSON.stringify(GRANT), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
  );
}

const context = () => ({
  reason: "cold" as const,
  signal: new AbortController().signal,
});

describe("the mint with nothing set", () => {
  it("is exactly the request it always was: no body and no Content-Type", async () => {
    const fetchImpl = api();

    await keyMint("https://api.test", "the-key", fetchImpl)(context());

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://api.test/autocomplete/sessions");
    expect(init).toEqual({
      method: "POST",
      headers: { Accept: "application/json", "X-API-Key": "the-key" },
      credentials: "omit",
      signal: expect.any(AbortSignal),
    });
    expect("body" in init!).toBe(false);
  });

  it("is that request whatever a blank setting holds", async () => {
    for (const matchProfile of ["", "   ", "\t\n"]) {
      const fetchImpl = api();

      await keyMint(
        "https://api.test",
        "k",
        fetchImpl,
        settings({ matchProfile }),
      )(context());

      const [, init] = fetchImpl.mock.calls[0]!;
      expect("body" in init!).toBe(false);
      expect(init!.headers).toEqual({
        Accept: "application/json",
        "X-API-Key": "k",
      });
    }
  });
});

describe("the mint with a match profile", () => {
  it("sends it as scope.match_profile, as JSON", async () => {
    const fetchImpl = api();

    await keyMint(
      "https://api.test",
      "the-key",
      fetchImpl,
      settings({ matchProfile: "tuned" }),
    )(context());

    const [, init] = fetchImpl.mock.calls[0]!;
    expect(init!.body).toBe('{"scope":{"match_profile":"tuned"}}');
    expect(init!.headers).toEqual({
      Accept: "application/json",
      "X-API-Key": "the-key",
      "Content-Type": "application/json",
    });
    // Nothing else about the request moves.
    expect(init!.method).toBe("POST");
    expect(init!.credentials).toBe("omit");
  });

  it("sends the profile as typed, less the spaces around it", async () => {
    const fetchImpl = api();

    await keyMint(
      "https://api.test",
      "k",
      fetchImpl,
      settings({ matchProfile: "  Minimal " }),
    )(context());

    expect(fetchImpl.mock.calls[0]![1]!.body).toBe(
      '{"scope":{"match_profile":"Minimal"}}',
    );
  });

  it("quotes what it was given, so a typed quote cannot reshape the body", () => {
    const body = mintBody(
      settings({ matchProfile: 'x"},"routes":{"people":[]}' }),
    );

    expect(JSON.parse(body!)).toEqual({
      scope: { match_profile: 'x"},"routes":{"people":[]}' },
    });
  });

  it("reads the answer as it always did", async () => {
    const outcome = await keyMint(
      "https://api.test",
      "k",
      api(),
      settings({ matchProfile: "tuned" }),
    )(context());

    expect(outcome.kind).toBe("granted");
  });
});

describe("the mint with a scope", () => {
  it("narrows to the routes ticked, each with every relation it carries", () => {
    expect(JSON.parse(mintBody(settings({ routes: ["people"] }))!)).toEqual({
      scope: { routes: { people: [...LEGAL_RELATIONS.people] } },
    });
    expect(
      JSON.parse(mintBody(settings({ routes: ["businesses", "addresses"] }))!),
    ).toEqual({
      scope: {
        routes: {
          businesses: [...LEGAL_RELATIONS.businesses],
          addresses: [...LEGAL_RELATIONS.addresses],
        },
      },
    });
  });

  it("names the routes in the API's own order, whatever order they were ticked in", () => {
    const body = mintBody(settings({ routes: ["addresses", "businesses"] }));

    expect(Object.keys(JSON.parse(body!).scope.routes)).toEqual([
      "businesses",
      "addresses",
    ]);
  });

  it("asks for the most rows a request may ask for as max_limit", () => {
    expect(mintBody(settings({ maxLimit: 5 }))).toBe(
      '{"scope":{"max_limit":5}}',
    );
    expect(mintBody(settings({ maxLimit: 20 }))).toBe(
      '{"scope":{"max_limit":20}}',
    );
  });

  it("sends only what is set, in one scope: routes, max_limit, match_profile", () => {
    expect(
      mintBody(
        settings({
          routes: ["people"],
          maxLimit: 3,
          matchProfile: "tuned",
        }),
      ),
    ).toBe(
      JSON.stringify({
        scope: {
          routes: { people: [...LEGAL_RELATIONS.people] },
          max_limit: 3,
          match_profile: "tuned",
        },
      }),
    );
    expect(mintBody(settings({ maxLimit: 3, matchProfile: "tuned" }))).toBe(
      '{"scope":{"max_limit":3,"match_profile":"tuned"}}',
    );
    expect(
      JSON.parse(mintBody(settings({ routes: ["people"], maxLimit: 3 }))!),
    ).not.toHaveProperty("scope.match_profile");
  });

  it("is no body at all with no route ticked, no limit, and no profile", () => {
    expect(mintBody(NO_SESSION_SETTINGS)).toBeNull();
    expect(mintBody(settings({ routes: [], maxLimit: null }))).toBeNull();
  });

  it("goes in the request as JSON, with the one Content-Type", async () => {
    const fetchImpl = api();

    await keyMint(
      "https://api.test",
      "the-key",
      fetchImpl,
      settings({ routes: ["businesses"], maxLimit: 7 }),
    )(context());

    const [, init] = fetchImpl.mock.calls[0]!;
    expect(JSON.parse(init!.body as string)).toEqual({
      scope: {
        routes: { businesses: [...LEGAL_RELATIONS.businesses] },
        max_limit: 7,
      },
    });
    expect(init!.headers).toEqual({
      Accept: "application/json",
      "X-API-Key": "the-key",
      "Content-Type": "application/json",
    });
  });

  it("is a bodyless request when only blank things are set", async () => {
    const fetchImpl = api();

    await keyMint(
      "https://api.test",
      "k",
      fetchImpl,
      settings({ routes: [], maxLimit: null, matchProfile: "  " }),
    )(context());

    expect("body" in fetchImpl.mock.calls[0]![1]!).toBe(false);
  });
});

describe("the mint from the published page, which calls the API from another origin", () => {
  // The browser sends a preflight before a request with a header it does not
  // take for granted, and the API has to allow every one it names:
  // api.baselayer.com allows any (its CORS_HEADERS is `*`). A header added to
  // the mint is one more it asks for.
  const preflighted = (init: RequestInit) =>
    [...new Headers(init.headers).keys()]
      .filter(
        name =>
          !["accept", "accept-language", "content-language"].includes(name),
      )
      .sort();

  it("asks the API to allow the key's header and the JSON body's, and nothing else", async () => {
    const fetchImpl = api();

    await keyMint(
      "https://api.baselayer.com",
      "the-key",
      fetchImpl,
      settings({ routes: ["people"], maxLimit: 5 }),
    )(context());

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://api.baselayer.com/autocomplete/sessions");
    expect(init!.method).toBe("POST");
    expect(init!.credentials).toBe("omit");
    expect(preflighted(init!)).toEqual(["content-type", "x-api-key"]);
    expect(new Headers(init!.headers).get("content-type")).toBe(
      "application/json",
    );
  });

  it("asks for the key's header only with nothing set, as it always did", async () => {
    const fetchImpl = api();

    await keyMint("https://api.baselayer.com", "the-key", fetchImpl)(context());

    expect(preflighted(fetchImpl.mock.calls[0]![1]!)).toEqual(["x-api-key"]);
  });
});

describe("testKey, Apply's own mint", () => {
  it("carries the profile, so the session it hands the demo is the one asked for", async () => {
    const fetchImpl = api();

    const result = await testKey(
      "https://api.test",
      "k",
      fetchImpl,
      settings({ matchProfile: "reduced" }),
    );

    expect(result.ok).toBe(true);
    expect(fetchImpl.mock.calls[0]![1]!.body).toBe(
      '{"scope":{"match_profile":"reduced"}}',
    );
  });

  it("carries a scope too", async () => {
    const fetchImpl = api();

    await testKey(
      "https://api.test",
      "k",
      fetchImpl,
      settings({ routes: ["addresses"], maxLimit: 4 }),
    );

    expect(JSON.parse(fetchImpl.mock.calls[0]![1]!.body as string)).toEqual({
      scope: {
        routes: { addresses: [...LEGAL_RELATIONS.addresses] },
        max_limit: 4,
      },
    });
  });

  it("is bodyless with no profile", async () => {
    const fetchImpl = api();

    await testKey("https://api.test", "k", fetchImpl);

    expect("body" in fetchImpl.mock.calls[0]![1]!).toBe(false);
  });
});
