import { describe, expect, it } from "vitest";

import { SAMPLE_SEARCH } from "../../site/demo/sample-search";
import {
  ADDRESSES_SHOWN,
  NOTHING_MATCHED,
  addressesOnFile,
  announcement,
  consoleHref,
  deliveryChips,
  elapsedLabel,
  entityType,
  formatAddress,
  formatDay,
  glance,
  hitLines,
  leadingOnFile,
  matchPill,
  matchRows,
  matchedOf,
  monthsLabel,
  officersOnFile,
  orderedRegistrations,
  ratingOf,
  readable,
  readableAddress,
  registrationKind,
  registrationsOnFile,
  registrationStatus,
  sameOfficer,
  statesOnFile,
  verdictOf,
  watchlistRows,
} from "../../site/demo/search-view";
import type { Address, Registration, Search } from "../../site/demo/searches";

// What the search report says: the words, the verdict, the pills and the order
// things come in.

const search = (more: Partial<Search>): Search => ({
  ...SAMPLE_SEARCH,
  ...more,
});

describe("readable", () => {
  it("turns a registry's capitals into a name", () => {
    expect(readable("HARBOR CONCRETE PUMPING CO., INC.")).toBe(
      "Harbor Concrete Pumping Co., Inc.",
    );
    expect(readable("ACME HOLDINGS LLC")).toBe("Acme Holdings LLC");
    expect(readable("3RD STREET SUPPLY, PLLC")).toBe("3rd Street Supply, PLLC");
  });

  it("keeps initials as they are, and words as words", () => {
    expect(readable("HCP CONCRETE")).toBe("HCP Concrete");
    expect(readable("TNT HAULING")).toBe("TNT Hauling");
    expect(readable("NG FAMILY TRUST")).toBe("Ng Family Trust");
  });

  it("leaves a name somebody cased alone", () => {
    expect(readable("Harbor Concrete Pumping Co., Inc.")).toBe(
      "Harbor Concrete Pumping Co., Inc.",
    );
    expect(readable("iPipe Systems")).toBe("iPipe Systems");
  });

  it("starts a word at an accented letter, and after one", () => {
    expect(readable("MONTRÉAL PIZZA, LLC")).toBe("Montréal Pizza, LLC");
    expect(readable("ÉLITE BUILDERS INC")).toBe("Élite Builders Inc");
    expect(readable("JOSÉ'S TACOS LLC")).toBe("José's Tacos LLC");
  });

  it("keeps a lone letter after digits, and the officer titles that are initials", () => {
    expect(readable("3M COMPANY")).toBe("3M Company");
    expect(readable("3RD STREET SUPPLY")).toBe("3rd Street Supply");
    for (const title of ["CEO", "CFO", "COO", "CTO", "VP", "SVP", "EVP"]) {
      expect(readable(title)).toBe(title);
    }
    expect(readable("PRESIDENT")).toBe("President");
  });

  it("copes with a name the API leaves out", () => {
    expect(readable(null)).toBe("");
    expect(readable(undefined)).toBe("");
    expect(readableAddress(null)).toBe("");
    expect(readableAddress(undefined)).toBe("");
  });
});

describe("readableAddress", () => {
  it("keeps the state a state", () => {
    expect(readableAddress("1200 RIVER RD, PITTSBURGH, PA 15212")).toBe(
      "1200 River Rd, Pittsburgh, PA 15212",
    );
    expect(readableAddress("1 MAIN ST, ST PAUL, MN 55101-1234")).toBe(
      "1 Main St, St Paul, MN 55101-1234",
    );
  });

  it("keeps a post office box and the points of the compass", () => {
    expect(readableAddress("PO BOX 442, BRIDGEVILLE, PA 15017")).toBe(
      "PO Box 442, Bridgeville, PA 15017",
    );
    expect(readableAddress("88 CANAL BLVD NE, AKRON, OH 44308")).toBe(
      "88 Canal Blvd NE, Akron, OH 44308",
    );
  });

  it("keeps a bare state code, which is all a pick may carry", () => {
    expect(readableAddress("CA")).toBe("CA");
    expect(readableAddress("ca")).toBe("CA");
  });

  it("keeps a unit's letter a capital", () => {
    expect(readableAddress("123 MAIN ST APT 5B, PITTSBURGH, PA 15212")).toBe(
      "123 Main St Apt 5B, Pittsburgh, PA 15212",
    );
  });
});

