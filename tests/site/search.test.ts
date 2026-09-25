import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { searchExample } from "../../site/demo/search";
import { SEARCH_SNIPPET } from "../../site/home/search";

// `POST /searches` takes a picked row's token on its own, and refuses one sent
// beside a name or an address. Wherever the site or the README shows the body,
// it carries the token and nothing else.

const TOKEN = "A4uYMdTtN1PuVsmNF8kQ2wZr7Hc-Xp0_LbVe9Jt3nGyU5sDa";

const readme = readFileSync(
  fileURLToPath(new URL("../../README.md", import.meta.url)),
  "utf8",
);

/** Every JSON block in the README that carries a token. */
const readmeBodies = [...readme.matchAll(/```json\n([\s\S]*?)\n```/g)]
  .map(([, code]) => code!)
  .filter(code => code.includes("business_token"));

/** A page under site/, as source. */
const page = (path: string) =>
  readFileSync(
    fileURLToPath(new URL(`../../site/${path}`, import.meta.url)),
    "utf8",
  );

describe("the demo's search for a pick", () => {
  const [request, ...body] = searchExample(
    "https://api.baselayer.com",
    TOKEN,
  ).split("\n");
  // The cut-short token is still a JSON string, so the body parses.
  const sent = JSON.parse(body.join("\n")) as Record<string, unknown>;

  it("posts to the API the page reaches", () => {
    expect(request).toBe("POST https://api.baselayer.com/searches");
  });

  it("sends the token alone, with no name or address beside it", () => {
    expect(Object.keys(sent)).toEqual(["business_token"]);
  });

  it("shows the token's first 24 characters, then an ellipsis", () => {
    expect(sent["business_token"]).toBe("A4uYMdTtN1PuVsmNF8kQ2wZr…");
  });
});

describe("the overview's step 3", () => {
  it("shows a body that is the token alone", () => {
    const [snippet] = SEARCH_SNIPPET;
    expect(snippet?.lang).toBe("json");
    expect(Object.keys(JSON.parse(snippet!.code) as object)).toEqual([
      "business_token",
    ]);
  });
});

describe("the README's search body", () => {
  it("is the token alone, wherever it is shown", () => {
    expect(readmeBodies.length).toBeGreaterThan(0);
    for (const code of readmeBodies) {
      expect(Object.keys(JSON.parse(code) as object)).toEqual([
        "business_token",
      ]);
    }
  });
});

// The pages draw the body from the modules above, so neither builds its own.
describe("the pages that show the body", () => {
  it("take it from the modules, and write none inline", () => {
    const app = page("demo/App.tsx");
    const home = page("home/Home.tsx");
    expect(app).toContain("searchExample(apiHost, picked.pick.businessToken)");
    expect(home).toContain("snippets={SEARCH_SNIPPET}");
    expect(app + home).not.toMatch(/"business_token":/);
  });
});
