import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import type {
  BusinessSuggestion,
  RelatedItem,
  RelatedSet,
} from "@baselayer-sdk/autocomplete";
import { BusinessAutocompleteView } from "@baselayer-sdk/autocomplete/react";

import "../../src/react/styles.css";

// The business typeahead a host gets with no layout, lists or picks of its
// own must draw exactly as it always has. What it draws is its markup and the
// styles each element computes to; with both unchanged, every pixel is too,
// on any platform, which a stored screenshot could not say across systems.
// The snapshot was taken before rows learned to list lines under them.

/** What decides how an element draws, but not what its text measures. */
const STYLES = [
  "display",
  "position",
  "flex",
  "flex-wrap",
  "flex-direction",
  "grid-auto-flow",
  "grid-auto-columns",
  "column-gap",
  "row-gap",
  "align-items",
  "align-self",
  "justify-content",
  "margin",
  "padding",
  "border",
  "border-radius",
  "box-shadow",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "letter-spacing",
  "line-height",
  "color",
  "background-color",
  "text-decoration-line",
  "text-decoration-color",
  "text-underline-offset",
  "text-transform",
  "white-space",
  "overflow",
  "text-overflow",
  "min-width",
  "max-width",
  "cursor",
  "visibility",
  "opacity",
] as const;

// Made-up businesses, people and addresses, one of each field among them.
function item(
  type: RelatedItem["type"],
  label: string,
  role: RelatedItem["role"],
  matched = false,
): RelatedItem {
  return {
    type,
    token: `tok-${label}`,
    label,
    role,
    matched,
    address: null,
    states: null,
    domicile_state: null,
  };
}

function set(items: RelatedItem[], count = items.length): RelatedSet {
  return {
    count,
    matched: items.some(each => each.matched) ? 1 : null,
    truncated: false,
    items,
  };
}

const ROWS: BusinessSuggestion[] = [
  {
    type: "business",
    token: "tok-a",
    label: "HARBOR CONCRETE PUMPING CO., INC.",
    matched_name: null,
    match: "strong",
    domicile_state: "PA",
    states: ["MD", "NY", "OH", "PA", "WV"],
    structure: "C_CORPORATION",
    related: {
      people: set(
        [
          item("person", "Dana Whitfield", "officer"),
          item("person", "Luis Ortega", "officer"),
        ],
        4,
      ),
      addresses: set([
        item(
          "address",
          "1200 Tallowmere Rd, Pittsburgh, PA 15212",
          "principal",
        ),
      ]),
    },
    highlight: [
      { text: "HARBOR", matched: true },
      { text: " ", matched: false },
      { text: "CONCRETE", matched: true },
      { text: " PUMPING CO., INC.", matched: false },
    ],
  },
  {
    type: "business",
    token: "tok-b",
    label: "NORTHSHORE PUMPING, LLC",
    matched_name: "HARBOR CONCRETE PUMPS",
    match: "partial",
    domicile_state: "OH",
    states: ["OH", "PA"],
    structure: "LLC",
    related: {
      people: set([item("person", "MERIDIAN REGISTERED AGENTS, LLC", "agent")]),
      addresses: set([
        item("address", "88 Velloway St, Akron, OH 44308", "officer", true),
      ]),
    },
    highlight: [
      { text: "HARBOR", matched: true },
      { text: " ", matched: false },
      { text: "CONCRETE", matched: true },
      { text: " PUMPS", matched: false },
    ],
  },
  {
    type: "business",
    token: "tok-c",
    label: "HARBOR CONCRETE SUPPLY, INC.",
    matched_name: null,
    match: "strong",
    domicile_state: "NJ",
    states: ["NJ"],
    structure: null,
    related: { people: set([]), addresses: set([]) },
    highlight: [
      { text: "HARBOR", matched: true },
      { text: " ", matched: false },
      { text: "CONCRETE", matched: true },
      { text: " SUPPLY, INC.", matched: false },
    ],
  },
];

interface Drawn {
  tag: string;
  attributes: Record<string, string>;
  style: Record<string, string>;
  children: (Drawn | string)[];
}

/** An element as it draws: its markup, its text and its computed styles. */
function drawn(element: Element): Drawn {
  const computed = getComputedStyle(element);
  return {
    tag: element.tagName.toLowerCase(),
    attributes: Object.fromEntries(
      [...element.attributes]
        // Ids are minted per render; what refers to them is checked by role.
        .filter(({ name }) => name !== "id" && !name.startsWith("aria-"))
        .map(({ name, value }) => [name, value]),
    ),
    style: Object.fromEntries(
      STYLES.map(name => [name, computed.getPropertyValue(name)]),
    ),
    children: [...element.childNodes].flatMap(node =>
      node.nodeType === Node.ELEMENT_NODE
        ? [drawn(node as Element)]
        : node.nodeType === Node.TEXT_NODE && node.textContent !== ""
          ? [node.textContent ?? ""]
          : [],
    ),
  };
}

describe("the business typeahead with nothing of the host's own", () => {
  it("draws its menu exactly as it always has", async () => {
    const host = document.createElement("div");
    host.style.width = "560px";
    host.style.fontFamily = "sans-serif";
    document.body.append(host);
    const root = createRoot(host);
    flushSync(() =>
      root.render(
        <BusinessAutocompleteView
          id="pinned"
          label="Business name"
          value="harbor concr"
          onInputChange={() => {}}
          onSelect={() => {}}
          suggestions={ROWS}
          found={27}
          foundCapped={false}
          truncated={false}
          indexTag="sample"
          roundTripMs={42}
          isSearching={false}
          error={null}
          open
        />,
      ),
    );
    try {
      await expect(
        JSON.stringify(drawn(host.querySelector(".bl-ac")!), null, 1),
      ).toMatchFileSnapshot("./__snapshots__/business-default.json");
    } finally {
      root.unmount();
      host.remove();
    }
  });
});
