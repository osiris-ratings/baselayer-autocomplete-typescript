import { partsFor } from "@baselayer/autocomplete";
import { queryTokens } from "@baselayer/autocomplete";
import { describe, expect, it } from "vitest";

import { SAMPLE_QUERY, SAMPLE_SUGGESTIONS } from "../../site/demo/sample";

const tokens = queryTokens(SAMPLE_QUERY);

/** The name the row's highlight parts spell. */
function highlighted(row: (typeof SAMPLE_SUGGESTIONS)[number]): string {
  return row.matched_name ?? row.label;
}

function marked(parts: { text: string; matched: boolean }[] | null): string[] {
  return (parts ?? []).filter(part => part.matched).map(part => part.text);
}

describe("the Styling preview's sample rows", () => {
  it("pretends one word was typed out and the next only begun", () => {
    expect(tokens).toEqual(["harbor", "concr"]);
  });

  it("spells each row's matched name with its highlight parts", () => {
    for (const row of SAMPLE_SUGGESTIONS) {
      expect(row.highlight.map(part => part.text).join("")).toBe(
        highlighted(row),
      );
    }
  });

  it("highlights whole the words the query starts, and nothing else", () => {
    const [first] = SAMPLE_SUGGESTIONS;
    expect(marked(first!.highlight)).toEqual(["HARBOR", "CONCRETE"]);
    const view = SAMPLE_SUGGESTIONS.find(row =>
      row.label.startsWith("HARBOR VIEW"),
    );
    // The comma is not part of the word.
    expect(marked(view!.highlight)).toEqual(["HARBOR", "CONCRETE"]);
  });

  it("shows the two regions apart: the typed characters cut the half-typed word", () => {
    const [first] = SAMPLE_SUGGESTIONS;
    const name = highlighted(first!);
    expect(marked(partsFor(name, first!.highlight, "token", tokens))).toEqual([
      "HARBOR",
      "CONCRETE",
    ]);
    expect(
      marked(partsFor(name, first!.highlight, "substring", tokens)),
    ).toEqual(["HARBOR CONCR"]);
  });
});
