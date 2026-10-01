import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SearchResult } from "../../site/demo/SearchResult";
import { SAMPLE_SEARCH } from "../../site/demo/sample-search";
import type { Search } from "../../site/demo/searches";

// The report a finished search is drawn as, from the made-up sample and from
// searches with less to say: nothing may read `undefined` or `null`.

const html = (search: Search, elapsedMs: number | null = 4_200) =>
  renderToStaticMarkup(<SearchResult search={search} elapsedMs={elapsedMs} />);

const text = (markup: string) =>
  markup
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ");

function expectClean(markup: string) {
  const words = text(markup);
  for (const bad of ["undefined", "null", "NaN", "[object", "Infinity"]) {
    expect(words).not.toContain(bad);
  }
}

describe("the report for a completed search", () => {
  const markup = html(SAMPLE_SEARCH);
  const words = text(markup);

  it("leads with the business, the verdict and how long it took", () => {
    expect(words).toContain("Harbor Concrete Pumping Co., Inc.");
    expect(words).toContain("Verified");
    expect(words).toContain("finished in 4.2 s");
    expect(markup).toContain(SAMPLE_SEARCH.id);
  });

  it("sums the business up in a line under its name", () => {
    expect(words).toContain(
      "Incorporated in PA 15 years and 6 months in business active in 2 states 2 officers no watchlist hits",
    );
  });

  it("draws the two ratings with their letters", () => {
    expect(words).toContain("KYB rating");
    expect(words).toContain("Risk rating");
    expect(words).toContain("Low risk");
    expect(markup).toContain('data-grade="A"');
    expect(markup).toContain('aria-label="KYB rating: A, 95 out of 100"');
  });

  it("sets the search against the business, with its pills", () => {
    expect(words).toContain("Your search");
    expect(words).toContain("Matched business");
    expect(words).toContain("Legal entity address");
    expect(words).toContain("Exact match");
    expect(words).toContain("1200 River Rd, Pittsburgh, PA 15212");
  });

  it("describes the business", () => {
    expect(words).toContain("C corporation");
    expect(words).toContain("PA · 03/14/2011 · (15 years and 6 months)");
    expect(words).toContain("Harbor Pumping, HCP Concrete");
    expect(words).toContain("PO Box 442, Bridgeville, PA 15017");
    expect(words).toContain("Mail drop (CMRA)");
    expect(words).toContain("Deliverable");
  });

  it("lists the filings, the home state first", () => {
    expect(words).toContain("Secretary of State filings 3");
    expect(words.indexOf("Domestic filing in PA")).toBeGreaterThan(-1);
    expect(words.indexOf("Domestic filing in PA")).toBeLessThan(
      words.indexOf("Foreign filing in OH"),
    );
    expect(words).toContain("4017743");
    expect(words).toContain("Meridian Registered Agents, LLC");
    expect(words).toContain("Dana Whitfield (President, Director)");
    expect(words).toContain("Inactive");
    expect(words).toContain("Forfeited");
    expect(words).toContain("11/30/2019");
    // The OH filing's standing is "Active", which its chip already says.
    expect(words).not.toContain("Active Active");
  });

  it("marks the home state's own filing, and ends each title row with its status", () => {
    expect(markup).toContain(
      'class="sr-state" data-kind="domestic" aria-hidden="true">PA<',
    );
    expect(markup).toContain(
      'class="sr-state" data-kind="foreign" aria-hidden="true">OH<',
    );
    // The title, then the status group (the state's word for it, if it says
    // more than the chip) with the chip last.
    expect(markup).toMatch(
      /<strong>Domestic filing in PA<\/strong><span class="sr-filing-status">.*?<span class="sr-chip" data-tone="good">Active<\/span><\/span>/,
    );
    expect(markup).toMatch(
      /<strong>Foreign filing in MD<\/strong><span class="sr-filing-status">.*?<span class="sr-chip" data-tone="bad">Inactive<\/span><\/span>/,
    );
  });

  it("lists the officers and the lists it was screened against", () => {
    expect(words).toContain("Officers 2");
    expect(words).toContain("Luis Ortega");
    expect(words).toContain("Screened against 6 lists: no hits.");
    expect(words).toContain("OFAC");
    expect(words).toContain("No hits");
  });

  it("is clean of anything a missing field would leave behind", () => {
    expectClean(markup);
  });
});

