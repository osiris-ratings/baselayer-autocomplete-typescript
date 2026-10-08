import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  BusinessSuggestion,
  RelatedSet,
  RowLayoutInput,
} from "@baselayer-sdk/autocomplete";

import {
  BusinessAutocompleteView,
  type BusinessAutocompleteViewProps,
} from "../../src/react";

// A made-up business; only its counts matter here.
function harbor(people: number | null, addresses: number | null) {
  const set = (count: number | null): RelatedSet => ({
    count,
    matched: null,
    truncated: false,
    items: [],
  });
  return {
    type: "business",
    token: "tok-harbor",
    label: "HARBOR CONCRETE PUMPING, LLC",
    matched_name: null,
    match: "strong",
    domicile_state: "PA",
    states: ["PA"],
    structure: "LLC",
    highlight: [],
    related: { people: set(people), addresses: set(addresses) },
  } satisfies BusinessSuggestion;
}

/** Counts at the right of the second line, where the officers go by default. */
const COUNTS: RowLayoutInput = { subtitleTrailing: "counts" };

function counts(
  row: BusinessSuggestion,
  overrides: Partial<BusinessAutocompleteViewProps> = {},
) {
  const { container } = render(
    <BusinessAutocompleteView
      id="business"
      value="harbor"
      onInputChange={vi.fn()}
      onSelect={vi.fn()}
      suggestions={[row]}
      found={1}
      foundCapped={false}
      truncated={false}
      indexTag={null}
      roundTripMs={null}
      isSearching={false}
      error={null}
      open
      layout={COUNTS}
      {...overrides}
    />,
  );
  return container.querySelector<HTMLElement>(".bl-ac-group-count");
}

afterEach(cleanup);

describe("a business row's counts", () => {
  it("says how many people and addresses, in that order, as a person's or an address's head does", () => {
    const drawn = counts(harbor(4, 3));
    expect(drawn?.textContent).toBe("4 people · 3 addresses");
    expect(drawn).toHaveAttribute("data-place", "subtitleTrailing");
    // Text, so its corner shares the line as text does.
    expect(drawn?.closest("[data-corner]")).toHaveAttribute(
      "data-text",
      "true",
    );
  });

  it("counts one in the singular, and thousands with a separator", () => {
    expect(counts(harbor(1, 1))?.textContent).toBe("1 person · 1 address");
    cleanup();
    expect(counts(harbor(1200, 0))?.textContent).toBe(
      "1,200 people · 0 addresses",
    );
  });

  it("leaves out a relation the answer has no count for, and draws nothing when it has none", () => {
    // A count is null when its relation was not asked for, the scope left it
    // out, or the answer could not expand it.
    expect(counts(harbor(4, null))?.textContent).toBe("4 people");
    cleanup();
    expect(counts(harbor(null, 3))?.textContent).toBe("3 addresses");
    cleanup();
    expect(counts(harbor(null, null))).toBeNull();
  });

  it("takes a host's own words for each count", () => {
    const drawn = counts(harbor(4, 3), {
      messages: {
        relationCounts: {
          businesses: count => `${count} B`,
          people: count => `${count} P`,
          addresses: count => `${count} A`,
        },
      },
    });
    expect(drawn?.textContent).toBe("4 P · 3 A");
  });

  it("is drawn nowhere by default", () => {
    expect(counts(harbor(4, 3), { layout: {} })).toBeNull();
  });
});
