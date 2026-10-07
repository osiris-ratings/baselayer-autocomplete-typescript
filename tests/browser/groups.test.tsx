import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

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

/** The menu widths the rows must hold at: a wide form, a narrow one, a phone. */
const WIDTHS = [560, 400, 320] as const;

// Made-up people, addresses and businesses, each as long as a real one can be.
const business = (label: string, role: RelatedItem["role"]): RelatedItem => ({
  type: "business",
  token: `tok-${label}`,
  label,
  role,
  matched: false,
  address: null,
  states: null,
  domicile_state: null,
});

const LONG_BUSINESS =
  "CINDER RIGGING AND HEAVY EQUIPMENT HAULING COMPANY OF THE GREATER LAKES, INC.";

const PEOPLE: PersonSuggestion[] = [
  {
    type: "person",
    token: "tok-p-1",
    label: "Margarethe Alexandrina Featherstonehaugh-Whitfield",
    matched_name: null,
    match: "strong",
    highlight: [
      { text: "Margarethe", matched: true },
      { text: " Alexandrina Featherstonehaugh-Whitfield", matched: false },
    ],
    related: {
      businesses: {
        count: 12_345,
        matched: null,
        truncated: true,
        items: [
          business(LONG_BUSINESS, "officer"),
          business("Ortega Masonry LLC", "agent"),
        ],
      },
      addresses: { count: null, matched: null, truncated: false, items: [] },
    },
  },
];

const ADDRESSES: AddressSuggestion[] = [
  {
    type: "address",
    token: "tok-a-1",
    label:
      "4120 Orchard Lane Northwest Building C Suite 1400, Springfield, MO 65806",
    matched_name: null,
    match: "strong",
    highlight: [{ text: "4120 Orchard", matched: true }],
    components: {
      line1: "4120 Orchard Lane Northwest Building C",
      line2: "Suite 1400",
      city: "Springfield",
      state: "MO",
      postal_code: "65806",
    },
    related: {
      businesses: {
        count: 1_204,
        matched: null,
        truncated: true,
        items: [
          business(LONG_BUSINESS, "officer"),
          business("Ridgeline Freight LLC", "mailing"),
        ],
      },
      people: { count: null, matched: null, truncated: false, items: [] },
    },
  },
];

let host: HTMLDivElement;
let root: Root;

beforeAll(() => {
  host = document.createElement("div");
  host.style.fontFamily = "sans-serif";
  document.body.append(host);
  root = createRoot(host);
});

afterAll(() => {
  root.unmount();
  host.remove();
});

const state = {
  found: 1,
  foundCapped: false,
  truncated: false,
  indexTag: null,
  roundTripMs: null,
  isSearching: false,
  error: null,
  open: true,
};

function draw(route: "people" | "addresses", width: number) {
  host.style.width = `${width}px`;
  expect(window.innerWidth).toBeGreaterThan(width + 32);
  flushSync(() =>
    root.render(
      route === "people" ? (
        <PersonAutocompleteView
          id="people"
          value="margarethe"
          onInputChange={() => {}}
          onSelect={() => {}}
          suggestions={PEOPLE}
          {...state}
        />
      ) : (
        <AddressAutocompleteView
          id="addresses"
          value="4120 orchard"
          onInputChange={() => {}}
          onSelect={() => {}}
          suggestions={ADDRESSES}
          {...state}
        />
      ),
    ),
  );
}

/** Whether `inner` lies within `outer`, give or take a subpixel. */
function inside(inner: Element, outer: Element): boolean {
  const a = inner.getBoundingClientRect();
  const b = outer.getBoundingClientRect();
  return a.left >= b.left - 0.5 && a.right <= b.right + 0.5;
}

/** What is wrong with the groups as drawn, one entry a fault. */
function faults(): string[] {
  const found: string[] = [];
  const list = host.querySelector<HTMLElement>(".bl-ac-list")!;
  if (list.scrollWidth > list.clientWidth) {
    found.push(
      `the list scrolls sideways by ${list.scrollWidth - list.clientWidth}px`,
    );
  }
  host
    .querySelectorAll<HTMLElement>(".bl-ac-group-head, .bl-ac-option")
    .forEach((line, index) => {
      if (line.scrollWidth > line.clientWidth) {
        found.push(
          `line ${index} overflows by ${line.scrollWidth - line.clientWidth}px`,
        );
      }
      line
        .querySelectorAll<HTMLElement>(".bl-ac-group-count, .bl-ac-role")
        .forEach(tag => {
          if (!inside(tag, line) || tag.scrollWidth > tag.clientWidth) {
            found.push(`line ${index}: "${tag.textContent}" is cut`);
          }
        });
      const name = line.querySelector<HTMLElement>(
        ".bl-ac-name, .bl-ac-option-name",
      );
      if (name !== null && name.getBoundingClientRect().width < 24) {
        found.push(`line ${index}: the name is squeezed to nothing`);
      }
    });
  return found;
}

describe("person and address groups", () => {
  for (const route of ["people", "addresses"] as const) {
    for (const width of WIDTHS) {
      it(`keep every count and role whole, and the names in their line, on ${route} at ${width}px`, () => {
        draw(route, width);
        expect(host.querySelectorAll(".bl-ac-group").length).toBe(1);
        expect(faults()).toEqual([]);
      });
    }
  }
});
