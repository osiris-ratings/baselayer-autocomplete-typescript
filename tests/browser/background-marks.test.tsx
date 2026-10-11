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

  /**
   * Where the letters of `field` on a person's first business line start and
   * end, drawn under `matchEmphasis`.
   */
  function letters(
    field: string,
    matchEmphasis: "background" | "underline",
    business: Partial<RelatedItem>,
    { width = 560, layout = {} }: { width?: number; layout?: object } = {},
  ) {
    const host = document.createElement("div");
    host.style.width = `${width}px`;
    document.body.append(host);
    const root = createRoot(host);
    flushSync(() =>
      root.render(
        <PersonAutocompleteView
          {...common}
          look={{ ...look, matchEmphasis }}
          id="p"
          value="dana"
          suggestions={[
            {
              ...DANA,
              related: {
                ...DANA.related,
                businesses: {
                  ...DANA.related.businesses,
                  items: [
                    { ...DANA.related.businesses.items[0]!, ...business },
                  ],
                },
              },
            },
          ]}
          layout={layout}
        />,
      ),
    );
    const drawn = host
      .querySelector("[data-testid='business-line']")!
      .querySelector(field)!;
    const box = drawn.getBoundingClientRect();
    const style = getComputedStyle(drawn);
    const line = drawn.closest(".bl-ac-group-line")!;
    const lineStyle = getComputedStyle(line);
    const drawnLetters = {
      left: box.left + parseFloat(style.paddingLeft),
      right: box.right - parseFloat(style.paddingRight),
      overflows: drawn.scrollWidth > drawn.clientWidth,
      lineWidth:
        line.clientWidth -
        parseFloat(lineStyle.paddingLeft) -
        parseFloat(lineStyle.paddingRight),
    };
    root.unmount();
    host.remove();
    return drawnLetters;
  }

  function expectSame(
    background: ReturnType<typeof letters>,
    underline: ReturnType<typeof letters>,
  ) {
    expect(Math.abs(background.left - underline.left)).toBeLessThan(0.5);
    expect(Math.abs(background.right - underline.right)).toBeLessThan(0.5);
  }

  describe("a field first in a line's trailing corner", () => {
    // The address, moved from the lead to the trailing corner, before the role.
    const layout = {
      businessBadge: null,
      businessTrailingBadge: "address",
      businessTrailing: "role",
    };
    const business = { address: "2210 Pellington Hwy, Baltimore, MD 21230" };

    it("sits where it does under underline, with room to spare", () => {
      const background = letters(".bl-ac-address", "background", business, {
        width: 900,
        layout,
      });
      expect(background.overflows).toBe(false);
      expectSame(
        background,
        letters(".bl-ac-address", "underline", business, {
          width: 900,
          layout,
        }),
      );
    });

    it("sits where it does under underline on a full line, cut short", () => {
      const background = letters(".bl-ac-address", "background", business, {
        width: 400,
        layout,
      });
      expect(background.overflows).toBe(true);
      expectSame(
        background,
        letters(".bl-ac-address", "underline", business, {
          width: 400,
          layout,
        }),
      );
    });
  });

  describe("a line's name at its cap, 60% of the line", () => {
    // Long enough to reach the cap.
    const label =
      "HARBOR LANE HOLDINGS AND CONCRETE PUMPING OF WESTERN PENNSYLVANIA LLC";
    const business = {
      label,
      highlight: [
        { text: "HARBOR", matched: true },
        { text: label.slice("HARBOR".length), matched: false },
      ],
    };

    function expectRoomAsUnderline() {
      const background = letters(".bl-ac-line-name", "background", business, {
        width: 900,
      });
      const underline = letters(".bl-ac-line-name", "underline", business, {
        width: 900,
      });
      expect(background.overflows).toBe(true);
      expect(underline.right - underline.left).toBeCloseTo(
        underline.lineWidth * 0.6,
        0,
      );
      expectSame(background, underline);
    }

    it("has as much room for its letters as under underline", () => {
      expectRoomAsUnderline();
    });

    it("has as much room on a page that sizes every box by its border, as many resets do", () => {
      const reset = document.createElement("style");
      reset.textContent = "*, *::before, *::after { box-sizing: border-box; }";
      document.head.append(reset);
      try {
        expectRoomAsUnderline();
      } finally {
        reset.remove();
      }
    });
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
