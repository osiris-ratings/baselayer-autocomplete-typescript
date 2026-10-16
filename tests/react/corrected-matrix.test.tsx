import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_LOOK,
  type BusinessSuggestion,
  type HighlightPart,
} from "@baselayer-sdk/autocomplete";
import { BusinessAutocompleteView } from "../../src/react";

import {
  CORRECTED_CASES,
  LABEL,
  type CorrectedCase,
} from "../core/support/corrected-cases";

// Every emphasis by both granularities, for each way a word can be mistyped
// (substitution, deletion, swap, an extra letter, a prefix, two words, a
// deletion then a prefix, and typed right). The view draws what the parts say:
// the underline and background emphases give a corrected letter a mark of its
// own, weight and ink draw it as an ordinary match, and plain marks nothing.

afterEach(cleanup);

type Emphasis = "underline" | "background" | "weight" | "ink" | "plain";
const REGIONS = [
  ["token", "whole words"],
  ["substring", "typed characters"],
] as const;

function rowOf(entry: CorrectedCase): BusinessSuggestion {
  return {
    type: "business",
    token: "tok-harbor",
    label: LABEL,
    matched_name: null,
    match: "strong",
    domicile_state: "PA",
    states: ["PA"],
    structure: "C_CORPORATION",
    highlight: entry.sent,
    related: {
      people: { count: null, matched: null, truncated: false, items: [] },
      addresses: { count: null, matched: null, truncated: false, items: [] },
    },
  };
}

function draw(
  entry: CorrectedCase,
  emphasis: Emphasis,
  region: "token" | "substring",
) {
  render(
    <BusinessAutocompleteView
      id="b"
      value={entry.typed}
      onInputChange={vi.fn()}
      onSelect={vi.fn()}
      suggestions={[rowOf(entry)]}
      found={1}
      foundCapped={false}
      truncated={false}
      indexTag={null}
      roundTripMs={null}
      isSearching={false}
      error={null}
      open
      look={{
        ...DEFAULT_LOOK,
        matchEmphasis: emphasis,
        matchEmphasisRegion: region,
      }}
    />,
  );
  const name = screen.getByTestId("business-suggestion-name");
  const texts = (selector: string) =>
    [...name.querySelectorAll(selector)].map(node => node.textContent);
  return {
    name,
    marks: texts('[data-testid="business-suggestion-match"]'),
    corrected: texts("[data-corrected]"),
  };
}

const matchedTexts = (parts: HighlightPart[]) =>
  parts.filter(part => part.matched).map(part => part.text);
const correctedTexts = (parts: HighlightPart[]) =>
  parts.filter(part => part.corrected === true).map(part => part.text);

describe.each(REGIONS)("the %s region (%s)", region => {
  describe.each(CORRECTED_CASES)("$typed ($kind)", entry => {
    const drawn = entry[region];

    it.each(["underline", "background"] as const)(
      "%s: the corrected letters are marks of their own, the typed ones matches",
      emphasis => {
        const { name, marks, corrected } = draw(entry, emphasis, region);

        expect(name).toHaveTextContent(LABEL);
        expect(marks).toEqual(matchedTexts(drawn.mark));
        expect(corrected).toEqual(correctedTexts(drawn.mark));
      },
    );

    it.each(["weight", "ink"] as const)(
      "%s: nothing marks a fuzzy match, so a corrected letter is drawn as a match",
      emphasis => {
        const { name, marks, corrected } = draw(entry, emphasis, region);

        expect(name).toHaveTextContent(LABEL);
        expect(marks).toEqual(matchedTexts(drawn.match));
        expect(corrected).toEqual([]);
      },
    );

    it("plain: marks nothing at all", () => {
      const { name, marks, corrected } = draw(entry, "plain", region);

      expect(name).toHaveTextContent(LABEL);
      expect(marks).toEqual([]);
      expect(corrected).toEqual([]);
    });
  });
});
