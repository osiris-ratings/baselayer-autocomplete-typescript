import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_LOOK,
  type BusinessSuggestion,
  type PersonSuggestion,
  type RelatedItem,
} from "@baselayer-sdk/autocomplete";
import {
  BusinessAutocompleteView,
  PersonAutocompleteView,
} from "@baselayer-sdk/autocomplete/react";

import "../../src/react/styles.css";

// The background emphasis lays its fill a little past the marked letters, so
// they don't touch its rounded ends. A mark at the start or the end of a
// field must keep all of it: the boxes that cut a long field short with an
// ellipsis must not cut the fill.

const look = {
  ...DEFAULT_LOOK,
  matchEmphasis: "background" as const,
  matchEmphasisColor: "#e63b7a",
};

const common = {
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
  look,
};

const item = (
  type: RelatedItem["type"],
  label: string,
  role: RelatedItem["role"],
): RelatedItem => ({
  type,
  token: `tok-${label}`,
  label,
  role,
  matched: true,
  matched_name: null,
  highlight: null,
  address: null,
  states: null,
  domicile_state: null,
});

// Matched on its name's first word, and through an officer and an address,
// which a business row marks whole.
const ROW: BusinessSuggestion = {
  type: "business",
  token: "tok-harbor",
  label: "HARBOR CONCRETE PUMPING CO., INC.",
  matched_name: null,
  match: "strong",
  domicile_state: "PA",
  states: ["PA"],
  structure: "C_CORPORATION",
  highlight: [
    { text: "HARBOR", matched: true },
    { text: " CONCRETE PUMPING CO., INC.", matched: false },
  ],
  related: {
    people: {
      count: 1,
      matched: 1,
      truncated: false,
      items: [item("person", "Priya Raman", "officer")],
    },
    addresses: {
      count: 1,
      matched: 1,
      truncated: false,
      items: [
        item("address", "2210 Pellington Hwy, Baltimore, MD 21230", "officer"),
      ],
    },
  },
};

const DANA: PersonSuggestion = {
  type: "person",
  token: "tok-dana",
  label: "Dana Whitfield",
  matched_name: null,
  match: "strong",
  highlight: [
    { text: "Dana", matched: true },
    { text: " Whitfield", matched: false },
  ],
  related: {
    businesses: {
      count: 2,
      matched: 2,
      truncated: false,
      items: [
        {
          ...item("business", "HARBOR LANE HOLDINGS LLC", "officer"),
          highlight: [
            { text: "HARBOR", matched: true },
            { text: " LANE HOLDINGS LLC", matched: false },
          ],
          states: ["PA"],
          domicile_state: "PA",
        },
        {
          ...item("business", "NORTHSHORE PUMPING, LLC", "officer"),
          matched_name: "HARBOR PUMPS",
          highlight: [
            { text: "HARBOR", matched: true },
            { text: " PUMPS", matched: false },
          ],
          states: ["OH"],
          domicile_state: "OH",
        },
      ],
    },
    addresses: { count: null, matched: null, truncated: false, items: [] },
  },
};

/**
 * A computed color as `rgb(r, g, b)`: `color-mix` comes back as
 * `color(srgb r g b)`, the same color in another spelling.
 */
function rgb(color: string): string {
  const mixed = /^color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)\)$/.exec(color);
  if (mixed === null) return color;
  const [r, g, b] = mixed.slice(1).map(c => Math.round(Number(c) * 255));
  return `rgb(${r}, ${g}, ${b})`;
}

/** How far some ancestor up to the menu cuts `mark`'s fill, at worst. */
function cut(mark: HTMLElement): number {
  const box = mark.getBoundingClientRect();
  let worst = 0;
  for (
    let node = mark.parentElement;
    node !== null && !node.classList.contains("bl-ac-menu");
    node = node.parentElement
  ) {
    const style = getComputedStyle(node);
    if (style.overflowX === "visible") continue;
    const edge = node.getBoundingClientRect();
    worst = Math.max(worst, edge.left - box.left, box.right - edge.right);
  }
  return worst;
}

