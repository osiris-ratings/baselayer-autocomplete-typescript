import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SAMPLE_SUGGESTIONS } from "../../site/demo/sample";
import { SearchStep } from "../../site/demo/SearchStep";

// Step 03 as a pick leaves it, before a search is run; and where the demo puts
// it: not on the page until there is a pick to search.

const suggestion = SAMPLE_SUGGESTIONS[0]!;

function html(expiresInMs: number) {
  return renderToStaticMarkup(
    <SearchStep
      apiKey="key"
      baseUrl="https://api.example.test"
      apiHost="https://api.example.test"
      picked={{
        suggestion,
        pick: {
          businessToken: "token",
          pickedAt: Date.now(),
          expiresAt: Date.now() + expiresInMs,
          matchedOn: [],
        },
        asked: [],
      }}
      fetchImpl={() => Promise.reject(new Error("not called"))}
      onShowDebug={() => undefined}
    />,
  );
}

const text = (markup: string) =>
  markup
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

const runButton = (markup: string) =>
  markup.match(/<button[^>]*data-testid="demo-search-run"[^>]*>/)?.[0] ?? "";

describe("step 03 for a fresh pick", () => {
  const markup = html(10 * 60_000);
  const words = text(markup);

  it("names the business and counts down its token", () => {
    expect(words).toContain("03 Run a business search");
    expect(words).toContain(suggestion.label);
    expect(words).toContain("Its token is good for");
  });

  it("says where the business is domiciled and registered", () => {
    expect(words).toContain(
      `Domiciled in ${suggestion.domicile_state}, registered in ${suggestion.states.join(", ")}.`,
    );
  });

  it("keeps the request it will send folded, under a link", () => {
    expect(words).toContain("See the request body");
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toMatch(/class="fold-body" data-open="false" inert=""/);
    // Folded away is the whole request, with the token cut short.
    expect(words).toContain("POST https://api.example.test/searches");
    expect(markup).toContain("business_token");
    expect(markup).toContain("token…");
  });

  it("offers the search, and says it is billable", () => {
    expect(runButton(markup)).not.toBe("");
    expect(runButton(markup)).not.toContain("disabled");
    expect(words).toContain("Run business search");
    expect(words).toContain("billable");
  });

  it("shows no report before a search is run", () => {
    expect(markup).not.toContain("demo-search-result");
    expect(markup).not.toContain("demo-search-error");
  });
});

describe("step 03 for a pick whose token has expired", () => {
  const markup = html(-1_000);
  const words = text(markup);

  it("says so, and cannot run", () => {
    expect(words).toContain("Its token expired.");
    expect(words).toContain("Pick the business again");
    expect(runButton(markup)).toContain('disabled=""');
  });
});

describe("the demo's use of step 03", () => {
  it("mounts it only once a business is picked", () => {
    const app = readFileSync(
      fileURLToPath(new URL("../../site/demo/App.tsx", import.meta.url)),
      "utf8",
    );
    expect(app.match(/<SearchStep/g)).toHaveLength(1);
    expect(app).toMatch(/picked !== null && \(\s*<SearchStep/);
  });

  it("names the host of the connection that was applied, not the form's", () => {
    const app = readFileSync(
      fileURLToPath(new URL("../../site/demo/App.tsx", import.meta.url)),
      "utf8",
    );
    // `apiHost` (the form's, which changes before Apply) is for the Connect
    // card; the request Run sends goes to `applied.baseUrl`.
    expect(app).toMatch(/apiHost=\{\s*applied\.environment === "custom"/);
    expect(app).not.toMatch(/apiHost=\{apiHost\}/);
  });

  it("leaves the pick and its request to that step, not step 02", () => {
    const app = readFileSync(
      fileURLToPath(new URL("../../site/demo/App.tsx", import.meta.url)),
      "utf8",
    );
    expect(app).not.toContain("demo-pick");
    expect(app).not.toContain("searchExample");
  });
});
