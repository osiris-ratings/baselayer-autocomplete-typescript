import { describe, expect, it } from "vitest";

import { samplesOf, tsLiteral } from "../../site/api/snippets";

const MINT = {
  method: "post",
  url: "https://api.baselayer.com/autocomplete/sessions",
  headers: [
    { name: "X-API-Key", value: "$BASELAYER_API_KEY" },
    { name: "Origin", value: "https://app.example.com" },
    { name: "Content-Type", value: "application/json" },
  ],
  query: [],
  body: { scope: { routes: { businesses: ["addresses"] }, max_limit: 5 } },
};

const search = (route: string, query: [string, string][]) => ({
  method: "get",
  url: `https://api.baselayer.com/autocomplete/${route}`,
  headers: [
    { name: "X-Autocomplete-Session", value: "$SESSION" },
    { name: "Origin", value: "https://app.example.com" },
  ],
  query: query.map(([name, value]) => ({ name, value })),
  body: undefined,
});

describe("the samples, written from the form", () => {
  it("writes the mint as the Node sample does, the body's scope as the helper's", () => {
    expect(samplesOf(MINT, ["Node"]).Node)
      .toBe(`import { mintForOrigin } from "@baselayer-sdk/autocomplete/server";

const out = await mintForOrigin({
  apiKey: process.env.BASELAYER_API_KEY!,
  origin: "https://app.example.com",
  // Optional: what the session may search.
  scope: { routes: { businesses: ["addresses"] }, maxLimit: 5 },
});
// out.status, out.headers (Retry-After) and out.body, to pass through`);
  });

  it("leaves the scope out of the mint where the body has none, and writes a key typed in as a string", () => {
    const node = samplesOf(
      {
        ...MINT,
        headers: [{ name: "X-API-Key", value: "sk_test_example" }],
        body: {},
      },
      ["Node"],
    ).Node!;
    expect(node).toContain('apiKey: "sk_test_example",');
    expect(node).not.toContain("scope");
  });

  it("writes a search as the fetch sample does, the browser's own headers left out", () => {
    expect(
      samplesOf(
        search("businesses", [
          ["q", "harbor concrete"],
          ["limit", "5"],
        ]),
        ["fetch"],
      ).fetch,
    )
      .toBe(`const url = new URL("https://api.baselayer.com/autocomplete/businesses");
url.searchParams.set("q", "harbor concrete");
url.searchParams.set("limit", "5");

const response = await fetch(url, {
  headers: { "X-Autocomplete-Session": sessionToken },
  credentials: "omit",
  signal,
});`);
  });

  it("writes a search with the SDK: its filters by the SDK's names, a list where it takes one", () => {
    expect(
      samplesOf(
        search("people", [
          ["q", "dana whit"],
          ["business.state", "PA,DE"],
          ["business.name", "harbor"],
        ]),
        ["SDK"],
      ).SDK,
    ).toBe(`const { response } = await client.search(
  "people",
  { q: "dana whit", filters: { business: { state: ["PA", "DE"], name: "harbor" } } },
  { signal },
);`);
    expect(
      samplesOf(
        search("businesses", [
          ["q", "harbor"],
          ["limit", "5"],
          ["domicile_state", "DE"],
          ["include", "people,addresses"],
        ]),
        ["SDK"],
      ).SDK,
    ).toBe(`const { response, indexTag, roundTripMs } = await client.suggest(
  { q: "harbor", limit: 5, include: ["people", "addresses"], filters: { domicileState: "DE" } },
  { signal },
);`);
  });

  it("says which parameter the SDK has no option for", () => {
    expect(
      samplesOf(
        search("businesses", [
          ["q", "x"],
          ["structure", "LLC"],
        ]),
        ["SDK"],
      ).SDK,
    ).toContain("// Not an SDK option: structure=LLC");
  });

  it("writes curl for any request, and nothing for a sample it cannot write", () => {
    const samples = samplesOf(MINT, ["curl", "fetch", "SDK", "python"]);
    expect(Object.keys(samples)).toEqual(["curl"]);
    expect(samples.curl).toContain('-d \'{"scope": {"routes"');
  });
});

describe("a value as TypeScript writes it", () => {
  it("quotes only the keys that need it", () => {
    expect(
      tsLiteral({ q: "a", "max-limit": 5, list: [1, "b"], empty: {} }),
    ).toBe('{ q: "a", "max-limit": 5, list: [1, "b"], empty: {} }');
  });
});