describe("formatAddress", () => {
  it("reads street, city, state and zip", () => {
    expect(formatAddress(SAMPLE_SEARCH.search_address)).toBe(
      "1200 River Rd, Pittsburgh, PA 15212",
    );
    expect(formatAddress(null)).toBeNull();
    expect(formatAddress(undefined)).toBeNull();
  });

  it("leaves out a part the API did not send, and says nothing of no address", () => {
    const partial = {
      street: "1 MAIN ST",
      city: null,
      state: "PA",
      zip: null,
    } as unknown as Address;
    expect(formatAddress(partial)).toBe("1 Main St, PA");
    const nothing = {
      street: null,
      city: null,
      state: null,
      zip: null,
    } as unknown as Address;
    expect(formatAddress(nothing)).toBeNull();
  });
});

describe("dates and durations", () => {
  it("writes a day the way the console does", () => {
    expect(formatDay("2011-03-14")).toBe("03/14/2011");
    expect(formatDay("2011-03-14T09:00:00Z")).toBe("03/14/2011");
    expect(formatDay("sometime")).toBe("sometime");
    expect(formatDay(null)).toBeNull();
    expect(formatDay("")).toBeNull();
  });

  it.each([
    [186, "15 years and 6 months"],
    [24, "2 years"],
    [13, "1 year and 1 month"],
    [12, "1 year"],
    [7, "7 months"],
    [1, "1 month"],
    [0, "0 months"],
  ])("%d months read %s", (months, text) => {
    expect(monthsLabel(months)).toBe(text);
  });

  it("says how long the page waited", () => {
    expect(elapsedLabel(812)).toBe("812 ms");
    expect(elapsedLabel(4_200)).toBe("4.2 s");
  });

  it("changes unit where the rounded number does, not past it", () => {
    expect(elapsedLabel(999.4)).toBe("999 ms");
    // 999.6 ms is 1000 ms rounded: a second, not "1000 ms".
    expect(elapsedLabel(999.6)).toBe("1.0 s");
    expect(elapsedLabel(1_000)).toBe("1.0 s");
    expect(elapsedLabel(0)).toBe("0 ms");
  });
});

describe("consoleHref", () => {
  it("follows https and nothing else", () => {
    expect(consoleHref(SAMPLE_SEARCH)).toBe(SAMPLE_SEARCH.console_url);
    expect(
      consoleHref(search({ console_url: "http://console.example/x" })),
    ).toBeNull();
    expect(
      consoleHref(search({ console_url: "javascript:alert(1)" })),
    ).toBeNull();
    expect(consoleHref(search({ console_url: "not a url" }))).toBeNull();
    const without: Search = { ...SAMPLE_SEARCH };
    delete without.console_url;
    expect(consoleHref(without)).toBeNull();
  });
});

describe("verdictOf", () => {
  it("leads with verified or not verified", () => {
    expect(verdictOf(SAMPLE_SEARCH)).toEqual({
      kind: "verified",
      label: "Verified",
    });
    expect(verdictOf(search({ verified: false }))).toEqual({
      kind: "not-verified",
      label: "Not verified",
    });
    expect(verdictOf(search({ verified: null }))).toBeNull();
  });

  it("calls a hit on the fraud consortium that, over the rest", () => {
    const hit = { code: "BFC", name: "Baselayer Fraud Consortium", count: 1 };
    expect(verdictOf(search({ watchlist_hits: [hit] }))?.kind).toBe("fraud");
    expect(
      verdictOf(
        search({
          business: { ...SAMPLE_SEARCH.business!, watchlist_hits: [hit] },
        }),
      )?.kind,
    ).toBe("fraud");
    // A clear row for it is not a hit.
    expect(
      verdictOf(search({ watchlist_hits: [{ ...hit, count: 0 }] }))?.kind,
    ).toBe("verified");
  });

  it("tells no match from any other failure", () => {
    expect(
      verdictOf(search({ state: "FAILED", error: "No match found." })),
    ).toEqual({ kind: "no-match", label: "No match" });
    expect(
      verdictOf(
        search({ state: "FAILED", error: "An internal error has occurred." }),
      ),
    ).toEqual({ kind: "failed", label: "Search failed" });
    expect(verdictOf(search({ state: "CANCELLED" }))?.kind).toBe("cancelled");
  });
});

