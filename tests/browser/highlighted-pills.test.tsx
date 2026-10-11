import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import type {
  BusinessSuggestion,
  PersonSuggestion,
  RelatedItem,
} from "@baselayer-sdk/autocomplete";
import {
  BusinessAutocompleteView,
  PersonAutocompleteView,
} from "@baselayer-sdk/autocomplete/react";

import "../../src/react/styles.css";

// Made-up businesses: a corporation in five states, so its row draws the
// structure's flag and a +2.
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

const business: RelatedItem = {
  type: "business",
  token: "tok-bayside",
  label: "BAYSIDE HARBOR CONCRETE, INC.",
  role: "officer",
  matched: false,
  address: "1200 Tallowmere Rd, Pittsburgh, PA 15212",
  states: ["AZ", "CA", "NV", "OR", "WA"],
  domicile_state: "CA",
};

const DANA: PersonSuggestion = {
  type: "person",
  token: "tok-dana",
  label: "Dana Whitfield",
  matched_name: null,
  match: "strong",
  highlight: [],
  related: {
    businesses: {
      count: 1,
      matched: null,
      truncated: false,
      items: [business],
    },
    addresses: { count: null, matched: null, truncated: false, items: [] },
  },
};

const common = {
  value: "bay",
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
};

/** A pill's edge and box, on its row as drawn and on it highlighted. */
function edges(view: "business" | "person", selector: string) {
  const host = document.createElement("div");
  host.style.width = "560px";
  document.body.append(host);
  const root = createRoot(host);
  flushSync(() =>
    root.render(
      view === "business" ? (
        <BusinessAutocompleteView {...common} id="b" suggestions={[ROW]} />
      ) : (
        <PersonAutocompleteView {...common} id="p" suggestions={[DANA]} />
      ),
    ),
  );
  const row = host.querySelector<HTMLElement>(
    view === "business" ? ".bl-ac-row" : ".bl-ac-group-line",
  )!;
  const pill = row.querySelector<HTMLElement>(selector)!;
  const read = () => {
    const style = getComputedStyle(pill);
    const box = pill.getBoundingClientRect();
    return {
      border: style.borderTopColor,
      shadow: style.boxShadow,
      width: box.width,
      height: box.height,
      ground: getComputedStyle(row).backgroundColor,
    };
  };
  const plain = read();
  row.setAttribute("data-highlighted", "true");
  const highlighted = read();
  root.unmount();
  host.remove();
  return { plain, highlighted };
}

const TRANSPARENT = "rgba(0, 0, 0, 0)";

describe("a pill on a highlighted row", () => {
  it("edges the structure's flag, which the highlight would hide, and keeps its size", () => {
    const { plain, highlighted } = edges("business", ".bl-ac-structure");
    // The highlight is the flag's own fill, so without an edge it vanishes.
    expect(highlighted.ground).not.toBe(TRANSPARENT);
    expect(plain.border).toBe(TRANSPARENT);
    expect(highlighted.border).not.toBe(TRANSPARENT);
    expect(highlighted.border).not.toBe(highlighted.ground);
    expect([highlighted.width, highlighted.height]).toEqual([
      plain.width,
      plain.height,
    ]);
  });

  for (const view of ["business", "person"] as const) {
    it(`edges the +N on a highlighted ${view === "business" ? "row" : "line"}, and keeps its size`, () => {
      const { plain, highlighted } = edges(view, ".bl-ac-more-states");
      expect(plain.shadow).toBe("none");
      expect(highlighted.shadow).toMatch(/inset/);
      expect([highlighted.width, highlighted.height]).toEqual([
        plain.width,
        plain.height,
      ]);
    });
  }
});
