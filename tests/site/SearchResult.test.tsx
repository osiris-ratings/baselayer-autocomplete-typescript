import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SearchResult } from "../../site/demo/SearchResult";
import { SAMPLE_SEARCH } from "../../site/demo/sample-search";
import type { Matched } from "../../site/demo/search-view";
import type { Address, Search } from "../../site/demo/searches";

// The report a finished search is drawn as, from the made-up sample and from
// searches with less to say: nothing may read `undefined` or `null`.

const html = (search: Search, elapsedMs: number | null = 4_200) =>
  renderToStaticMarkup(<SearchResult search={search} elapsedMs={elapsedMs} />);

// The words, with the underline and the grey of a matched name read through:
// a tag becomes a space, and a mark can fall inside a word.
const MARK =
  /<span (?:class="sr-mark"(?: data-dba="true")?|data-dba="true")>([^<]*)<\/span>/g;

const text = (markup: string) =>
  markup
    .replace(MARK, "$1")
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

  it("pins the verdict to the title's row", () => {
    expect(markup).toMatch(
      /<div class="sr-head-title"><h3 class="sr-title"[^>]*>Harbor Concrete Pumping Co\., Inc\.<\/h3><span class="sr-verdict" data-kind="verified">/,
    );
    // The label above and the facts below are not part of that row.
    expect(markup).toMatch(
      /<p class="mono-label">Search result · finished in 4\.2 s<\/p><div class="sr-head-title">/,
    );
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
    expect(words).toContain("Address");
    expect(words).toContain("Exact match");
    expect(words).toContain("1200 Tallowmere Rd, Pittsburgh, PA 15212");
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

describe("the report for a pick a filter reached", () => {
  const QUENBY: Address = {
    street: "535 QUENBY ST FL 14",
    city: "SAN FRANCISCO",
    state: "CA",
    zip: "94105",
    rdi: "Commercial",
    deliverable: true,
  };
  const search: Search = {
    ...SAMPLE_SEARCH,
    address: "535 QUENBY ST FL 14, SAN FRANCISCO, CA 94105",
    search_address: QUENBY,
    officer_names: ["DANA WHITFIELD"],
    business_officer_match: "EXACT",
    business: {
      ...SAMPLE_SEARCH.business!,
      addresses: [
        ...SAMPLE_SEARCH.business!.addresses!,
        { ...QUENBY, sources: ["SOS"] },
      ],
      business_officers: [
        { name: "LUIS ORTEGA", titles: ["SECRETARY"], states: ["PA"] },
        { name: "DANA WHITFIELD", titles: ["PRESIDENT"], states: ["PA"] },
      ],
    },
  };
  const matched: Matched = {
    alias: "HARBOR PUMPING",
    officers: ["Dana Whitfield"],
    addresses: ["535 Quenby St Fl 14, San Francisco, CA 94105"],
    asked: ["OH", "AL"],
    states: ["OH"],
    typed: {
      name: "harbor pum",
      person: "dana",
      address: "535 quenby street",
    },
    through: null,
  };
  const markup = renderToStaticMarkup(
    <SearchResult search={search} elapsedMs={null} matched={matched} />,
  );
  const words = text(markup);

  it("sets the name, the officer, the address and the states against what was found", () => {
    expect(words).toContain(
      "Name Harbor Pumping Harbor Concrete Pumping Co., Inc. (DBA Harbor Pumping) Exact match",
    );
    expect(words).toContain(
      "Officer Dana Whitfield Dana Whitfield Exact match",
    );
    // The address on file that is the search's own, not the business's primary.
    expect(words).toContain(
      "Address 535 Quenby St Fl 14, San Francisco, CA 94105 535 Quenby St Fl 14, San Francisco, CA 94105 Exact match",
    );
    expect(words).toContain("States OH, AL OH Match");
  });

  it("underlines the whole name that was typed to, and greys the name the business goes by", () => {
    // The name it was found by, set apart from the legal name, with the
    // underline kept on the grey.
    expect(markup).toContain(
      '<td data-label="Matched business">Harbor Concrete Pumping Co., Inc.<span data-dba="true"> (DBA </span><span class="sr-mark" data-dba="true">Harbor Pumping</span><span data-dba="true">)</span></td>',
    );
    // The whole officer, the whole address (the filter's `street` is not the
    // `St` on file, but the rest is the same), and the state codes typed.
    expect(markup).toContain(
      '<td data-label="Matched business"><span class="sr-mark">Dana Whitfield</span></td>',
    );
    expect(markup).toContain(
      '<td data-label="Matched business"><span class="sr-mark">535 Quenby St Fl 14, San Francisco, CA 94105</span></td>',
    );
    expect(markup).toContain(
      '<td data-label="Matched business"><span class="sr-mark">OH</span></td>',
    );
  });

  it("underlines it in the lists below too, on the entries that matched and no others", () => {
    // After the bullet, which is the same on both.
    const bullet =
      '<span class="sr-address-icon" data-kind="[a-z-]+"><svg.*?</svg></span>';
    expect(markup).toMatch(
      new RegExp(
        `<span class="sr-address">${bullet}<span class="sr-mark">535 Quenby St Fl 14, San Francisco, CA 94105</span>`,
      ),
    );
    expect(markup).toContain(
      '<strong><span class="sr-mark">Dana Whitfield</span></strong>',
    );
    // The primary address and the other officer matched nothing.
    expect(markup).toMatch(
      new RegExp(`<span class="sr-address">${bullet}1200 Tallowmere Rd`),
    );
    expect(markup).toContain("<strong>Luis Ortega</strong>");
  });

  it("underlines the name the business goes by that the pick was found by, among those it goes by", () => {
    expect(markup).toContain(
      '<dt>Also known as</dt><dd><span class="sr-mark">Harbor Pumping</span>, HCP Concrete</dd>',
    );
    // Whichever it is, it leads: it is why the business is here.
    const other = renderToStaticMarkup(
      <SearchResult
        search={search}
        elapsedMs={null}
        matched={{ ...matched, alias: "HCP CONCRETE" }}
      />,
    );
    expect(other).toContain(
      '<dt>Also known as</dt><dd><span class="sr-mark">HCP Concrete</span>, Harbor Pumping</dd>',
    );
    // A pick the name itself found has no DBA to underline.
    expect(
      renderToStaticMarkup(
        <SearchResult
          search={search}
          elapsedMs={null}
          matched={{ ...matched, alias: null }}
        />,
      ),
    ).toContain("<dt>Also known as</dt><dd>Harbor Pumping, HCP Concrete</dd>");
  });

  it("gives each address a bullet for what stands there: a building, a house, a mail drop or a pin", () => {
    const at = (street: string, more: object) => ({
      street,
      city: "PITTSBURGH",
      state: "PA",
      zip: "15212",
      ...more,
    });
    const kinds = renderToStaticMarkup(
      <SearchResult
        search={{
          ...SAMPLE_SEARCH,
          business: {
            ...SAMPLE_SEARCH.business!,
            primary_address: at("1 OFFICE PARK", { rdi: "Commercial" }),
            addresses: [
              at("1 OFFICE PARK", { rdi: "Commercial" }),
              at("2 ASHCOMBE ST", { rdi: "Residential" }),
              at("PO BOX 3", { rdi: "Commercial", cmra: true }),
              at("4 NOWHERE LN", {}),
            ],
          },
        }}
        elapsedMs={null}
      />,
    );

    expect(
      [...kinds.matchAll(/class="sr-address-icon" data-kind="([a-z-]+)"/g)].map(
        match => match[1],
      ),
    ).toEqual(["commercial", "residential", "mail-drop", "unknown"]);
    // Only for the eye: the pills say it in words.
    expect(markup).toContain('<svg aria-hidden="true"');
  });

  it("lists every address on file, the one the search carries first with the pill", () => {
    expect(words).toContain(
      "Addresses on file 3 535 Quenby St Fl 14, San Francisco, CA 94105 Deliverable Commercial Matched 1200 Tallowmere Rd, Pittsburgh, PA 15212 Deliverable Commercial Primary PO Box 442",
    );
    expect(markup).toContain(
      '<li data-matched="true"><span class="sr-address">',
    );
  });

  it("marks the primary address with a pill, like the others, not a bare word", () => {
    expect(markup).toContain(
      '<span class="sr-chip" data-tone="info">Primary</span>',
    );
    expect(markup).not.toContain('<span class="sr-muted">Primary</span>');
  });

  it("says nothing of more addresses when they all fit", () => {
    expect(words).not.toContain("more address");
  });

  it("stops at ten addresses and counts the rest, the matched one still at the top", () => {
    const filler = Array.from({ length: 43 }, (_, index) => ({
      street: `${100 + index} FILLER AVE`,
      city: "PITTSBURGH",
      state: "PA",
      zip: "15212",
      sources: ["Online"],
    }));
    const long = renderToStaticMarkup(
      <SearchResult
        search={{
          ...search,
          business: {
            ...search.business!,
            addresses: [...filler, ...search.business!.addresses!],
          },
        }}
        elapsedMs={null}
        matched={matched}
      />,
    );
    const longWords = text(long);

    expect(longWords).toContain("Addresses on file 46");
    expect(longWords).toContain(
      "Addresses on file 46 535 Quenby St Fl 14, San Francisco, CA 94105 Deliverable Commercial Matched 1200 Tallowmere Rd",
    );
    expect(long.match(/<li[^>]*><span class="sr-address">/g)).toHaveLength(10);
    expect(longWords).toContain("36 more addresses");
  });

  it("lists the states and the officers the same way, the matched first", () => {
    // The squares only: what a state matched is said on its filing.
    expect(words).toContain("States 3 PA OH MD");
    expect(words).toContain(
      "Officers 2 DW Dana Whitfield President Matched PA LO Luis Ortega",
    );
  });

  it("draws the domicile green and first among the squares, underlines the state the filter named, and says what it matched on its filing", () => {
    const squares = markup.match(/<ul class="sr-states">.*?<\/ul>/)?.[0] ?? "";

    expect(squares).toBe(
      '<ul class="sr-states">' +
        '<li><span class="sr-state" data-kind="domestic" aria-hidden="true">PA</span></li>' +
        '<li><span class="sr-state" data-matched="true" aria-hidden="true">OH</span></li>' +
        '<li><span class="sr-state" aria-hidden="true">MD</span></li>' +
        "</ul>",
    );
    // The pill is for the filing, which follows the domestic one.
    expect(squares).not.toContain("Matched");
    expect(words).toContain(
      "Secretary of State filings 3 PA Domestic filing in PA",
    );
    expect(words.indexOf("Domestic filing in PA")).toBeLessThan(
      words.indexOf("Foreign filing in OH"),
    );
    expect(words.indexOf("Foreign filing in OH")).toBeLessThan(
      words.indexOf("Foreign filing in MD"),
    );
    expect(words).toContain("Foreign filing in OH Matched Active");
    expect(
      markup.match(/<li class="sr-filing"[^>]*data-matched="true"/g),
    ).toHaveLength(1);
    // The filing's own square is underlined too, as the one among the states
    // is: the OH ones, and no others.
    expect(
      markup.match(/<span class="sr-state"[^>]*data-matched="true"/g),
    ).toHaveLength(2);
    expect(markup).toContain(
      '<span class="sr-state" data-kind="foreign" data-matched="true" aria-hidden="true">OH</span>',
    );
    expect(markup).toContain(
      '<span class="sr-state" data-kind="foreign" aria-hidden="true">MD</span>',
    );
  });

  it("names the same home state in the squares and in the filings when the API classifies no filing as domestic", () => {
    const unclassified = (state: string) => ({
      ...SAMPLE_SEARCH.business!.registrations![0]!,
      id: state,
      state,
      registration_type: null,
    });
    const drawn = renderToStaticMarkup(
      <SearchResult
        search={{
          ...SAMPLE_SEARCH,
          business: {
            ...SAMPLE_SEARCH.business!,
            incorporation_state: "DE",
            registrations: [unclassified("NY"), unclassified("DE")],
          },
        }}
        elapsedMs={null}
      />,
    );
    const squares = drawn.match(/<ul class="sr-states">.*?<\/ul>/)?.[0] ?? "";
    const filings = drawn.match(/<ul class="sr-filings">.*<\/ul>/)?.[0] ?? "";
    const home =
      '<span class="sr-state" data-kind="domestic" aria-hidden="true">DE</span>';

    // The incorporation state leads the squares, green, and so does its filing
    // the filings, with the same green, though no filing says it is domestic.
    expect(squares.startsWith(`<ul class="sr-states"><li>${home}`)).toBe(true);
    expect(filings).toContain(home);
    expect(filings.indexOf(">DE</span>")).toBeLessThan(
      filings.indexOf(">NY</span>"),
    );
    expect(filings).not.toContain('data-kind="domestic" aria-hidden="true">NY');
  });

  it("draws no pill and no order of its own for a pick no filter reached", () => {
    const plain = html(SAMPLE_SEARCH);
    const plainWords = text(plain);

    expect(plain).not.toContain(">Matched</span>");
    // The domicile is green whatever was filtered, and nothing is underlined.
    expect(plain).toContain(
      '<ul class="sr-states"><li><span class="sr-state" data-kind="domestic" aria-hidden="true">PA</span></li>',
    );
    expect(plain).not.toContain('data-matched="true"');
    expect(plainWords).not.toContain("Officer Dana");
    expect(plainWords).not.toContain("States OH");
    expect(plainWords.indexOf("1200 Tallowmere Rd")).toBeLessThan(
      plainWords.indexOf("PO Box 442"),
    );
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
