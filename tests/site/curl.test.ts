import { describe, expect, it } from "vitest";

import { compactJson, curlOf, parseCurl, urlOf } from "../../site/api/curl";

const MINT = `curl -s -X POST https://api.baselayer.com/autocomplete/sessions \\
  -H "X-API-Key: $BASELAYER_API_KEY" \\
  -H "Origin: https://app.example.com" \\
  -H "Content-Type: application/json" \\
  -d '{"scope": {"routes": {"businesses": ["addresses"]}, "max_limit": 5}}'`;

const PEOPLE = `curl -s "https://api.baselayer.com/autocomplete/people?q=dana%20whit&limit=5" \\
  -H "X-Autocomplete-Session: $SESSION" \\
  -H "Origin: https://app.example.com"`;

describe("a curl sample, read back", () => {
  it("gives a POST's URL, headers and JSON body", () => {
    expect(parseCurl(MINT)).toEqual({
      url: "https://api.baselayer.com/autocomplete/sessions",
      headers: [
        { name: "X-API-Key", value: "$BASELAYER_API_KEY" },
        { name: "Origin", value: "https://app.example.com" },
        { name: "Content-Type", value: "application/json" },
      ],
      query: [],
      body: { scope: { routes: { businesses: ["addresses"] }, max_limit: 5 } },
    });
  });

  it("gives a GET's query, decoded, and no body", () => {
    const sample = parseCurl(PEOPLE)!;
    expect(sample.url).toBe("https://api.baselayer.com/autocomplete/people");
    expect(sample.query).toEqual([
      { name: "q", value: "dana whit" },
      { name: "limit", value: "5" },
    ]);
    expect(sample.body).toBeUndefined();
  });

  it("gives nothing for a sample with no URL", () => {
    expect(parseCurl("echo hello")).toBeNull();
  });
});

describe("the request, written back", () => {
  it("encodes the query and leaves out a pair with no name", () => {
    expect(
      urlOf("https://x.test/p", [
        { name: "q", value: "dana whit" },
        { name: "", value: "ignored" },
        { name: "state", value: "PA&DE" },
      ]),
    ).toBe("https://x.test/p?q=dana%20whit&state=PA%26DE");
    expect(urlOf("https://x.test/p", [])).toBe("https://x.test/p");
  });

  it("spaces JSON as the samples do", () => {
    expect(compactJson({ a: [1, "b"], c: { d: null } })).toBe(
      '{"a": [1, "b"], "c": {"d": null}}',
    );
  });

  it("writes the curl a sample would, and reads back as the same request", () => {
    const sample = parseCurl(MINT)!;
    const curl = curlOf({
      method: "post",
      url: sample.url,
      headers: sample.headers,
      body: sample.body,
    });
    expect(curl)
      .toBe(`curl -s -X POST "https://api.baselayer.com/autocomplete/sessions" \\
  -H "X-API-Key: $BASELAYER_API_KEY" \\
  -H "Origin: https://app.example.com" \\
  -H "Content-Type: application/json" \\
  -d '{"scope": {"routes": {"businesses": ["addresses"]}, "max_limit": 5}}'`);
    expect(parseCurl(curl)).toEqual(sample);
  });

  it("keeps a quote in a value from ending the shell's string", () => {
    const curl = curlOf({
      method: "post",
      url: "https://x.test/p",
      headers: [{ name: "Origin", value: 'a"b' }],
      body: { name: "it's" },
    });
    expect(curl).toContain('-H "Origin: a\\"b"');
    expect(curl).toContain(`-d '{"name": "it'\\''s"}'`);
  });
});
