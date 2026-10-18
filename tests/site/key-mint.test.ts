import { describe, expect, it, vi } from "vitest";

import { testKey } from "../../site/demo/connect";
import { keyMint, mintBody } from "../../site/demo/credentials";

// What the demo's own mint sends: the same bodyless request it has always
// sent, until the page is asked to set something on the session.

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

      await keyMint("https://api.test", "k", fetchImpl, { matchProfile })(
        context(),
      );

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

    await keyMint("https://api.test", "the-key", fetchImpl, {
      matchProfile: "max",
    })(context());

    const [, init] = fetchImpl.mock.calls[0]!;
    expect(init!.body).toBe('{"scope":{"match_profile":"max"}}');
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

    await keyMint("https://api.test", "k", fetchImpl, {
      matchProfile: "  Minimal ",
    })(context());

    expect(fetchImpl.mock.calls[0]![1]!.body).toBe(
      '{"scope":{"match_profile":"Minimal"}}',
    );
  });

  it("quotes what it was given, so a typed quote cannot reshape the body", () => {
    const body = mintBody({ matchProfile: 'x"},"routes":{"people":[]}' });

    expect(JSON.parse(body!)).toEqual({
      scope: { match_profile: 'x"},"routes":{"people":[]}' },
    });
  });

  it("reads the answer as it always did", async () => {
    const outcome = await keyMint("https://api.test", "k", api(), {
      matchProfile: "max",
    })(context());

    expect(outcome.kind).toBe("granted");
  });
});

describe("testKey, Apply's own mint", () => {
  it("carries the profile, so the session it hands the demo is the one asked for", async () => {
    const fetchImpl = api();

    const result = await testKey("https://api.test", "k", fetchImpl, {
      matchProfile: "reduced",
    });

    expect(result.ok).toBe(true);
    expect(fetchImpl.mock.calls[0]![1]!.body).toBe(
      '{"scope":{"match_profile":"reduced"}}',
    );
  });

  it("is bodyless with no profile", async () => {
    const fetchImpl = api();

    await testKey("https://api.test", "k", fetchImpl);

    expect("body" in fetchImpl.mock.calls[0]![1]!).toBe(false);
  });
});