describe("ratingOf", () => {
  it("reads a grade in the console's words", () => {
    expect(ratingOf(SAMPLE_SEARCH, "kyb")).toEqual({
      type: "kyb",
      title: "KYB rating",
      grade: "A",
      score: 95,
      label: "Low risk",
    });
    expect(
      ratingOf(
        search({ scores: [{ type: "risk", score: 41.6, rating: "C" }] }),
        "risk",
      ),
    ).toMatchObject({ grade: "C", score: 42, label: "High risk" });
    expect(
      ratingOf(
        search({ scores: [{ type: "kyb", score: 0, rating: "F" }] }),
        "kyb",
      )?.label,
    ).toBe("Fail");
  });

  it("holds the score of a letter it does not know, ungraded", () => {
    expect(
      ratingOf(
        search({ scores: [{ type: "kyb", score: 70, rating: "Q" }] }),
        "kyb",
      ),
    ).toMatchObject({ grade: null, score: 70, label: null });
  });

  it("has none when the search has none", () => {
    expect(ratingOf(search({ scores: [] }), "kyb")).toBeNull();
    expect(ratingOf(search({ scores: null }), "risk")).toBeNull();
    expect(ratingOf(SAMPLE_SEARCH, "risk")?.score).toBe(82);
  });
});

describe("matchPill", () => {
  it.each([
    ["EXACT", "Exact match", "good"],
    ["SIMILAR", "Similar match", "warn"],
    ["CITY", "City match", "warn"],
    ["STATE", "State match", "warn"],
    ["NO_MATCH", "No match", "bad"],
  ] as const)("draws %s as %s", (match, label, tone) => {
    expect(matchPill(match)).toEqual({ label, tone });
  });

  it("draws nothing for no grade, or one it does not know", () => {
    expect(matchPill(null)).toBeNull();
    expect(matchPill(undefined)).toBeNull();
    expect(matchPill("CLOSE" as never)).toBeNull();
  });
});

describe("matchRows", () => {
  it("sets the search against the business it found", () => {
    expect(matchRows(SAMPLE_SEARCH)).toEqual([
      {
        key: "name",
        label: "Name",
        yours: "Harbor Concrete Pumping Co., Inc.",
        found: "Harbor Concrete Pumping Co., Inc.",
        pill: { label: "Exact match", tone: "good" },
      },
      {
        key: "address",
        label: "Address",
        yours: "1200 River Rd, Pittsburgh, PA 15212",
        found: "1200 River Rd, Pittsburgh, PA 15212",
        pill: { label: "Exact match", tone: "good" },
      },
    ]);
  });

  it("keeps a state code a state code, for a business with no address on file", () => {
    const rows = matchRows(
      search({
        address: "CA",
        business_address_match: "STATE",
        business: {
          ...SAMPLE_SEARCH.business!,
          primary_address: null,
          addresses: [],
        },
      }),
    );
    expect(rows[1]).toMatchObject({
      key: "address",
      yours: "CA",
      found: null,
      pill: { label: "State match" },
    });
  });

  it("has no row for what neither side has", () => {
    const bare: Search = { id: "a", state: "COMPLETED" };
    expect(matchRows(bare)).toEqual([]);
  });

  it("takes a name or an address the API sent as null for one it left out", () => {
    const rows = matchRows(
      search({
        name: null as unknown as string,
        address: null as unknown as string,
        business: {
          ...SAMPLE_SEARCH.business!,
          name: null as unknown as string,
          primary_address: null,
          addresses: [],
        },
      }),
    );
    expect(rows).toEqual([]);
  });
});

describe("the business", () => {
  it("names the kind of entity in full", () => {
    expect(entityType("C_CORPORATION")).toBe("C corporation");
    expect(entityType("LLC")).toBe("Limited liability company (LLC)");
    expect(entityType("OTHER")).toBeNull();
    expect(entityType(null)).toBeNull();
    expect(entityType(undefined)).toBeNull();
  });

  it("says what is known about delivering to an address", () => {
    expect(deliveryChips(SAMPLE_SEARCH.search_address)).toEqual([
      { label: "Deliverable", tone: "good" },
      { label: "Commercial", tone: "neutral" },
    ]);
    expect(
      deliveryChips({
        street: "PO BOX 442",
        city: "BRIDGEVILLE",
        state: "PA",
        zip: "15017",
        deliverable: false,
        rdi: "Residential",
        cmra: true,
      }),
    ).toEqual([
      { label: "Not deliverable", tone: "warn" },
      { label: "Residential", tone: "neutral" },
      { label: "Mail drop (CMRA)", tone: "warn" },
    ]);
    expect(deliveryChips(null)).toEqual([]);
  });
});

