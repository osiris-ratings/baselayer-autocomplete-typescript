import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import type {
  AddressSuggestion,
  PersonSuggestion,
  RelatedItem,
} from "@baselayer-sdk/autocomplete";
import {
  AddressAutocompleteView,
  PersonAutocompleteView,
} from "@baselayer-sdk/autocomplete/react";

import "../../src/react/styles.css";

// Made-up businesses: one, five and two states, under two roles.
const business = (
  label: string,
  states: string[],
  role: RelatedItem["role"],
): RelatedItem => ({
  type: "business",
  token: `tok-${label}`,
  label,
  role,
  matched: false,
  address: "1200 Tallowmere Rd, Pittsburgh, PA 15212",
  states,
  domicile_state: states[0]!,
});

const BUSINESSES = {
  count: 3,
  matched: null,
  truncated: false,
  items: [
    business("HARBOR CONCRETE SUPPLY, INC.", ["CA"], "officer"),
    business(
      "BAYSIDE HARBOR CONCRETE, INC.",
      ["DE", "CA", "FL", "NV", "OR", "WA", "AZ", "TX", "NY", "NJ"],
      "agent",
    ),
    business("NORTHSHORE PUMPING, LLC", ["FL", "PA"], "officer"),
  ],
};

const DANA: PersonSuggestion = {
  type: "person",
  token: "tok-dana",
  label: "Dana Whitfield",
  matched_name: null,
  match: "strong",
  highlight: [],
  related: {
    businesses: BUSINESSES,
    addresses: { count: null, matched: null, truncated: false, items: [] },
  },
};

const QUILL: AddressSuggestion = {
  type: "address",
  token: "tok-quill",
  label: "77 QUILLBACK LN, FARRELTON, OR 97433",
  matched_name: null,
  match: "strong",
  highlight: [],
  components: {
    line1: "77 QUILLBACK LN",
    line2: null,
    city: "FARRELTON",
    state: "OR",
    postal_code: "97433",
  },
  related: {
    businesses: BUSINESSES,
    people: { count: null, matched: null, truncated: false, items: [] },
  },
};

const COMMON = {
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
} as const;

type Place = "right" | "left";

function draw(route: "people" | "addresses", width: number, place: Place) {
  const host = document.createElement("div");
  host.style.width = `${width}px`;
  host.style.fontFamily = "sans-serif";
  document.body.append(host);
  const root = createRoot(host);
  const layout =
    place === "right"
      ? undefined
      : ({ businessBadge: "states", businessTrailingBadge: null } as const);
  flushSync(() =>
    root.render(
      route === "people" ? (
        <PersonAutocompleteView
          id="people"
          suggestions={[DANA]}
          layout={layout}
          {...COMMON}
        />
      ) : (
        <AddressAutocompleteView
          id="addresses"
          suggestions={[QUILL]}
          layout={layout}
          {...COMMON}
        />
      ),
    ),
  );
  return {
    lines: [
      ...host.querySelectorAll<HTMLElement>('[data-testid="business-line"]'),
    ],
    done() {
      root.unmount();
      host.remove();
    },
  };
}

const box = (element: Element) => element.getBoundingClientRect();
/** The gap between a line's segments: its corners are only groupings. */
const gapOf = (line: Element) => parseFloat(getComputedStyle(line).columnGap);

describe("the states on a person's or an address's business lines", () => {
  for (const route of ["people", "addresses"] as const) {
    for (const width of [560, 400, 320]) {
      it(`end one gap before the role, at one x where they are columns, placed at the right, for ${route} at ${width}px`, () => {
        const { lines, done } = draw(route, width, "right");
        try {
          expect(lines).toHaveLength(3);
          const ends = lines.map(line => {
            const states = line.querySelector(".bl-ac-states")!;
            const last = states.lastElementChild!;
            const role = line.querySelector(".bl-ac-role")!;
            // One gap before the role, never over it.
            const gap = gapOf(line);
            expect(box(role).left - box(last).right).toBeCloseTo(gap, 0);
            expect(box(last).right).toBeLessThanOrEqual(box(role).left);
            return box(last).right;
          });
          // One x down the group wherever the states and the role are
          // columns; below 22.5rem they are not, and each line's states end
          // one gap before its own role.
          if (width > 360) {
            expect(Math.max(...ends) - Math.min(...ends)).toBeLessThanOrEqual(
              0.5,
            );
          }
          // The +N stays last.
          const many = lines[1]!.querySelector(".bl-ac-states")!;
          expect(
            many.lastElementChild!.classList.contains("bl-ac-more-states"),
          ).toBe(true);
        } finally {
          done();
        }
      });

      it(`start one gap after the name, placed at the left, for ${route} at ${width}px`, () => {
        const { lines, done } = draw(route, width, "left");
        try {
          expect(lines).toHaveLength(3);
          for (const line of lines) {
            const states = line.querySelector(".bl-ac-states")!;
            const before = states.previousElementSibling!;
            const gap = gapOf(line);
            expect(
              box(states.firstElementChild!).left - box(before).right,
            ).toBeCloseTo(gap, 0);
          }
        } finally {
          done();
        }
      });
    }
  }
});