describe("a watchlist hit", () => {
  it("shows its count, and who it found", () => {
    const search: Search = {
      ...SAMPLE_SEARCH,
      verified: false,
      watchlist_hits: [
        {
          code: "OFAC",
          name: "Department of Treasury, Office of Foreign Assets Control",
          count: 1,
          details: [{ name: "ACME TRADING", program: "SDGT" }],
        },
      ],
      business: { ...SAMPLE_SEARCH.business!, watchlist_hits: [] },
    };
    const words = text(html(search));
    expect(words).toContain("Not verified");
    expect(words).toContain("Screened against 1 list: 1 with hits.");
    expect(words).toContain("1 hit");
    expect(words).toContain("ACME TRADING · SDGT");
  });
});

describe("the button that copies the search id", () => {
  it("keeps its notice beside it: a button's children are not read out", () => {
    const markup = html(SAMPLE_SEARCH);
    const button =
      markup.match(/<button[^>]*class="sr-copy"[^>]*>.*?<\/button>/s)?.[0] ??
      "";
    expect(button).toContain(SAMPLE_SEARCH.id);
    expect(button).not.toContain('role="status"');
    expect(markup).toContain(
      '</button><span class="visually-hidden" role="status"></span>',
    );
  });
});

describe("a search that found no business", () => {
  const failed: Search = {
    id: "9c1b0e22-3f58-4d0a-8d11-5a6e7f8091a2",
    state: "FAILED",
    name: "HARBOR CONCRETE PUMPING CO., INC.",
    address: "CA",
    error: "No match found.",
    // The API pads the watchlists even here; they mean nothing.
    watchlist_hits: SAMPLE_SEARCH.watchlist_hits!,
    scores: [],
    business: null,
  };
  const markup = html(failed, null);
  const words = text(markup);

  it("says so, in the API's words", () => {
    expect(words).toContain("No match");
    expect(words).toContain("No match found.");
    expect(words).not.toContain("finished in");
  });

  it("draws none of what there is no business for", () => {
    for (const section of [
      "KYB rating",
      "How it matched",
      "Business",
      "Secretary of State filings",
      "Officers",
      "Watchlists",
    ]) {
      expect(words).not.toContain(section);
    }
    expectClean(markup);
  });
});

describe("a search with little to say", () => {
  it("draws the sections it has and no others", () => {
    const sparse: Search = {
      id: "0a",
      state: "COMPLETED",
      business: { id: "1b", name: "SPARSE LLC" },
    };
    const markup = html(sparse, null);
    const words = text(markup);
    expect(words).toContain("Sparse LLC");
    for (const section of [
      "KYB rating",
      "Secretary of State filings",
      "Officers",
      "Watchlists",
      "Business",
    ]) {
      expect(words).not.toContain(section);
    }
    expectClean(markup);
  });

  it("draws a business that has a few facts as a short list", () => {
    const markup = html({
      id: "0a",
      state: "COMPLETED",
      verified: null,
      scores: null,
      business: {
        id: "1b",
        name: "Quiet Co",
        incorporation_state: "DE",
        website: "https://quiet.example",
        email: "",
        phone_numbers: [],
        registrations: [],
        business_officers: [],
      },
    });
    const words = text(markup);
    expect(words).toContain("Business");
    expect(words).toContain("Incorporated DE");
    expect(markup).toContain('href="https://quiet.example"');
    expect(words).not.toContain("Email");
    expect(words).not.toContain("Phone");
    expectClean(markup);
  });

  it("does not link a website that is not http", () => {
    const markup = html({
      id: "0a",
      state: "COMPLETED",
      business: { id: "1b", name: "Odd", website: "javascript:alert(1)" },
    });
    expect(markup).not.toContain("href=");
    expect(text(markup)).toContain("javascript:alert(1)");
  });

  it("shows a warning the API sent", () => {
    const markup = html({
      ...SAMPLE_SEARCH,
      warnings: ["IRS Validation is unavailable."],
    });
    expect(text(markup)).toContain("IRS Validation is unavailable.");
  });
});
