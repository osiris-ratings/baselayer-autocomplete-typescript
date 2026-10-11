import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_LOOK,
  type BusinessSuggestion,
  type MatchEmphasis,
  type PeopleFilters,
  type PersonSuggestion,
  type RelatedItem,
} from "@baselayer-sdk/autocomplete";
import {
  BusinessAutocompleteView,
  PersonAutocompleteView,
} from "@baselayer-sdk/autocomplete/react";

import "../../src/react/styles.css";

// Made-up people and businesses: one, five and two states, and two roles.
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

const DANA: PersonSuggestion = {
  type: "person",
  token: "tok-dana",
  label: "Dana Whitfield",
  matched_name: null,
  match: "strong",
  highlight: [],
  related: {
    businesses: {
      count: 3,
      matched: null,
      truncated: false,
      items: [
        business("HARBOR CONCRETE SUPPLY, INC.", ["NJ"], "officer"),
        business(
          "BAYSIDE HARBOR CONCRETE, INC.",
          ["CA", "AZ", "NV", "OR", "WA"],
          "agent",
        ),
        business("NORTHSHORE PUMPING, LLC", ["OH", "PA"], "officer"),
      ],
    },
    addresses: { count: null, matched: null, truncated: false, items: [] },
  },
};

function draw(
  width: number,
  appliedFilters?: PeopleFilters,
  person: PersonSuggestion = DANA,
  matchEmphasis: MatchEmphasis = "underline",
) {
  const host = document.createElement("div");
  host.style.width = `${width}px`;
  host.style.fontFamily = "sans-serif";
  document.body.append(host);
  const root = createRoot(host);
  flushSync(() =>
    root.render(
      <PersonAutocompleteView
        id="people"
        value="dana"
        onInputChange={() => {}}
        onSelect={() => {}}
        suggestions={[person]}
        found={1}
        foundCapped={false}
        truncated={false}
        indexTag={null}
        roundTripMs={null}
        isSearching={false}
        error={null}
        open
        {...(appliedFilters !== undefined ? { appliedFilters } : {})}
        look={{ ...DEFAULT_LOOK, matchEmphasis }}
      />,
    ),
  );
  return {
    host,
    lines: [
      ...host.querySelectorAll<HTMLElement>('[data-testid="business-line"]'),
    ],
    done() {
      root.unmount();
      host.remove();
    },
  };
}

const px = (value: string) => parseFloat(value);

describe("the lines under a person", () => {
  for (const width of [560, 400] as const) {
    it(`line their state squares up down the group at ${width}px, whatever the role`, () => {
      const { lines, done } = draw(width);
      try {
        const starts = lines.map(line =>
          Math.round(
            line.querySelector(".bl-ac-states")!.getBoundingClientRect().left,
          ),
        );
        expect(new Set(starts).size).toBe(1);
      } finally {
        done();
      }
    });
  }

  it("draw the role quieter than the name", () => {
    const { lines, done } = draw(560);
    try {
      const role = getComputedStyle(lines[0]!.querySelector(".bl-ac-role")!);
      const name = getComputedStyle(
        lines[0]!.querySelector(".bl-ac-line-name")!,
      );
      expect(px(role.fontSize)).toBeLessThan(px(name.fontSize));
    } finally {
      done();
    }
  });

  it("draw a business's name a step lighter than the person's own", () => {
    const { host, lines, done } = draw(560);
    try {
      const head = getComputedStyle(
        host.querySelector(".bl-ac-group-head .bl-ac-name")!,
      );
      const name = getComputedStyle(
        lines[0]!.querySelector(".bl-ac-line-name")!,
      );
      expect(px(name.fontSize)).toBeLessThan(px(head.fontSize));
    } finally {
      done();
    }
  });
});

