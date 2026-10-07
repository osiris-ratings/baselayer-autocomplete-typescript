import { afterEach, describe, expect, it, vi } from "vitest";

import {
  NetworkLog,
  cutShort,
  indentJson,
  kindOf,
  maxBody,
  routeOf,
  redactBody,
  redactTokens,
} from "../../site/demo/network";

// What Debug › Network keeps of a request, and what it keeps out of sight.

const TOKEN = "A4uYMdTtN1PuVsmNF8kQ2wZr7Hc-Xp0_LbVe9Jt3nGyU5sDa";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("kindOf", () => {
  it.each([
    ["/autocomplete/sessions", "mint"],
    ["/autocomplete/businesses", "autocomplete"],
    ["/autocomplete/people?q=dana", "autocomplete"],
    ["/autocomplete/addresses?q=1200", "autocomplete"],
    ["/searches", "search"],
    ["/searches/5f0c2d3e/status", "search"],
    ["/autocomplete/version", "other"],
  ])("sorts %s as %s", (path, kind) => {
    expect(kindOf(path)).toBe(kind);
  });

  it.each([
    ["/autocomplete/businesses?q=harbor", "businesses"],
    ["/autocomplete/people?q=dana", "people"],
    ["/autocomplete/addresses?q=1200", "addresses"],
    ["/autocomplete/sessions", null],
    ["/searches", null],
  ])("names the route %s asks: %s", (path, route) => {
    expect(routeOf(path)).toBe(route);
  });

  it("keeps a whole search report, which is bigger than 16 kB", () => {
    expect(maxBody("search")).toBeGreaterThan(100_000);
    expect(maxBody("autocomplete")).toBe(16_384);
    expect(maxBody("mint")).toBe(16_384);
  });
});

describe("redactBody", () => {
  it("cuts the tokens a body carries, and indents it", () => {
    const sent = redactBody(JSON.stringify({ business_token: TOKEN }));
    expect(sent).toBe(
      `{\n  "business_token": "${TOKEN.slice(0, 16)}… (${TOKEN.length} characters)"\n}`,
    );
    expect(sent).not.toContain(TOKEN);
    const minted = redactBody(
      JSON.stringify({ session_token: TOKEN, expires_in: 120 }),
    );
    expect(minted).not.toContain(TOKEN);
    expect(minted).toContain('"expires_in": 120');
  });

  it("leaves a body that is not JSON as it is", () => {
    expect(redactBody("not json")).toBe("not json");
    expect(redactBody('{"cut off": "…')).toBe('{"cut off": "…');
  });

  it("cuts a token a body holds at any depth", () => {
    expect(redactBody(JSON.stringify({ a: { business_token: TOKEN } }))).toBe(
      `{\n  "a": {\n    "business_token": "${cutShort(TOKEN)}"\n  }\n}`,
    );
  });
});

describe("redactTokens", () => {
  it("cuts the token every row of the autocomplete service's answer carries", () => {
    const answer = JSON.stringify({
      suggestions: [{ type: "business", token: TOKEN, label: "ACME" }],
      next_token: "stays",
    });
    const cut = redactTokens(answer);
    expect(cut).not.toContain(TOKEN);
    expect(cut).toContain(`"token":"${cutShort(TOKEN)}"`);
    expect(cut).toContain('"next_token":"stays"');
  });

  it("cuts the tokens of a body that is cut off, which is not JSON", () => {
    const cutOff = `{"suggestions":[{"token":"${TOKEN}","label":"A"},{"token":"${TOKEN}","la`;
    expect(redactTokens(cutOff)).not.toContain(TOKEN);
    expect(indentJson(cutOff)).toBe(cutOff);
  });
});

describe("NetworkLog.fetch", () => {
  function setUp(body: string, status = 201) {
    vi.stubGlobal("window", {
      location: { href: "https://sdk.baselayer.com/autocomplete/demo/" },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(body, {
            status,
            headers: { "content-type": "application/json" },
          }),
      ),
    );
    return new NetworkLog();
  }

  async function finished(log: NetworkLog) {
    await vi.waitFor(() => {
      expect(log.getSnapshot()[0]?.outcome).toBe("done");
    });
    return log.getSnapshot()[0]!;
  }

  it("records a search: its body with the token cut, its key redacted, its whole answer", async () => {
    const answer = JSON.stringify({ id: "x", pad: "y".repeat(40_000) });
    const log = setUp(answer);
    await log.fetch("https://api.baselayer.com/searches", {
      method: "POST",
      headers: {
        "X-API-Key": "prod_secret",
        Prefer: "wait=90",
        "Idempotency-Key": "key-1",
      },
      body: JSON.stringify({ business_token: TOKEN }),
    });
    const entry = await finished(log);
    expect(entry).toMatchObject({
      kind: "search",
      method: "POST",
      path: "/searches",
      status: 201,
    });
    expect(entry.requestHeaders["x-api-key"]).toBe("•••••• (redacted)");
    expect(entry.requestHeaders["prefer"]).toBe("wait=90");
    expect(entry.requestBody).not.toContain(TOKEN);
    expect(entry.requestBody).toContain(`(${TOKEN.length} characters)`);
    expect(JSON.stringify(entry)).not.toContain("prod_secret");
    // A search's answer is kept whole.
    expect(entry.body).toBe(answer);
  });

  it("cuts any other answer at 16 kB", async () => {
    const log = setUp(JSON.stringify({ pad: "y".repeat(40_000) }), 200);
    await log.fetch("https://api.baselayer.com/autocomplete/sessions", {
      method: "POST",
    });
    const entry = await finished(log);
    expect(entry.kind).toBe("mint");
    expect(entry.requestBody).toBeNull();
    expect(entry.body?.length).toBeLessThan(16_400);
    expect(entry.body?.endsWith("\n…")).toBe(true);
  });

  it("cuts the tokens of an answer before it cuts the answer", async () => {
    const rows = Array.from({ length: 400 }, (_, row) => ({
      type: "business",
      token: `${TOKEN}${row}`,
      label: `ACME ${row}`,
    }));
    const log = setUp(JSON.stringify({ suggestions: rows }), 200);
    await log.fetch("https://api.baselayer.com/autocomplete/businesses?q=acme");
    const entry = await finished(log);
    expect(entry.kind).toBe("autocomplete");
    // Over 16 kB, so the body is cut and is no longer JSON; no token is whole.
    expect(entry.body?.endsWith("\n…")).toBe(true);
    expect(entry.body).not.toContain(TOKEN);
    expect(entry.body).toContain("characters)");
  });

  it("keeps a request that is still out when the log is cleared", async () => {
    let answer: (response: Response) => void = () => undefined;
    vi.stubGlobal("window", {
      location: { href: "https://sdk.baselayer.com/autocomplete/demo/" },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>(resolve => {
            answer = resolve;
          }),
      ),
    );
    const log = new NetworkLog();
    const sent = log.fetch("https://api.baselayer.com/searches", {
      method: "POST",
    });
    log.clear();
    expect(log.getSnapshot()).toHaveLength(1);
    answer(new Response("{}", { status: 201 }));
    await sent;
    const entry = await finished(log);
    expect(entry).toMatchObject({ kind: "search", status: 201 });
    log.clear();
    expect(log.getSnapshot()).toHaveLength(0);
  });

  it("keeps the dev server's prefix out of the path, and the search a search", async () => {
    const log = setUp("{}", 200);
    await log.fetch("/_baselayer/searches/abc/status");
    const entry = await finished(log);
    expect(entry).toMatchObject({
      kind: "search",
      path: "/searches/abc/status",
      viaDevServer: true,
    });
  });
});
