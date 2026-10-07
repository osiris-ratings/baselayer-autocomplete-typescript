import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";

import type {
  BusinessIconSegment,
  BusinessRowLayoutInput,
  BusinessSuggestion,
  PersonIconSegment,
  PersonRowLayoutInput,
  PersonSuggestion,
  RelatedItem,
} from "@baselayer-sdk/autocomplete";
import {
  BusinessAutocompleteView,
  PersonAutocompleteView,
} from "@baselayer-sdk/autocomplete/react";

import "../../src/react/styles.css";

// Made-up businesses, people and addresses.
const related = (
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
  states: type === "business" ? ["PA"] : null,
  domicile_state: type === "business" ? "PA" : null,
});

const set = (items: RelatedItem[]) => ({
  count: items.length,
  matched: null,
  truncated: false,
  items,
});

const HARBOR: BusinessSuggestion = {
  type: "business",
  token: "tok-harbor",
  label: "HARBOR CONCRETE PUMPING CO., INC.",
  matched_name: null,
  match: "strong",
  domicile_state: "PA",
  states: ["OH", "PA"],
  structure: "C_CORPORATION",
  highlight: [{ text: "HARBOR CONCRETE PUMPING CO., INC.", matched: false }],
  related: {
    people: set([
      related("person", "Dana Whitfield", "officer"),
      related("person", "Meridian Registered Agents, LLC", "agent"),
    ]),
    addresses: set([
      related("address", "PO Box 4410, Pittsburgh, PA 15212", "mailing"),
    ]),
  },
};

const DANA: PersonSuggestion = {
  type: "person",
  token: "tok-dana",
  label: "Dana Whitfield",
  matched_name: null,
  match: "strong",
  highlight: [],
  related: {
    businesses: set([
      related("business", "HARBOR CONCRETE PUMPING CO., INC.", "officer"),
    ]),
    addresses: set([
      related("address", "48 Wrenmoor St, Pittsburgh, PA 15206", "officer"),
    ]),
  },
};

function draw(view: ReactElement) {
  const host = document.createElement("div");
  host.style.width = "560px";
  host.style.fontFamily = "sans-serif";
  document.body.append(host);
  const root = createRoot(host);
  flushSync(() => root.render(view));
  return {
    icons: [...host.querySelectorAll<HTMLElement>(".bl-ac-icon")],
    done() {
      root.unmount();
      host.remove();
    },
  };
}

const common = {
  value: "harbor",
  onInputChange: () => {},
  found: 1,
  foundCapped: false,
  truncated: false,
  indexTag: null,
  roundTripMs: null,
  isSearching: false,
  error: null,
  open: true,
};

function business(
  layout: BusinessRowLayoutInput,
  iconSegments: BusinessIconSegment[],
) {
  return draw(
    <BusinessAutocompleteView
      {...common}
      id="business"
      onSelect={() => {}}
      suggestions={[HARBOR]}
      list={["people", "addresses"]}
      layout={layout}
      iconSegments={iconSegments}
    />,
  );
}

function person(
  layout: PersonRowLayoutInput,
  iconSegments: PersonIconSegment[],
) {
  return draw(
    <PersonAutocompleteView
      {...common}
      id="person"
      onSelect={() => {}}
      suggestions={[DANA]}
      list={["businesses", "addresses"]}
      layout={layout}
      iconSegments={iconSegments}
    />,
  );
}

/** Where the text an icon rides on starts: its name, or the rest of its field. */
function textAfter(icon: HTMLElement): DOMRect {
  const range = document.createRange();
  range.setStartAfter(icon);
  range.setEndAfter(icon.parentElement!.lastChild!);
  const next = icon.nextElementSibling;
  return next !== null && icon.parentElement!.lastChild === next
    ? next.getBoundingClientRect()
    : (range.getClientRects()[0] ?? range.getBoundingClientRect());
}

/** Each icon is drawn whole, just before its text, centred on its line. */
function expectEachBeforeItsText(icons: HTMLElement[]) {
  expect(icons.length).toBeGreaterThan(0);
  for (const icon of icons) {
    const at = icon.getBoundingClientRect();
    const text = textAfter(icon);
    const where = `${icon.dataset.entity} in ${icon.parentElement!.className}`;
    expect(at.width, where).toBeGreaterThan(8);
    expect(at.right, where).toBeLessThanOrEqual(text.left + 0.5);
    // Apart from it, but close: the gap a name keeps from its icon.
    expect(text.left - at.right, where).toBeGreaterThanOrEqual(3);
    expect(text.left - at.right, where).toBeLessThan(10);
    const middle = (at.top + at.bottom) / 2;
    expect(middle, where).toBeGreaterThan(text.top);
    expect(middle, where).toBeLessThan(text.bottom);
  }
}

const EVERY_BUSINESS_SEGMENT: BusinessIconSegment[] = [
  "name",
  "address",
  "people",
  "personName",
  "addressName",
];
const EVERY_PERSON_SEGMENT: PersonIconSegment[] = [
  "name",
  "firstAddress",
  "businessName",
  "address",
  "addressName",
];

describe("an icon on a segment", () => {
  const businessLayouts: [string, BusinessRowLayoutInput][] = [
    ["as it always was", {}],
    ["swapped", { subtitle: "people", subtitleTrailing: "address" }],
    [
      "moved to the first line",
      {
        titleTrailing: "people",
        subtitle: "address",
        subtitleTrailing: "states",
      },
    ],
  ];
  for (const [name, layout] of businessLayouts) {
    it(`sits right before its text on a business row laid out ${name}`, () => {
      const { icons, done } = business(layout, EVERY_BUSINESS_SEGMENT);
      try {
        expect(icons.map(icon => icon.dataset.glyph)).toEqual(
          expect.arrayContaining([
            "building",
            "envelope",
            "person",
            "briefcase",
          ]),
        );
        expectEachBeforeItsText(icons);
      } finally {
        done();
      }
    });
  }

  const personLayouts: [string, PersonRowLayoutInput][] = [
    ["by default", {}],
    [
      "with the addresses moved to the right",
      {
        headBadge: null,
        headTrailing: "firstAddress",
        businessBadge: null,
        businessTrailing: "address",
      },
    ],
  ];
  for (const [name, layout] of personLayouts) {
    it(`sits right before its text on a person's row ${name}`, () => {
      const { icons, done } = person(layout, EVERY_PERSON_SEGMENT);
      try {
        expect(icons).toHaveLength(5);
        expectEachBeforeItsText(icons);
      } finally {
        done();
      }
    });
  }
});
