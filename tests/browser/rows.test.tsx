import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  DEFAULT_ROW_LAYOUT,
  ROW_FIELDS,
  ROW_PLACES,
  drawnRowLayout,
  resolveRowLayout,
  type BusinessSuggestion,
  type RelatedItem,
  type RowLayout,
  type RowLayoutInput,
} from "@baselayer-sdk/autocomplete";
import { BusinessAutocompleteView } from "@baselayer-sdk/autocomplete/react";

import "../../src/react/styles.css";

/** The menu widths the rows must hold at: a wide form, a narrow one, a phone. */
const WIDTHS = [560, 400, 320] as const;

/**
 * How wide the name stays, whatever else its line holds: 4em on a wide menu,
 * 1.5em on a narrow one, and on a phone never nothing.
 */
const NAME_KEEPS: Record<(typeof WIDTHS)[number], number> = {
  560: 64,
  400: 24,
  320: 1,
};

/** Every layout a row can draw: each one a host could stage, as drawn, once. */
const DRAWN_LAYOUTS: RowLayout[] = (() => {
  const values = [undefined, null, ...ROW_FIELDS];
  let stagings: RowLayoutInput[] = [{}];
  for (const place of ROW_PLACES) {
    stagings = stagings.flatMap(staged =>
      values.map(value => ({ ...staged, [place]: value })),
    );
  }
  const drawn = new Map<string, RowLayout>();
  for (const staged of stagings) {
    const layout = drawnRowLayout(resolveRowLayout(staged));
    drawn.set(JSON.stringify(layout), layout);
  }
  return [...drawn.values()];
})();

/** The places a layout sets otherwise than the default, to name it by. */
function changes(layout: RowLayout): Partial<RowLayout> {
  return Object.fromEntries(
    ROW_PLACES.filter(place => layout[place] !== DEFAULT_ROW_LAYOUT[place]).map(
      place => [place, layout[place]],
    ),
  );
}

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
// rows that lack a field: no structure, no people, no address. The last was
// reached by a person filter and an address filter, with long answers, so what
// matched is long too.
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
  row({
    label: "CINDER MARINE SALVAGE AND TOWING, LLC",
    structure: "LLC",
    states: ["CA", "DE", "FL", "IL", "NY", "TX", "WA"],
    related: {
      people: {
        ...related("person", [
          {
            token: null,
            label: "Marguerite Okonkwo-Lindqvist",
            role: "officer",
            matched: true,
          },
          { token: null, label: "Ada Fox", role: "officer", matched: true },
          {
            token: null,
            label: "Wesley Crane",
            role: "officer",
            matched: false,
          },
        ]),
        matched: 4,
      },
      addresses: {
        ...related("address", [
          {
            token: "tok-a5",
            label: "4120 Orchard Lane Suite 1400, Springfield, MO 65806",
            role: "officer",
            matched: true,
          },
        ]),
        matched: 1,
      },
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
  // A menu the viewport caps would be measured at the wrong width.
  expect(window.innerWidth).toBeGreaterThan(width + 32);
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
        // A state filter reached every row: the states it named lead theirs.
        appliedFilters={{ state: ["IL", "TX", "ID"] }}
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
function faults(nameKeeps = 1): string[] {
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
      // A name shorter than what it keeps is simply its own width.
      const name = line.querySelector<HTMLElement>(".bl-ac-name");
      if (
        name !== null &&
        name.getBoundingClientRect().width <
          Math.min(nameKeeps, name.scrollWidth)
      ) {
        found.push(
          `${at}: the name is squeezed to ${Math.round(name.getBoundingClientRect().width)}px`,
        );
      }
    });
  });
  return found;
}

/** The box of the first element under `selector` in row `index`. */
function boxOf(index: number, selector: string): DOMRect {
  const row = host.querySelectorAll(".bl-ac-row")[index]!;
  return row.querySelector(selector)!.getBoundingClientRect();
}

function ellipsised(index: number, selector: string): boolean {
  const row = host.querySelectorAll(".bl-ac-row")[index]!;
  const element = row.querySelector<HTMLElement>(selector)!;
  return element.scrollWidth > element.clientWidth;
}

describe("the rows, laid out", () => {
  it.each(WIDTHS)("draws the default rows within a %ipx menu", width => {
    draw({}, width);
    expect(faults(NAME_KEEPS[width])).toEqual([]);
  });

  it.each(WIDTHS)(
    "draws every layout a row can draw within a %ipx menu",
    width => {
      const wrong: string[] = [];
      for (const layout of DRAWN_LAYOUTS) {
        draw(layout, width);
        for (const fault of faults(NAME_KEEPS[width])) {
          wrong.push(`${JSON.stringify(changes(layout))}: ${fault}`);
        }
      }
      expect(wrong.slice(0, 8)).toEqual([]);
      expect(DRAWN_LAYOUTS).toHaveLength(541);
    },
  );

  it("moves the states a filter matched ahead of the overflow, marked, whatever the width", () => {
    for (const width of WIDTHS) {
      draw({}, width);
      const squares = [
        ...host
          .querySelectorAll(".bl-ac-row")[4]!
          .querySelectorAll<HTMLElement>(".bl-ac-state"),
      ];
      // The domicile, then the two states the filter named that it has.
      expect(squares.map(square => square.textContent)).toEqual([
        "DE",
        "IL",
        "TX",
      ]);
      expect(squares.map(square => square.dataset.matched)).toEqual([
        undefined,
        "true",
        "true",
      ]);
    }
  });

  it("pins the name's badge to the end of the name", () => {
    draw({}, 560);
    for (const index of [0, 2, 3]) {
      const gap =
        boxOf(index, ".bl-ac-structure").left -
        boxOf(index, ".bl-ac-name").right;
      expect(gap, `row ${index}`).toBeGreaterThan(7);
      expect(gap, `row ${index}`).toBeLessThan(9);
    }
  });

  it("keeps the text at the right whole while the lead's text can give way", () => {
    draw({}, 320);
    expect(ellipsised(0, ".bl-ac-address")).toBe(true);
    expect(ellipsised(0, ".bl-ac-people")).toBe(false);
  });

  it("leaves the second line's lead about 5rem beside a long name at the right", () => {
    draw({}, 320);
    expect(ellipsised(1, ".bl-ac-people")).toBe(true);
    expect(boxOf(1, ".bl-ac-address").width).toBeGreaterThanOrEqual(80);
  });

  it("shares the second line in proportion when its lead pins a flag beside its text", () => {
    for (const width of [560, 400] as const) {
      draw({ subtitle: "structure", subtitleBadge: "address" }, width);
      // The first row has a structure, so its flag leads the line.
      expect(boxOf(0, ".bl-ac-address").width).toBeGreaterThanOrEqual(64);
      expect(boxOf(0, ".bl-ac-people").width).toBeGreaterThanOrEqual(64);
    }
  });

  it("keeps text at the right of the first line to half of it", () => {
    for (const width of WIDTHS) {
      draw({ titleTrailing: "address", subtitle: "states" }, width);
      const line = boxOf(0, ".bl-ac-line-title");
      expect(boxOf(0, ".bl-ac-address").width).toBeLessThanOrEqual(
        line.width / 2 + 0.5,
      );
    }
  });
});