describe("a state a person search's business filter matched", () => {
  // The service says Bayside (CA, AZ, NV, OR, WA; domicile CA) is why Dana
  // is here, and the search named NV.
  const filtered: PersonSuggestion = structuredClone(DANA);
  filtered.related.businesses.items[1]!.matched = true;

  /** Bayside's NV square, matched or not, and its domicile's, as drawn. */
  function squaresOf(matchEmphasis: MatchEmphasis, matched: boolean) {
    const { lines, done } = draw(
      560,
      matched ? { business: { state: ["nv"] } } : undefined,
      filtered,
      matchEmphasis,
    );
    const squares = [
      ...lines[1]!.querySelectorAll<HTMLElement>(
        '[data-testid="business-suggestion-state"]',
      ),
    ];
    const nv = squares.find(square => square.textContent === "NV")!;
    const box = nv.getBoundingClientRect();
    const style = getComputedStyle(nv);
    const after = getComputedStyle(nv, "::after");
    const domicile = getComputedStyle(squares[0]!);
    const drawn = {
      order: squares.map(square => square.textContent),
      width: box.width,
      height: box.height,
      boxShadow: style.boxShadow,
      textDecorationLine: style.textDecorationLine,
      fontWeight: style.fontWeight,
      color: style.color,
      bar: after.content === "none" ? null : after.backgroundColor,
      barBottom: after.bottom,
      domicileBorder: domicile.borderTopColor,
    };
    done();
    return drawn;
  }

  const EMPHASES = ["underline", "background", "weight", "ink"] as const;

  it("moves behind the domicile, the domicile keeping its border", () => {
    const matched = squaresOf("underline", true);
    expect(matched.order).toEqual(["CA", "NV", "AZ"]);
    expect(matched.domicileBorder).toBe(
      squaresOf("underline", false).domicileBorder,
    );
  });

  for (const emphasis of EMPHASES) {
    it(`keeps its square the size of every other under ${emphasis}, and rings none`, () => {
      const matched = squaresOf(emphasis, true);
      const plain = squaresOf(emphasis, false);
      expect(matched.width).toBe(plain.width);
      expect(matched.height).toBe(plain.height);
      if (emphasis !== "background") {
        expect(matched.boxShadow).toBe("none");
      }
      expect(plain.boxShadow).toBe("none");
      expect(plain.bar).toBeNull();
    });
  }

  it("draws a line a little under the square under underline, the text left be", () => {
    const matched = squaresOf("underline", true);
    expect(matched.bar).toBe("rgb(56, 161, 105)");
    expect(parseFloat(matched.barBottom)).toBeLessThan(0);
    expect(matched.textDecorationLine).toBe("none");
  });

  it("lays the highlight over the square under background, as a border of its colour", () => {
    const matched = squaresOf("background", true);
    expect(matched.boxShadow).toContain("rgb(198, 246, 213)");
    expect(matched.bar).toBeNull();
  });

  it("sets the square's letters bolder under weight, and in the mark's ink under ink", () => {
    expect(squaresOf("weight", true).fontWeight).toBe("700");
    expect(squaresOf("weight", false).fontWeight).toBe("600");
    expect(squaresOf("ink", true).color).not.toBe(
      squaresOf("ink", false).color,
    );
  });
});

/**
 * How far past `square` its mark reaches, below (the line under it, as drawn)
 * and on every side, that some ancestor up to the menu would clip; zero or
 * less when nothing cuts it.
 */
function clipped(square: HTMLElement, around: number): number {
  // As far below the square as the line under it is drawn.
  const below = -parseFloat(getComputedStyle(square, "::after").bottom);
  const box = square.getBoundingClientRect();
  let worst = 0;
  for (
    let node = square.parentElement;
    node !== null && !node.classList.contains("bl-ac-menu");
    node = node.parentElement
  ) {
    const style = getComputedStyle(node);
    if (style.overflowX === "visible" && style.overflowY === "visible") {
      continue;
    }
    const edge = node.getBoundingClientRect();
    worst = Math.max(
      worst,
      box.bottom + below - edge.bottom,
      edge.left - (box.left - around),
      box.right + around - edge.right,
      edge.top - (box.top - around),
    );
  }
  return worst;
}

describe("a matched state's mark", () => {
  const filtered: PersonSuggestion = structuredClone(DANA);
  filtered.related.businesses.items[1]!.matched = true;

  for (const width of [560, 400, 320] as const) {
    it(`is drawn whole on a line at ${width}px, the line under it and the highlight around it`, () => {
      const { lines, done } = draw(
        width,
        { business: { state: ["nv"] } },
        filtered,
      );
      try {
        const nv = lines[1]!.querySelector<HTMLElement>(
          ".bl-ac-state[data-matched]",
        )!;
        expect(nv.textContent).toBe("NV");
        expect(clipped(nv, 2)).toBeLessThanOrEqual(0);
      } finally {
        done();
      }
    });
  }
});

describe("a matched state's mark on a business row", () => {
  const ROW: BusinessSuggestion = {
    type: "business",
    token: "tok-bayside",
    label: "BAYSIDE HARBOR CONCRETE, INC.",
    matched_name: null,
    match: "strong",
    domicile_state: "CA",
    states: ["AZ", "CA", "NV", "OR", "WA"],
    structure: "C_CORPORATION",
    highlight: [],
    related: {
      people: { count: 0, matched: null, truncated: false, items: [] },
      addresses: { count: 0, matched: null, truncated: false, items: [] },
    },
  };

  // The title shows one line and hides the rest, so a mark under a square
  // placed in it must fit within that line.
  for (const [placed, layout] of [
    ["at the end of the title line", undefined],
    [
      "in the title, as its badge",
      { titleBadge: "states", titleTrailing: null },
    ],
  ] as const) {
    for (const width of [560, 320] as const) {
      it(`is drawn whole ${placed} at ${width}px`, () => {
        const host = document.createElement("div");
        host.style.width = `${width}px`;
        document.body.append(host);
        const root = createRoot(host);
        flushSync(() =>
          root.render(
            <BusinessAutocompleteView
              id="business"
              value="bay"
              onInputChange={() => {}}
              onSelect={() => {}}
              suggestions={[ROW]}
              found={1}
              foundCapped={false}
              truncated={false}
              indexTag={null}
              roundTripMs={null}
              isSearching={false}
              error={null}
              open
              appliedFilters={{ state: ["nv"] }}
              {...(layout !== undefined ? { layout } : {})}
            />,
          ),
        );
        try {
          const nv = host.querySelector<HTMLElement>(
            ".bl-ac-state[data-matched]",
          )!;
          expect(nv.textContent).toBe("NV");
          expect(clipped(nv, 2)).toBeLessThanOrEqual(0);
        } finally {
          root.unmount();
          host.remove();
        }
      });
    }
  }
});