describe("filings", () => {
  const filing = (more: Partial<Registration>): Registration => ({
    id: "x",
    name: "N",
    file_number: "1",
    state: "PA",
    status: "active",
    registration_type: "foreign",
    issue_date: "2015-01-01",
    ...more,
  });

  it("puts the home state first, then active, inactive and unknown", () => {
    const ordered = orderedRegistrations([
      filing({ id: "foreign-unknown", status: "unknown" }),
      filing({ id: "foreign-inactive", status: "inactive" }),
      filing({ id: "foreign-active", status: "active" }),
      filing({
        id: "domestic-inactive",
        status: "inactive",
        registration_type: "domestic",
      }),
    ]);
    expect(ordered.map(r => r.id)).toEqual([
      "domestic-inactive",
      "foreign-active",
      "foreign-inactive",
      "foreign-unknown",
    ]);
  });

  it("puts the oldest filing first among equals, and copes with none", () => {
    const ordered = orderedRegistrations([
      filing({ id: "new", issue_date: "2020-01-01" }),
      filing({ id: "old", issue_date: "2010-01-01" }),
      filing({ id: "undated", issue_date: null }),
    ]);
    expect(ordered.map(r => r.id)).toEqual(["undated", "old", "new"]);
    expect(orderedRegistrations(undefined)).toEqual([]);
  });

  it("draws a status and a kind", () => {
    expect(registrationStatus(filing({ status: "active" }))).toEqual({
      label: "Active",
      tone: "good",
    });
    expect(registrationStatus(filing({ status: "inactive" }))).toEqual({
      label: "Inactive",
      tone: "bad",
    });
    expect(registrationStatus(filing({ status: "unknown" })).tone).toBe(
      "neutral",
    );
    expect(registrationKind(filing({ registration_type: "domestic" }))).toBe(
      "Domestic",
    );
    expect(registrationKind(filing({ registration_type: "foreign" }))).toBe(
      "Foreign",
    );
    expect(registrationKind(filing({ registration_type: null }))).toBeNull();
  });
});

describe("watchlists", () => {
  const hit = (
    code: string,
    count: number,
    details: Record<string, unknown>[] = [],
  ) => ({
    code,
    name: `${code} list`,
    count,
    details,
  });

  it("lists hits first, then the clear lists in order", () => {
    const rows = watchlistRows(
      search({
        watchlist_hits: [hit("OIG", 0), hit("FBI", 2), hit("CSL", 0)],
        business: { ...SAMPLE_SEARCH.business!, watchlist_hits: [] },
      }),
    );
    expect(rows.map(r => [r.code, r.count])).toEqual([
      ["FBI", 2],
      ["CSL", 0],
      ["OIG", 0],
    ]);
  });

  it("lets the louder of the search's and the business's say win", () => {
    const rows = watchlistRows(
      search({
        watchlist_hits: [hit("OFAC", 0)],
        business: {
          ...SAMPLE_SEARCH.business!,
          watchlist_hits: [hit("OFAC", 1, [{ name: "ACME TRADING" }])],
        },
      }),
    );
    expect(rows).toEqual([
      {
        code: "OFAC",
        name: "OFAC list",
        count: 1,
        details: [{ name: "ACME TRADING" }],
      },
    ]);
  });

  it("has no rows for a search that was not screened", () => {
    expect(
      watchlistRows(
        search({
          watchlist_hits: [],
          business: { ...SAMPLE_SEARCH.business!, watchlist_hits: [] },
        }),
      ),
    ).toEqual([]);
  });

  it("says who a list found, as far as its fields go", () => {
    const [row] = watchlistRows(
      search({
        watchlist_hits: [
          hit("OFAC", 7, [
            { name: "ACME TRADING", program: "SDGT" },
            { entity_name: "BETA LTD", programs: ["IRAN", "SYRIA"] },
            { title: "GAMMA" },
            { unrelated: 1 },
          ]),
        ],
        business: { ...SAMPLE_SEARCH.business!, watchlist_hits: [] },
      }),
    );
    expect(hitLines(row!, 3)).toEqual([
      "ACME TRADING · SDGT",
      "BETA LTD · IRAN, SYRIA",
      "GAMMA",
      "and 4 more",
    ]);
  });
});

