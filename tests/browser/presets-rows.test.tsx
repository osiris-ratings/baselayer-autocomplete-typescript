import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type {
  AddressSuggestion,
  BusinessSuggestion,
  PersonSuggestion,
  RelatedItem,
} from "@baselayer-sdk/autocomplete";
import {
  AddressAutocompleteView,
  BusinessAutocompleteView,
  PersonAutocompleteView,
} from "@baselayer-sdk/autocomplete/react";

import {
  DEFAULT_STYLE,
  PRESETS,
  applyPreset,
  changedVars,
  componentProps,
  previewCss,
} from "../../site/demo/style-state";

import "../../src/react/styles.css";

// Each preset's rows drawn at the widths, and as long, as the groups' own test
// draws them, and held to the same faults.
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

const BUSINESSES: BusinessSuggestion[] = [
  {
    type: "business",
    token: "tok-b-1",
    label: LONG_BUSINESS,
    matched_name: null,
    match: "strong",
    domicile_state: "MO",
    states: ["CA", "DE", "FL", "IL", "MO", "NY", "TX"],
    structure: "C_CORPORATION",
    related: {
      people: {
        count: 12,
        matched: null,
        truncated: true,
        items: [
          entity("person", LONG_NAME, "officer"),
          { ...entity("person", "Ada Fox", "agent"), token: null },
        ],
      },
      addresses: {
        count: 3,
        matched: null,
        truncated: true,
        items: [entity("address", LONG_ADDRESS, "principal")],
      },
    },
    highlight: [{ text: "CINDER", matched: true }],
  },
];

const SHOWN = {
  found: 1,
  foundCapped: false,
  truncated: false,
  indexTag: null,
  roundTripMs: null,
  isSearching: false,
  error: null,
  open: true,
};

let host: HTMLDivElement;
let root: Root;
const sheet = document.createElement("style");

beforeAll(() => {
  // The preview's own way in: its stylesheet over `.demo-preview .bl-ac`,
  // which a variable set on an ancestor would lose to `.bl-ac`'s defaults.
  document.head.append(sheet);
  host = document.createElement("div");
  host.className = "demo-preview";
  document.body.append(host);
  root = createRoot(host);
});

afterAll(() => {
  root.unmount();
  host.remove();
  sheet.remove();
});

/** Whether `inner` lies within `outer`, give or take a subpixel. */
function inside(inner: Element, outer: Element): boolean {
  const a = inner.getBoundingClientRect();
  const b = outer.getBoundingClientRect();
  return a.left >= b.left - 0.5 && a.right <= b.right + 0.5;
}

/** What is wrong with the groups as drawn, one entry a fault. */
/**
 * What a drawn menu gets wrong. `narrow`: too narrow for the columns, where a
 * role gives way as text does.
 */
function faults(narrow = false): string[] {
  const found: string[] = [];
  const list = host.querySelector<HTMLElement>(".bl-ac-list")!;
  if (list.scrollWidth > list.clientWidth) {
    found.push(
      `the list scrolls sideways by ${list.scrollWidth - list.clientWidth}px`,
    );
  }
  host
    .querySelectorAll<HTMLElement>(
      ".bl-ac-group-head, .bl-ac-group-line, .bl-ac-group > .bl-ac-row",
    )
    .forEach((line, index) => {
      if (line.scrollWidth > line.clientWidth) {
        found.push(
          `line ${index} overflows by ${line.scrollWidth - line.clientWidth}px`,
        );
      }
      // The squares keep their width, and the role too wherever the columns
      // fit; text, the counts too, gives way after the name.
      line
        .querySelectorAll<HTMLElement>(
          narrow
            ? ".bl-ac-state, .bl-ac-more-states"
            : ".bl-ac-role, .bl-ac-state, .bl-ac-more-states",
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
      // badge has given all its room, or at its cap, 60% of the line, so a
      // long name still leaves the rest something. A business row's head
      // keeps its flag pinned beside the name instead, as it always has.
      const badge = line.classList.contains("bl-ac-row")
        ? null
        : name?.nextElementSibling;
      const style = getComputedStyle(line);
      const room =
        line.clientWidth -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight);
      if (
        name != null &&
        badge != null &&
        name.scrollWidth > name.clientWidth &&
        badge.getBoundingClientRect().width > 1 &&
        name.getBoundingClientRect().width < 0.59 * room
      ) {
        found.push(`line ${index}: the name is cut while its badge has room`);
      }
    });
  return found;
}

describe("every preset's rows", () => {
  for (const preset of PRESETS) {
    const style = applyPreset(DEFAULT_STYLE, preset);
    for (const width of WIDTHS) {
      it(`hold their places on every search in ${preset.name} at ${width}px`, () => {
        host.style.width = `${width}px`;
        sheet.textContent = previewCss(style);
        const found: string[] = [];
        const look = style.look;
        flushSync(() =>
          root.render(
            <BusinessAutocompleteView
              id="businesses"
              label="Business name"
              value="cinder"
              onInputChange={() => {}}
              onSelect={() => {}}
              suggestions={BUSINESSES}
              look={look}
              {...componentProps(style, "businesses")}
              {...SHOWN}
            />,
          ),
        );
        found.push(
          ...faults(width <= 360).map(fault => `businesses: ${fault}`),
        );
        // The preset's variables reached the component, fonts and sizes too.
        const drawn = getComputedStyle(host.querySelector(".bl-ac")!);
        for (const [name, value] of changedVars(style)) {
          expect(drawn.getPropertyValue(name).trim(), name).toBe(value);
        }
        flushSync(() =>
          root.render(
            <PersonAutocompleteView
              id="people"
              label="Person's name"
              value="margarethe"
              onInputChange={() => {}}
              onSelect={() => {}}
              suggestions={PEOPLE}
              look={look}
              {...componentProps(style, "people")}
              {...SHOWN}
            />,
          ),
        );
        found.push(...faults(width <= 360).map(fault => `people: ${fault}`));
        flushSync(() =>
          root.render(
            <AddressAutocompleteView
              id="addresses"
              label="Address"
              value="4120 orchard"
              onInputChange={() => {}}
              onSelect={() => {}}
              suggestions={ADDRESSES}
              look={look}
              {...componentProps(style, "addresses")}
              {...SHOWN}
            />,
          ),
        );
        found.push(...faults(width <= 360).map(fault => `addresses: ${fault}`));
        expect(found).toEqual([]);
      });
    }
  }
});
