import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
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

// Made-up businesses and addresses, each line in a role.
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

const address = (label: string, role: RelatedItem["role"]): RelatedItem => ({
  type: "address",
  token: `tok-${label}`,
  label,
  role,
  matched: false,
  address: null,
  states: null,
  domicile_state: null,
});

const set = (items: RelatedItem[]) => ({
  count: items.length,
  matched: null,
  truncated: false,
  items,
});

const none = { count: null, matched: null, truncated: false, items: [] };

/** A person whose businesses hold them as an officer or an agent. */
function person(addresses: RelatedItem[] = []): PersonSuggestion {
  return {
    type: "person",
    token: "tok-dana",
    label: "Dana Whitfield",
    matched_name: null,
    match: "strong",
    highlight: [],
    related: {
      businesses: set([
        business("HARBOR CONCRETE SUPPLY, INC.", ["NJ"], "officer"),
        business("BAYSIDE HARBOR CONCRETE, INC.", ["CA", "AZ", "NV"], "agent"),
        business("NORTHSHORE PUMPING, LLC", ["OH", "PA"], "officer"),
      ]),
      addresses: addresses.length === 0 ? none : set(addresses),
    },
  };
}

/** An address its businesses hold in `roles`, one business each. */
function place(roles: RelatedItem["role"][]): AddressSuggestion {
  return {
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
      businesses: set(
        roles.map((role, at) =>
          business(`QUILLBACK HOLDINGS ${at + 1}, LLC`, ["OR", "WA"], role),
        ),
      ),
      people: none,
    },
  };
}

