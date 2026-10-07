import axe from "axe-core";
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
  address:
    "4120 Wrenmoor Lane Northwest Building C Suite 1400, Springfield, MO 65806",
  states: ["CA", "DE", "FL", "IL", "MO", "NY", "TX"],
  domicile_state: "MO",
});

const entity = (
  type: "person" | "address",
  label: string,
  role: RelatedItem["role"],
): RelatedItem => ({
  type,
  token: `tok-${label}`,
  label,
  role,
  matched: false,
  address: null,
  states: null,
  domicile_state: null,
});

const LONG_ADDRESS =
  "4120 Wrenmoor Lane Northwest Building C Suite 1400, Springfield, MO 65806";
const LONG_NAME = "Margarethe Alexandrina Featherstonehaugh-Whitfield";

const LONG_BUSINESS =
  "CINDER RIGGING AND HEAVY EQUIPMENT HAULING COMPANY OF THE GREATER LAKES, INC.";

const PEOPLE: PersonSuggestion[] = [
  {
    type: "person",
    token: "tok-p-1",
    label: LONG_NAME,
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
      addresses: {
        count: 3_210,
        matched: null,
        truncated: true,
        items: [entity("address", LONG_ADDRESS, "officer")],
      },
    },
  },
];

const ADDRESSES: AddressSuggestion[] = [
  {
    type: "address",
    token: "tok-a-1",
    label: LONG_ADDRESS,
    matched_name: null,
    match: "strong",
    highlight: [{ text: "4120 Orchard", matched: true }],
    components: {
      line1: "4120 Wrenmoor Lane Northwest Building C",
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
      people: {
        count: 2_345,
        matched: null,
        truncated: true,
        items: [entity("person", LONG_NAME, "agent")],
      },
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
          label="Person's name"
          value="margarethe"
          onInputChange={() => {}}
          onSelect={() => {}}
          include={["businesses", "addresses"]}
          suggestions={PEOPLE}
          {...state}
        />
      ) : (
        <AddressAutocompleteView
          id="addresses"
          label="Address"
          value="4120 orchard"
          onInputChange={() => {}}
          onSelect={() => {}}
          include={["businesses", "people"]}
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
    .querySelectorAll<HTMLElement>(".bl-ac-group-head, .bl-ac-group-line")
    .forEach((line, index) => {
      if (line.scrollWidth > line.clientWidth) {
        found.push(
          `line ${index} overflows by ${line.scrollWidth - line.clientWidth}px`,
        );
      }
      line
        .querySelectorAll<HTMLElement>(
          ".bl-ac-group-count, .bl-ac-role, .bl-ac-state, .bl-ac-more-states",
        )
        .forEach(tag => {
          if (!inside(tag, line) || tag.scrollWidth > tag.clientWidth) {
            found.push(`line ${index}: "${tag.textContent}" is cut`);
          }
        });
      const name = line.querySelector<HTMLElement>(
        ".bl-ac-name, .bl-ac-line-name",
      );
      if (name !== null && name.getBoundingClientRect().width < 24) {
        found.push(`line ${index}: the name is squeezed to nothing`);
      }
      // The badge after a name gives way first: a name is cut only once its
      // badge has given all its room.
      const badge = name?.nextElementSibling;
      if (
        name != null &&
        badge != null &&
        name.scrollWidth > name.clientWidth &&
        badge.getBoundingClientRect().width > 1
      ) {
        found.push(`line ${index}: the name is cut while its badge has room`);
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

describe("person and address groups, to assistive technology", () => {
  for (const route of ["people", "addresses"] as const) {
    it(`break no ARIA rule on ${route}, with inert lines among the options`, async () => {
      draw(route, 560);
      // Each group lists an inert line: the businesses are the picks, the
      // addresses or people listed beside them are not.
      expect(host.querySelectorAll('[role="option"]').length).toBeGreaterThan(
        0,
      );

      const { violations } = await axe.run(host, {
        // The look's colours are the host's; the structure is the SDK's.
        rules: { "color-contrast": { enabled: false } },
      });

      expect(
        violations.map(
          ({ id, nodes }) =>
            `${id}: ${nodes.map(node => node.target.join(" ")).join(", ")}`,
        ),
      ).toEqual([]);
    });
  }
});
