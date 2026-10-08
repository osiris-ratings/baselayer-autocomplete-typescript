/** @vitest-environment jsdom */

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SearchResult } from "../../site/demo/SearchResult";
import { SAMPLE_SEARCH } from "../../site/demo/sample-search";
import type { Search } from "../../site/demo/searches";

// What the API names alike, it may name twice: one address under two sources,
// two officers of one name, a warning sent again, a watchlist's entries with
// nothing to tell them apart. The report draws each, and React is not left
// with two children of one key (which it may drop, or draw twice, on a
// re-render).

const address = {
  street: "1 DUNMARROW ST",
  city: "PITTSBURGH",
  state: "PA",
  zip: "15212",
};

const search: Search = {
  ...SAMPLE_SEARCH,
  warnings: [
    "IRS Validation is unavailable.",
    "IRS Validation is unavailable.",
  ],
  watchlist_hits: [{ code: "OFAC", name: "OFAC", count: 2, details: [{}, {}] }],
  business: {
    ...SAMPLE_SEARCH.business!,
    primary_address: { ...address, street: "9 OTHER RD" },
    addresses: [
      { ...address, sources: ["SOS"] },
      { ...address, sources: ["Online"] },
    ],
    business_officers: [
      { name: "JOHN SMITH", titles: ["CEO"] },
      { name: "JOHN SMITH", titles: ["CFO"] },
    ],
  },
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("a report with entries that read alike", () => {
  it("draws every one of them", () => {
    const { container } = render(
      <SearchResult search={search} elapsedMs={null} />,
    );
    expect(container.querySelectorAll(".sr-people > li")).toHaveLength(2);
    expect(
      container.querySelectorAll('.sr-callout[data-tone="warn"] li'),
    ).toHaveLength(2);
    expect(container.querySelectorAll(".sr-list-details li")).toHaveLength(2);
    // The primary address, which the list leaves out, and the one named twice.
    expect(container.querySelectorAll(".sr-onfile > li")).toHaveLength(3);
  });

  it("gives no two of a list the same key", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<SearchResult search={search} elapsedMs={null} />);
    // React says so when it meets two children of one key.
    const clashes = error.mock.calls.filter(call =>
      String(call[0]).includes("same key"),
    );
    expect(clashes).toEqual([]);
  });
});
