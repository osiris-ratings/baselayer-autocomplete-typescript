import { afterEach, describe, expect, it, vi } from "vitest";

import {
  NetworkLog,
  bodyHtml,
  cutShort,
  indentJson,
  kindOf,
  maxBody,
  routeOf,
  redactBody,
  redactTokens,
  urlParts,
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

describe("urlParts", () => {
  it("tells the host from the path, each query parameter's name from its value, and mutes the escapes", () => {
    const url =
      "https://api.baselayer.com/autocomplete/people?q=jane+doe&include=businesses%2Caddresses&business.name=harbo";
    const parts = urlParts(url);
    expect(parts.map(p => p.text).join("")).toBe(url);
    expect(parts).toEqual([
      { text: "https://", part: "scheme" },
      { text: "api.baselayer.com", part: "host" },
      { text: "/", part: "sign" },
      { text: "autocomplete", part: "path" },
      { text: "/", part: "sign" },
      { text: "people", part: "path" },
      { text: "?", part: "sign" },
      { text: "q", part: "key" },
      { text: "=", part: "sign" },
      { text: "jane", part: "value" },
      { text: "+", part: "escape" },
      { text: "doe", part: "value" },
      { text: "&", part: "sign" },
      { text: "include", part: "key" },
      { text: "=", part: "sign" },
      { text: "businesses", part: "value" },
      { text: "%2C", part: "escape" },
      { text: "addresses", part: "value" },
      { text: "&", part: "sign" },
      { text: "business.name", part: "key" },
      { text: "=", part: "sign" },
      { text: "harbo", part: "value" },
    ]);
  });

  it("splits a URL without a query into its scheme, host and path", () => {
    expect(urlParts("http://localhost:3000/_baselayer/searches")).toEqual([
      { text: "http://", part: "scheme" },
      { text: "localhost:3000", part: "host" },
      { text: "/", part: "sign" },
      { text: "_baselayer", part: "path" },
      { text: "/", part: "sign" },
      { text: "searches", part: "path" },
    ]);
  });

  it("keeps a parameter without a value, or with an empty one", () => {
    const url = "https://x.test/a?flag&q=&limit=5";
    const parts = urlParts(url);
    expect(parts.map(p => p.text).join("")).toBe(url);
    expect(parts.filter(p => p.part === "key").map(p => p.text)).toEqual([
      "flag",
      "q",
      "limit",
    ]);
    expect(parts.filter(p => p.part === "value").map(p => p.text)).toEqual([
      "5",
    ]);
  });
});

describe("bodyHtml", () => {
  const html = bodyHtml(
    JSON.stringify({
      found: 2,
      capped: true,
      cut: false,
      token: null,
      note: "null",
    }),
  );

  it("indents the body and marks it up as JSON", () => {
    expect(html).toContain("sh__token--property");
    expect(html.split('class="sh__line"')).toHaveLength(8);
  });

  it("draws null in its own colour, and leaves true, false and a string that says null be", () => {
    const keywords = [
      ...html.matchAll(
        /<span class="sh__token--keyword" style="([^"]*)">(\w+)</g,
      ),
    ].map(([, style, word]) => [word, style]);
    expect(keywords).toEqual([
      ["true", "color:var(--sh-keyword)"],
      ["false", "color:var(--sh-keyword)"],
      ["null", "color:var(--json-null)"],
    ]);
    expect(html).toContain(
      '<span class="sh__token--string" style="color:var(--sh-string)">&quot;null&quot;</span>',
    );
  });

  it("escapes what the server sent", () => {
    expect(bodyHtml('{"name": "<img src=x onerror=alert(1)>"}')).toContain(
      "&lt;img src=x onerror=alert(1)&gt;",
    );
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