describe("glance", () => {
  it("says the report in a line", () => {
    expect(glance(SAMPLE_SEARCH)).toEqual([
      "Incorporated in PA",
      "15 years and 6 months in business",
      "active in 2 states",
      "2 officers",
      "no watchlist hits",
    ]);
  });

  it("counts the hits a list found", () => {
    const hit = {
      code: "OFAC",
      name: "OFAC list",
      count: 1,
      details: [{ name: "ACME" }],
    };
    expect(
      glance(
        search({
          watchlist_hits: [hit],
          business: { ...SAMPLE_SEARCH.business!, watchlist_hits: [] },
        }),
      ).at(-1),
    ).toBe("1 watchlist hit");
  });

  it("leaves out what the search has nothing for", () => {
    expect(
      glance(
        search({
          watchlist_hits: [],
          business: {
            id: "b",
            name: "N",
            incorporation_state: "OH",
            registrations: [],
            business_officers: [{ name: "ONE" }],
          },
        }),
      ),
    ).toEqual(["Incorporated in OH", "1 officer"]);
  });

  it("says nothing of a search that did not finish", () => {
    expect(glance(search({ state: "FAILED", business: null }))).toEqual([]);
    expect(glance(search({ state: "PENDING" }))).toEqual([]);
  });
});

describe("announcement", () => {
  it("tells a screen reader the verdict and the ratings", () => {
    expect(announcement(SAMPLE_SEARCH, 4_200)).toBe(
      "Search finished in 4.2 s: Verified. KYB rating A, low risk. Risk rating A, low risk.",
    );
  });

  it("copes with a search that has neither", () => {
    expect(
      announcement(
        search({ verified: null, scores: [], state: "COMPLETED" }),
        null,
      ),
    ).toBe("Search finished.");
  });
});

// A pick made by an officer, an address and a state filter: the search carries
// the address and the officer its token named, and the business has more of each.
const MISSION: Address = {
  street: "535 MISSION ST FL 14",
  city: "SAN FRANCISCO",
  state: "CA",
  zip: "94105",
};

const pickedSearch = search({
  address: "535 MISSION ST FL 14, SAN FRANCISCO, CA 94105",
  search_address: MISSION,
  officer_names: ["THOMAS HARLOW"],
  business_officer_match: "EXACT",
  business: {
    ...SAMPLE_SEARCH.business!,
    addresses: [
      ...SAMPLE_SEARCH.business!.addresses!,
      { ...MISSION, sources: ["SOS"] },
    ],
    business_officers: [
      { name: "LUIS ORTEGA", titles: ["SECRETARY"] },
      { name: "THOMAS A HARLOW", titles: ["PRESIDENT"] },
    ],
  },
});

const pickMatched = {
  alias: "HARBOR PUMPING",
  officers: ["Thomas Harlow"],
  addresses: ["535 Mission St Fl 14, San Francisco, CA 94105"],
  asked: ["NY", "OH", "AL"],
  states: ["OH"],
};

describe("matchedOf", () => {
  it("reads what a pick matched from the SDK's answer and the states typed", () => {
    expect(
      matchedOf(
        [
          { kind: "alias", name: "BASELAYER" },
          { kind: "officer", names: ["Thomas Harlow"], of: 1 },
          { kind: "agent", names: ["Meridian Registered Agents, LLC"], of: 1 },
          {
            kind: "address",
            label: "535 Mission St Fl 14, San Francisco, CA 94105",
            role: "officer",
          },
          { kind: "state", states: ["DE", "NY"] },
        ],
        ["ny", " de", "AL", "NY", ""],
      ),
    ).toEqual({
      alias: "BASELAYER",
      officers: ["Thomas Harlow"],
      addresses: ["535 Mission St Fl 14, San Francisco, CA 94105"],
      asked: ["NY", "DE", "AL"],
      states: ["DE", "NY"],
    });
  });

  it("has matched nothing for a pick the name alone reached", () => {
    expect(matchedOf([])).toEqual(NOTHING_MATCHED);
  });
});

