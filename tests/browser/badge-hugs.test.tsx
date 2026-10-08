import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";

import {
  ADDRESS_LINE_FIELDS,
  BUSINESS_LINE_FIELDS,
  PERSON_LINE_FIELDS,
  type AddressSuggestion,
  type BusinessSuggestion,
  type PersonSuggestion,
  type RelatedItem,
} from "@baselayer-sdk/autocomplete";
import {
  AddressAutocompleteView,
  BusinessAutocompleteView,
  PersonAutocompleteView,
} from "@baselayer-sdk/autocomplete/react";

import "../../src/react/styles.css";

// Made-up businesses, people and addresses: a row of each search, listing
// every kind of line it can.
const item = (
  type: RelatedItem["type"],
  label: string,
  role: RelatedItem["role"],
): RelatedItem => ({
  type,
  token: `tok-${label}`,
  label,
  role,
  matched: false,
  address: type === "business" ? "1200 Tallowmere Rd, Pittsburgh, PA" : null,
  states: type === "business" ? ["PA", "OH"] : null,
  domicile_state: type === "business" ? "PA" : null,
});

const set = (items: RelatedItem[]) => ({
  count: items.length,
  matched: null,
  truncated: false,
  items,
});

const DANA: PersonSuggestion = {
  type: "person",
  token: "tok-dana",
  label: "Dana Whitfield",
  matched_name: null,
  match: "strong",
  highlight: [],
  related: {
    businesses: set([item("business", "NORTHSHORE PUMPING, LLC", "officer")]),
    addresses: set([item("address", "48 Wrenmoor St, Pittsburgh", "officer")]),
  },
};

const PIER: AddressSuggestion = {
  type: "address",
  token: "tok-pier",
  label: "77 Quillfeather Ln, Dover, DE",
  matched_name: null,
  match: "strong",
  highlight: [],
  components: {
    line1: "77 Quillfeather Ln",
    line2: null,
    city: "Dover",
    state: "DE",
    postal_code: null,
  },
  related: {
    businesses: set([item("business", "NORTHSHORE PUMPING, LLC", "principal")]),
    people: set([item("person", "Dana Whitfield", "officer")]),
  },
};

const HARBOR: BusinessSuggestion = {
  type: "business",
  token: "tok-harbor",
  label: "HARBOR CONCRETE PUMPING, LLC",
  matched_name: null,
  match: "strong",
  domicile_state: "PA",
  states: ["PA"],
  structure: "LLC",
  highlight: [],
  related: {
    people: set([item("person", "Dana Whitfield", "officer")]),
    addresses: set([item("address", "48 Wrenmoor St, Pittsburgh", "mailing")]),
  },
};

const viewProps = {
  value: "x",
  onInputChange: () => {},
  onSelect: () => {},
  found: 1,
  foundCapped: false,
  truncated: false,
  indexTag: null,
  roundTripMs: null,
  isSearching: false,
  error: null,
  open: true,
};

type Search = "person" | "address" | "business";

/** Every line a search's rows draw, by its name, and the fields it can show. */
const LINES: Record<Search, Record<string, readonly string[]>> = {
  person: PERSON_LINE_FIELDS,
  address: ADDRESS_LINE_FIELDS,
  business: BUSINESS_LINE_FIELDS,
};

function view(search: Search, layout: Record<string, string>): ReactElement {
  switch (search) {
    case "person":
      return (
        <PersonAutocompleteView
          {...viewProps}
          id="person"
          suggestions={[DANA]}
          list={["businesses", "addresses"]}
          layout={layout}
        />
      );
    case "address":
      return (
        <AddressAutocompleteView
          {...viewProps}
          id="address"
          suggestions={[PIER]}
          list={["businesses", "people"]}
          layout={layout}
        />
      );
    case "business":
      return (
        <BusinessAutocompleteView
          {...viewProps}
          id="business"
          suggestions={[HARBOR]}
          list={["people", "addresses"]}
          layout={layout}
        />
      );
  }
}

function draw(width: number, element: ReactElement) {
  const host = document.createElement("div");
  host.style.width = `${width}px`;
  host.style.fontFamily = "sans-serif";
  document.body.append(host);
  const root = createRoot(host);
  flushSync(() => root.render(element));
  return {
    host,
    done() {
      root.unmount();
      host.remove();
    },
  };
}

describe("a field in the place right after a line's name", () => {
  for (const search of ["person", "address", "business"] as const) {
    for (const [line, fields] of Object.entries(LINES[search])) {
      for (const field of fields) {
        for (const width of [560, 400, 320]) {
          it(`sits one gap after the name: ${search}'s ${line} line, ${field}, at ${width}px`, () => {
            const place = `${line}Badge`;
            const { host, done } = draw(
              width,
              view(search, { [place]: field }),
            );
            try {
              const badge = host.querySelector<HTMLElement>(
                `[data-place="${place}"]`,
              );
              expect(badge, `${place} draws ${field}`).not.toBeNull();
              const row = badge!.closest<HTMLElement>(
                ".bl-ac-group-head, .bl-ac-group-line",
              )!;
              const name = row.querySelector<HTMLElement>(
                ".bl-ac-name, .bl-ac-line-name",
              )!;
              const gap = parseFloat(getComputedStyle(row).columnGap);
              const between =
                badge!.getBoundingClientRect().left -
                name.getBoundingClientRect().right;
              expect(Math.abs(between - gap)).toBeLessThanOrEqual(1);
              // Its text starts where its box does, not pushed to the right.
              expect(getComputedStyle(badge!).textAlign).not.toBe("right");
            } finally {
              done();
            }
          });
        }
      }
    }
  }
});