function draw(
  view: "business" | "person",
  markColor: string | null = "#e63b7a",
) {
  const host = document.createElement("div");
  host.style.width = "900px";
  document.body.append(host);
  const root = createRoot(host);
  flushSync(() =>
    root.render(
      view === "business" ? (
        <BusinessAutocompleteView
          {...common}
          look={{ ...look, matchEmphasisColor: markColor }}
          id="b"
          value="harbor"
          suggestions={[ROW]}
        />
      ) : (
        <PersonAutocompleteView
          {...common}
          look={{ ...look, matchEmphasisColor: markColor }}
          id="p"
          value="dana"
          suggestions={[DANA]}
          appliedFilters={{ business: { name: "harbor" } }}
        />
      ),
    ),
  );
  const marks = [...host.querySelectorAll<HTMLElement>(".bl-ac-mark")].map(
    mark => ({
      text: mark.textContent,
      cut: cut(mark),
      color: rgb(getComputedStyle(mark).color),
      field: rgb(getComputedStyle(mark.parentElement!).color),
    }),
  );
  root.unmount();
  host.remove();
  return marks;
}

describe("a background mark at the edge of its field", () => {
  it("keeps its whole fill on a business row: the name, the officer, the address", () => {
    const marks = draw("business");
    expect(marks.map(mark => mark.text)).toEqual([
      "HARBOR",
      "2210 Pellington Hwy, Baltimore, MD 21230",
      "Priya Raman",
    ]);
    for (const mark of marks) {
      expect(mark.cut, mark.text ?? "").toBeLessThanOrEqual(0);
    }
  });

  it("keeps its whole fill on a person's head, a line's name and a line's also", () => {
    const marks = draw("person");
    expect(marks.map(mark => mark.text)).toEqual(["Dana", "HARBOR", "HARBOR"]);
    for (const mark of marks) {
      expect(mark.cut, mark.text ?? "").toBeLessThanOrEqual(0);
    }
  });
});

describe("making room for the fill", () => {
  /** Where a business row's name starts and its officer ends, as drawn. */
  function edges(matchEmphasis: "background" | "underline") {
    const host = document.createElement("div");
    host.style.width = "900px";
    document.body.append(host);
    const root = createRoot(host);
    flushSync(() =>
      root.render(
        <BusinessAutocompleteView
          {...common}
          look={{ ...look, matchEmphasis }}
          id="b"
          value="harbor"
          suggestions={[ROW]}
        />,
      ),
    );
    const name = host.querySelector(".bl-ac-name")!;
    const range = document.createRange();
    range.setStart(name.querySelector(".bl-ac-mark")!.firstChild!, 0);
    range.setEnd(name.querySelector(".bl-ac-mark")!.firstChild!, 1);
    const firstLetter = range.getBoundingClientRect().left;
    const officer = host
      .querySelector(".bl-ac-people .bl-ac-mark")!
      .getBoundingClientRect();
    root.unmount();
    host.remove();
    return { firstLetter, officerEnd: officer.right };
  }

  it("moves no letter: a name starts, and the officer ends, where they do under underline", () => {
    const background = edges("background");
    const underline = edges("underline");
    expect(
      Math.abs(background.firstLetter - underline.firstLetter),
    ).toBeLessThan(0.5);
    // A background mark's box reaches 2px past its letters; an underline's
    // is the letters.
    expect(
      Math.abs(background.officerEnd - 2 - underline.officerEnd),
    ).toBeLessThan(0.5);
  });
});

describe("a background mark's letters", () => {
  it("are white on a saturated fill of the host's, on every row and line", () => {
    for (const view of ["business", "person"] as const) {
      for (const mark of draw(view)) {
        expect(mark.color, `${view}: ${mark.text}`).toBe("rgb(255, 255, 255)");
      }
    }
  });

  it("keep their field's own color on the default marker", () => {
    for (const view of ["business", "person"] as const) {
      for (const mark of draw(view, null)) {
        expect(mark.color, `${view}: ${mark.text}`).toBe(mark.field);
      }
    }
  });
});