describe("sameOfficer", () => {
  it("meets a name with a middle name, an initial or the surname first", () => {
    expect(sameOfficer("THOMAS HARLOW", "Thomas A Harlow")).toBe(true);
    expect(sameOfficer("Thomas Harlow", "HARLOW, THOMAS")).toBe(true);
  });

  it("keeps two people apart, and a name that is one word to itself", () => {
    expect(sameOfficer("Tom Harlow", "Thomas Harlow")).toBe(false);
    expect(sameOfficer("Thomas Harlow", "Thomas Ortega")).toBe(false);
    expect(sameOfficer("Cher", "Cher")).toBe(false);
  });
});

describe("matchRows, for a pick", () => {
  it("sets the name, the officer, the address and the states against what was found", () => {
    expect(matchRows(pickedSearch, pickMatched)).toEqual([
      {
        key: "name",
        label: "Name",
        yours: "Harbor Pumping",
        found: "Harbor Concrete Pumping Co., Inc. (DBA Harbor Pumping)",
        pill: { label: "Exact match", tone: "good" },
      },
      {
        key: "officer",
        label: "Officer",
        yours: "Thomas Harlow",
        found: "Thomas A Harlow",
        pill: { label: "Exact match", tone: "good" },
      },
      {
        key: "address",
        label: "Address",
        yours: "535 Mission St Fl 14, San Francisco, CA 94105",
        found: formatAddress(MISSION),
        pill: { label: "Exact match", tone: "good" },
      },
      {
        key: "states",
        label: "States",
        yours: "NY, OH, AL",
        found: "OH",
        pill: { label: "Match", tone: "good" },
      },
    ]);
  });

  it("shows the address that matched, not the business's primary one", () => {
    const [, , address] = matchRows(pickedSearch, pickMatched);

    expect(address!.found).not.toBe(
      formatAddress(SAMPLE_SEARCH.business!.primary_address),
    );
  });

  it("names the officer the pick matched when the search carries none, with the pick's own pill", () => {
    const rows = matchRows(
      { ...pickedSearch, officer_names: null, business_officer_match: null },
      pickMatched,
    );

    expect(rows.find(row => row.key === "officer")).toMatchObject({
      yours: "Thomas Harlow",
      found: "Thomas A Harlow",
      pill: { label: "Match", tone: "good" },
    });
  });

  it("has no officer or states row for a pick no filter reached", () => {
    expect(
      matchRows(SAMPLE_SEARCH, NOTHING_MATCHED).map(row => row.key),
    ).toEqual(["name", "address"]);
  });
});

