import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type {
  BusinessSuggestion,
  RelatedItem,
  RowLayoutInput,
} from "@baselayer-sdk/autocomplete";
import { BusinessAutocompleteView } from "@baselayer-sdk/autocomplete/react";

import "../../src/react/styles.css";

/** The menu widths the rows must hold at: a wide form, a narrow one, a phone. */
const WIDTHS = [560, 400, 320] as const;

function related(type: string, items: Omit<RelatedItem, "type">[]) {
  return {
    count: items.length,
    matched: null,
    truncated: false,
    items: items.map(item => ({ type, ...item })),
  };
}

function row(overrides: Partial<BusinessSuggestion>): BusinessSuggestion {
  return {
    type: "business",
    token: `tok-${overrides.label ?? "row"}`,
    label: "CINDER RIGGING, INC.",
    matched_name: null,
    match: "strong",
    domicile_state: "DE",
    states: ["DE"],
    structure: null,
    related: {
      people: related("person", []),
      addresses: related("address", []),
      liens: { count: null, matched: null, truncated: false, items: [] },
    },
    highlight: [],
    ...overrides,
  };
}

// Made-up rows, each long where a real one can be: a long name that matched
// under another, many states, a long address, a long agent's name; and the
// rows that lack a field: no structure, no people, no address.
const ROWS: BusinessSuggestion[] = [
  row({
    label: "CINDER RIGGING AND HEAVY EQUIPMENT HAULING COMPANY, INC.",
    matched_name: "EMBERLINE HOLDINGS GROUP",
    structure: "C_CORPORATION",
    states: ["CA", "DE", "FL", "IL", "NY", "TX", "WA"],
    related: {
      people: related("person", [
        { token: null, label: "Wesley Crane", role: "officer", matched: false },
        { token: null, label: "Ada Fox", role: "officer", matched: false },
      ]),
      addresses: related("address", [
        {
          token: "tok-a1",
          label: "4120 Orchard Lane Suite 1400, Springfield, MO 65806",
          role: "principal",
          matched: false,
        },
      ]),
      liens: { count: null, matched: null, truncated: false, items: [] },
    },
    highlight: [
      { text: "CINDER", matched: true },
      {
        text: " RIGGING AND HEAVY EQUIPMENT HAULING COMPANY, INC.",
        matched: false,
      },
    ],
  }),
  row({
    label: "CINDER HOLDINGS",
    related: {
      people: related("person", [
        {
          token: null,
          label: "NORTHGATE REGISTERED AGENT SERVICES, INC",
          role: "agent",
          matched: false,
        },
      ]),
      addresses: related("address", [
        {
          token: "tok-a2",
          label: "88 Cactus Wren Drive, Building C, Tempe, AZ 85281",
          role: "agent",
          matched: false,
        },
      ]),
      liens: { count: null, matched: null, truncated: false, items: [] },
    },
  }),
  row({
    label: "CINDER PARTNERS LLC",
    structure: "LLC",
    states: ["NV", "UT", "ID"],
    domicile_state: "NV",
    related: {
      people: related("person", []),
      addresses: related("address", [
        {
          token: "tok-a3",
          label: "PO Box 4417, Durham, NC 27702",
          role: "mailing",
          matched: false,
        },
      ]),
      liens: { count: null, matched: null, truncated: false, items: [] },
    },
  }),
  row({
    label: "CINDER",
    structure: "TRADE_NAME",
    related: {
      people: related("person", [
        {
          token: null,
          label: "Marguerite Okonkwo-Lindqvist",
          role: "officer",
          matched: false,
        },
        { token: null, label: "Ada Fox", role: "officer", matched: false },
        { token: null, label: "Wesley Crane", role: "officer", matched: false },
      ]),
      addresses: related("address", []),
      liens: { count: null, matched: null, truncated: false, items: [] },
    },
  }),
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

function draw(layout: RowLayoutInput, width: number) {
  host.style.width = `${width}px`;
  flushSync(() =>
    root.render(
      <BusinessAutocompleteView
        id="rows"
        value="cinder"
        onInputChange={() => {}}
        onSelect={() => {}}
        suggestions={ROWS}
        found={ROWS.length}
        foundCapped={false}
        truncated={false}
        indexTag={null}
        roundTripMs={null}
        isSearching={false}
        error={null}
        open
        layout={layout}
      />,
    ),
  );
}

/** Whether `inner` lies within `outer`, give or take a subpixel. */
function within(inner: DOMRect, outer: DOMRect): boolean {
  return inner.left >= outer.left - 0.5 && inner.right <= outer.right + 0.5;
}

/**
 * What is wrong with the rows as drawn, one entry a fault: a line or the list
 * wider than the menu, a flag cut or squeezed, a name squeezed to nothing.
 */
function faults(): string[] {
  const found: string[] = [];
  const list = host.querySelector<HTMLElement>(".bl-ac-list")!;
  if (list.scrollWidth > list.clientWidth) {
    found.push(
      `the list scrolls sideways by ${list.scrollWidth - list.clientWidth}px`,
    );
  }
  host.querySelectorAll<HTMLElement>(".bl-ac-row").forEach((row, index) => {
    row.querySelectorAll<HTMLElement>(".bl-ac-line").forEach((line, number) => {
      const at = `row ${index}, line ${number}`;
      if (line.scrollWidth > line.clientWidth) {
        found.push(
          `${at} overflows by ${line.scrollWidth - line.clientWidth}px`,
        );
      }
      const box = line.getBoundingClientRect();
      line
        .querySelectorAll<HTMLElement>(".bl-ac-states, .bl-ac-structure")
        .forEach(flag => {
          // A flag inside the title is cut by the title, not the line.
          const frame = flag.closest(".bl-ac-title") ?? line;
          const squeezed = [
            flag,
            ...flag.querySelectorAll<HTMLElement>(
              ".bl-ac-state, .bl-ac-more-states",
            ),
          ].some(part => part.scrollWidth > part.clientWidth);
          if (
            !within(
              flag.getBoundingClientRect(),
              frame.getBoundingClientRect(),
            ) ||
            squeezed
          ) {
            found.push(`${at}: the ${flag.dataset.place} flag is cut`);
          }
          if (!within(flag.getBoundingClientRect(), box)) {
            found.push(`${at}: the ${flag.dataset.place} flag leaves the line`);
          }
        });
      const name = line.querySelector<HTMLElement>(".bl-ac-name");
      if (name !== null && name.getBoundingClientRect().width < 1) {
        found.push(`${at}: the name is squeezed to nothing`);
      }
    });
  });
  return found;
}

describe("the rows, laid out", () => {
  it.each(WIDTHS)("draws the default rows within a %ipx menu", width => {
    draw({}, width);
    expect(faults()).toEqual([]);
  });
});
