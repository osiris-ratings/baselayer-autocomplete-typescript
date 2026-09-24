import { queryTokens } from "@baselayer-sdk/autocomplete";
import { describe, expect, it } from "vitest";

import { REEL, answerFor, highlightFor } from "../../site/home/reel";

const marked = (parts: { text: string; matched: boolean }[]) =>
  parts.filter(part => part.matched).map(part => part.text);

describe("the overview's typeahead reel", () => {
  it("types Harbor Concrete Pumping first, and two other made-up names", () => {
    expect(REEL.map(company => company.query)).toHaveLength(3);
    expect(REEL[0]?.query).toBe("harbor concrete pum");
  });

  it("stops every name mid-word, as someone still typing would", () => {
    for (const company of REEL) {
      const last = queryTokens(company.query).at(-1)!;
      const first = answerFor(company, company.query).rows[0]!;
      const words = queryTokens(first.label);

      expect(
        words.some(word => word.startsWith(last)),
        company.query,
      ).toBe(true);
      expect(words, company.query).not.toContain(last);
    }
  });

  it("asks for nothing under three characters", () => {
    for (const company of REEL) {
      expect(answerFor(company, company.query.slice(0, 2)).rows).toEqual([]);
    }
  });

  it("answers five rows at most, the ones matching every word first", () => {
    const harbor = REEL[0]!;
    const { rows } = answerFor(harbor, harbor.query);

    expect(rows.length).toBeLessThanOrEqual(5);
    expect(rows[0]?.label).toBe("HARBOR CONCRETE PUMPING CO., INC.");
    const matchesAll = rows.map(row =>
      queryTokens(row.matched_name ?? row.label).some(word =>
        word.startsWith("pum"),
      ),
    );
    // Every row matching the whole query comes before any that does not.
    expect(matchesAll.indexOf(false)).toBeGreaterThan(
      matchesAll.lastIndexOf(true),
    );
  });

  it("finds fewer the more is typed, ending at the name's own count", () => {
    for (const company of REEL) {
      const counts = [];
      for (let n = 3; n <= company.query.length; n++) {
        counts.push(answerFor(company, company.query.slice(0, n)).found);
      }
      for (let i = 1; i < counts.length; i++) {
        expect(counts[i], company.query).toBeLessThanOrEqual(counts[i - 1]!);
      }
      expect(counts.at(-1)).toBe(company.found);
    }
  });

  it("marks the whole words a typed stem begins, and the space between two", () => {
    expect(
      marked(highlightFor("HARBOR CONCRETE PUMPING CO., INC.", "harbor concr")),
    ).toEqual(["HARBOR CONCRETE"]);
    expect(
      marked(highlightFor("HARBOR VIEW CONCRETE, INC.", "harbor concr")),
    ).toEqual(["HARBOR", "CONCRETE"]);
  });
});