describe("what the business has on file, the matched first", () => {
  it("lists every address, the one the search carries first and the primary after it", () => {
    const lines = addressesOnFile(
      pickedSearch.business,
      pickedSearch,
      pickMatched,
    ).map(({ item, matched }) => [formatAddress(item), matched]);

    expect(lines).toEqual([
      [formatAddress(MISSION), true],
      ["1200 River Rd, Pittsburgh, PA 15212", false],
      ["PO Box 442, Bridgeville, PA 15017", false],
    ]);
  });

  it("leads with the address the search carries, whatever else the filter reached", () => {
    const near = { ...MISSION, street: "535 MISSION ST" };
    const entries = addressesOnFile(
      {
        ...pickedSearch.business!,
        addresses: [
          ...SAMPLE_SEARCH.business!.addresses!,
          { ...near, sources: ["SOS"] },
          { ...MISSION, sources: ["SOS"] },
        ],
      },
      pickedSearch,
      {
        ...pickMatched,
        addresses: [formatAddress(near)!, formatAddress(MISSION)!],
      },
    );

    expect(
      entries.map(entry => [formatAddress(entry.item), entry.matched]),
    ).toEqual([
      [formatAddress(MISSION), true],
      [formatAddress(near), true],
      ["1200 River Rd, Pittsburgh, PA 15212", false],
      ["PO Box 442, Bridgeville, PA 15017", false],
    ]);
    // The row says so too: the address on file that is the search's own.
    expect(
      matchRows(
        {
          ...pickedSearch,
          business: {
            ...pickedSearch.business!,
            addresses: [{ ...near, sources: ["SOS"] }, { ...MISSION }],
          },
        },
        { ...pickMatched, addresses: [formatAddress(near)!] },
      ).find(row => row.key === "address")?.found,
    ).toBe(formatAddress(MISSION));
  });

  it("names the states that matched in the order they were typed", () => {
    const rows = matchRows(pickedSearch, {
      ...pickMatched,
      asked: ["PA", "AL", "OH"],
      states: ["OH", "PA"],
    });

    expect(rows.find(row => row.key === "states")).toMatchObject({
      yours: "PA, AL, OH",
      found: "PA, OH",
    });
  });

  it("flags an address the pick's own filter reached as well", () => {
    const entries = addressesOnFile(pickedSearch.business, pickedSearch, {
      ...pickMatched,
      addresses: ["PO Box 442, Bridgeville, PA 15017"],
    });

    expect(entries.map(entry => entry.matched)).toEqual([true, true, false]);
  });

  it("adds the primary address when the list leaves it out, and keeps one named twice", () => {
    const twice = { ...MISSION, sources: ["Online"] };
    const entries = addressesOnFile(
      {
        ...pickedSearch.business!,
        primary_address: { ...MISSION, street: "9 OTHER RD" },
        addresses: [{ ...MISSION }, twice],
      },
      pickedSearch,
      NOTHING_MATCHED,
    );

    // No address filter reached any: the primary leads, then the rest as sent.
    expect(entries.map(entry => formatAddress(entry.item))).toEqual([
      formatAddress({ ...MISSION, street: "9 OTHER RD" }),
      formatAddress(MISSION),
      formatAddress(MISSION),
    ]);
    expect(entries.some(entry => entry.matched)).toBe(false);
  });

  it("lists every officer, the ones the search carries or the pick matched first", () => {
    expect(
      officersOnFile(pickedSearch.business, pickedSearch, pickMatched).map(
        ({ item, matched }) => [item.name, matched],
      ),
    ).toEqual([
      ["THOMAS A HARLOW", true],
      ["LUIS ORTEGA", false],
    ]);
  });

  it("lists every state the business is in, the ones the filter named first", () => {
    expect(
      statesOnFile(pickedSearch.business, pickMatched).map(
        ({ item, matched }) => [item, matched],
      ),
    ).toEqual([
      ["OH", true],
      ["PA", false],
      ["MD", false],
    ]);
  });

  it("stops a long list at ten and counts the rest, the matched staying at the top", () => {
    const many = Array.from({ length: 44 }, (_, index) => ({
      item: index,
      matched: index < 2,
    }));

    const { shown, hidden } = leadingOnFile(many);

    expect(ADDRESSES_SHOWN).toBe(10);
    expect(shown.map(entry => entry.item)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
    expect(shown.slice(0, 2).every(entry => entry.matched)).toBe(true);
    expect(hidden).toBe(34);
  });

  it("never leaves a matched entry out, even past ten", () => {
    const all = Array.from({ length: 14 }, (_, index) => ({
      item: index,
      matched: index < 12,
    }));

    expect(leadingOnFile(all)).toEqual({ shown: all.slice(0, 12), hidden: 2 });
  });

  it("leaves nothing out of a short list", () => {
    const few = [{ item: "a", matched: false }];

    expect(leadingOnFile(few)).toEqual({ shown: few, hidden: 0 });
    expect(leadingOnFile([])).toEqual({ shown: [], hidden: 0 });
  });

  it("lists the filings in their order, the ones in a state the filter named first", () => {
    const business = pickedSearch.business!;

    expect(
      registrationsOnFile(business.registrations, pickMatched).map(
        ({ item, matched }) => [item.state, matched],
      ),
    ).toEqual([
      ["OH", true],
      ["PA", false],
      ["MD", false],
    ]);
    // A filter that named none leaves them as orderedRegistrations has them.
    expect(
      registrationsOnFile(business.registrations, NOTHING_MATCHED).map(
        ({ item, matched }) => [item.state, matched],
      ),
    ).toEqual([
      ["PA", false],
      ["OH", false],
      ["MD", false],
    ]);
    expect(registrationsOnFile(undefined, pickMatched)).toEqual([]);
  });

  it("has nothing on file for a search with no business", () => {
    const bare: Search = { id: "a", state: "FAILED" };

    expect(addressesOnFile(null, bare, NOTHING_MATCHED)).toEqual([]);
    expect(statesOnFile(undefined, NOTHING_MATCHED)).toEqual([]);
    expect(officersOnFile(null, bare, NOTHING_MATCHED)).toEqual([]);
  });
});