const COMMON = {
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

type Answer =
  | {
      route: "people";
      suggestion: PersonSuggestion;
      list?: ("businesses" | "addresses")[];
    }
  | { route: "addresses"; suggestion: AddressSuggestion };

function draw(width: number, answer: Answer, open = true) {
  const host = document.createElement("div");
  host.style.width = `${width}px`;
  host.style.fontFamily = "sans-serif";
  document.body.append(host);
  const root = createRoot(host);
  const render = (next: Answer, value: string, isOpen = open) =>
    flushSync(() =>
      root.render(
        next.route === "people" ? (
          <PersonAutocompleteView
            id="people"
            value={value}
            suggestions={[next.suggestion]}
            list={next.list}
            {...COMMON}
            open={isOpen}
          />
        ) : (
          <AddressAutocompleteView
            id="addresses"
            value={value}
            suggestions={[next.suggestion]}
            {...COMMON}
            open={isOpen}
          />
        ),
      ),
    );
  render(answer, "x");
  return {
    host,
    render,
    /** Each line drawing a role at its right, in the menu's order. */
    lines: () =>
      [...host.querySelectorAll<HTMLElement>(".bl-ac-group-line")].filter(
        line => line.querySelector(".bl-ac-group-trailing > .bl-ac-role"),
      ),
    done() {
      root.unmount();
      host.remove();
    },
  };
}

const roleOf = (line: Element) =>
  line.querySelector<HTMLElement>(".bl-ac-group-trailing > .bl-ac-role")!;

/** Where a role's words are drawn, not its column's box. */
function words(role: Element): DOMRect {
  const range = document.createRange();
  range.selectNodeContents(role);
  return range.getBoundingClientRect();
}

/** The gap between a line's segments. */
const gapOf = (line: Element) => parseFloat(getComputedStyle(line).columnGap);

/** The column: one left edge down the menu, as wide as its longest words. */
function column(lines: HTMLElement[]) {
  const roles = lines.map(roleOf);
  const lefts = roles.map(role => role.getBoundingClientRect().left);
  const widest = Math.max(...roles.map(role => words(role).width));
  return {
    left: lefts[0]!,
    spread: Math.max(...lefts) - Math.min(...lefts),
    width: roles[0]!.getBoundingClientRect().width,
    widest,
    texts: roles.map(role => role.textContent),
  };
}

describe("the role column on a person's or an address's lines", () => {
  for (const width of [560, 400]) {
    it(`fits an officer and an agent, the squares one gap before the longest, on a person search at ${width}px`, () => {
      const { lines, done } = draw(width, {
        route: "people",
        suggestion: person(),
      });
      try {
        const drawn = lines();
        expect(column(drawn).texts).toEqual(["officer", "agent", "officer"]);
        const { spread, widest, width: wide } = column(drawn);
        expect(spread).toBeLessThanOrEqual(0.5);
        expect(wide).toBeLessThanOrEqual(Math.ceil(widest) + 0.5);
        const longest = drawn.find(
          line => roleOf(line).textContent === "officer",
        )!;
        const last = longest.querySelector(".bl-ac-states")!.lastElementChild!;
        expect(
          words(roleOf(longest)).left - last.getBoundingClientRect().right,
        ).toBeCloseTo(gapOf(longest), 0);
      } finally {
        done();
      }
    });

    it(`is never wider than the widest person's role shown on a person search, its addresses' lines included, at ${width}px`, () => {
      const { lines, done } = draw(width, {
        route: "people",
        suggestion: person([
          address("12 FERNHOLLOW CT, ASHGROVE, OH 43011", "mailing"),
        ]),
        list: ["businesses", "addresses"],
      });
      try {
        const drawn = lines();
        const { texts, widest, width: wide, spread } = column(drawn);
        // A person's roles, never how a business holds an address.
        expect(texts).not.toContain("principal office");
        expect(texts).not.toContain("mailing address");
        expect(texts).toContain("mailing");
        expect(spread).toBeLessThanOrEqual(0.5);
        expect(wide).toBeLessThanOrEqual(Math.ceil(widest) + 0.5);
      } finally {
        done();
      }
    });

    it(`widens to fit a principal office an address search shows, every role starting at one x, at ${width}px`, () => {
      const { lines, done } = draw(width, {
        route: "addresses",
        suggestion: place(["agent", "principal", "agent"]),
      });
      try {
        const drawn = lines();
        const { texts, widest, width: wide, spread } = column(drawn);
        expect(texts).toEqual(["agent", "principal office", "agent"]);
        expect(spread).toBeLessThanOrEqual(0.5);
        expect(wide).toBeGreaterThanOrEqual(widest - 0.5);
        expect(wide).toBeLessThanOrEqual(Math.ceil(widest) + 0.5);
        const longest = drawn[1]!;
        const last = longest.querySelector(".bl-ac-states")!.lastElementChild!;
        expect(
          words(roleOf(longest)).left - last.getBoundingClientRect().right,
        ).toBeCloseTo(gapOf(longest), 0);
      } finally {
        done();
      }
    });
  }

  it("draws the column as wide as its longest role's characters until it is measured, as a server renders it", () => {
    const host = document.createElement("div");
    host.style.width = "560px";
    host.style.fontFamily = "sans-serif";
    host.innerHTML = renderToStaticMarkup(
      <AddressAutocompleteView
        id="addresses"
        value="x"
        suggestions={[place(["agent", "principal", "agent"])]}
        {...COMMON}
      />,
    );
    document.body.append(host);
    try {
      const drawn = [
        ...host.querySelectorAll<HTMLElement>(
          ".bl-ac-group-trailing > .bl-ac-role",
        ),
      ];
      expect(drawn.map(role => role.textContent)).toEqual([
        "agent",
        "principal office",
        "agent",
      ]);
      // Sixteen characters, "principal office", in the roles' own font.
      const probe = document.createElement("span");
      probe.style.cssText = "display: inline-block; width: 16ch";
      drawn[0]!.append(probe);
      const chars = probe.getBoundingClientRect().width;
      probe.remove();
      for (const role of drawn) {
        expect(parseFloat(getComputedStyle(role).minWidth)).toBeCloseTo(
          chars,
          1,
        );
      }
      const lefts = drawn.map(role => role.getBoundingClientRect().left);
      expect(Math.max(...lefts) - Math.min(...lefts)).toBeLessThanOrEqual(0.5);
    } finally {
      host.remove();
    }
  });

  it("fits the roles when a menu closed as its answer came is opened on that answer", () => {
    const answer: Answer = {
      route: "addresses",
      suggestion: place(["agent", "principal", "agent"]),
    };
    const { render, lines, done } = draw(560, answer, false);
    try {
      render(answer, "x", true);
      const { spread, width, widest } = column(lines());
      expect(spread).toBeLessThanOrEqual(0.5);
      expect(
        Math.abs(width - widest),
        `${width} for ${widest}`,
      ).toBeLessThanOrEqual(0.5);
    } finally {
      done();
    }
  });

  it("fits the roles again when the page's font changes under one answer", () => {
    const answer: Answer = {
      route: "addresses",
      suggestion: place(["agent", "principal", "agent"]),
    };
    const { host, render, lines, done } = draw(560, answer);
    try {
      host.style.fontFamily = "Arial";
      render(answer, "xy");
      host.style.fontFamily = "'Courier New'";
      render(answer, "xyz");
      const { spread, width, widest } = column(lines());
      expect(spread).toBeLessThanOrEqual(0.5);
      expect(
        Math.abs(width - widest),
        `${width} for ${widest}`,
      ).toBeLessThanOrEqual(0.5);
    } finally {
      done();
    }
  });

  it("fits the roles under a zoomed ancestor, as wide as their words are drawn", () => {
    const answer: Answer = {
      route: "addresses",
      suggestion: place(["principal", "agent"]),
    };
    const { host, render, lines, done } = draw(560, answer);
    try {
      host.style.zoom = "2";
      render(answer, "xy");
      render(
        { route: "addresses", suggestion: place(["agent", "principal"]) },
        "xy",
      );
      const { width, widest } = column(lines());
      expect(
        Math.abs(width - widest),
        `${width} for ${widest}`,
      ).toBeLessThanOrEqual(0.5);
    } finally {
      done();
    }
  });

  it("holds still while the text changes over one answer, and fits the next answer once it comes", () => {
    const answer: Answer = {
      route: "addresses",
      suggestion: place(["agent", "principal"]),
    };
    const { render, lines, done } = draw(560, answer);
    try {
      const wide = column(lines()).left;
      render(answer, "xy");
      render(answer, "xyz");
      expect(column(lines()).left).toBe(wide);
      render(
        { route: "addresses", suggestion: place(["agent", "agent"]) },
        "xyz",
      );
      const narrow = column(lines());
      expect(narrow.left).toBeGreaterThan(wide);
      expect(narrow.width).toBeLessThanOrEqual(Math.ceil(narrow.widest) + 0.5);
    } finally {
      done();
    }
  });
});
