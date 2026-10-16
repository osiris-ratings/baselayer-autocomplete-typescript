import { describe, expect, it } from "vitest";

import {
  parseBusinessesResponse,
  partsFor,
  queryTokens,
  type HighlightPart,
} from "@baselayer-sdk/autocomplete";

import golden from "./fixtures/typo-highlights.json";
import { CORRECTED_CASES, LABEL, c, m, p } from "./support/corrected-cases";

// The parts the autocomplete service serializes for one name typed nine ways,
// and what the components draw of them: the whole word the service marked
// (`token`), or the letters typed (`substring`); and a corrected letter either
// as its own mark (the underline and background emphases) or as an ordinary
// match (weight and ink, which mark nothing for a fuzzy match). The expected
// parts are worked out by hand from the letters.

const REST = " CONCRETE PUMPING CO., INC.";

const sent = (typed: string): HighlightPart[] =>
  golden.cases.find(entry => entry.typed === typed)!
    .highlight as HighlightPart[];

const draw = (
  typed: string,
  region: "token" | "substring",
  correctedAs?: "mark" | "match",
) =>
  partsFor(
    LABEL,
    sent(typed),
    region,
    queryTokens(typed),
    ...(correctedAs !== undefined ? [correctedAs] : []),
  );

describe("the service's answers, as sent", () => {
  it.each(golden.cases)("$typed ($kind) spells the name", entry => {
    expect(entry.highlight.map(part => part.text).join("")).toBe(LABEL);
    // A corrected part is never a matched one.
    for (const part of entry.highlight) {
      expect("corrected" in part && part.matched).toBe(false);
    }
  });

  it.each(golden.cases)("$typed is read by the parser as it is", entry => {
    const body = {
      found: 1,
      found_capped: false,
      query: entry.typed,
      sources: { addresses: { status: "ok" }, people: { status: "ok" } },
      suggestions: [
        {
          type: "business",
          token: "<sealed token>",
          label: LABEL,
          matched_name: null,
          match: "strong",
          domicile_state: "PA",
          states: ["PA"],
          structure: "C_CORPORATION",
          highlight: entry.highlight,
          related: {
            people: { count: null, matched: null, truncated: false, items: [] },
            addresses: {
              count: null,
              matched: null,
              truncated: false,
              items: [],
            },
          },
        },
      ],
      truncated: false,
    };

    expect(parseBusinessesResponse(body).suggestions[0]?.highlight).toEqual(
      entry.highlight,
    );
  });
});

describe("whole words (the token region)", () => {
  it.each(CORRECTED_CASES)(
    "$typed ($kind): a corrected letter is its own mark, inside the word's",
    ({ typed, token }) => {
      expect(draw(typed, "token")).toBe(sent(typed));
      expect(draw(typed, "token", "mark")).toEqual(token.mark);
    },
  );

  it.each(CORRECTED_CASES)(
    "$typed ($kind): weight and ink draw the whole word as an ordinary match",
    ({ typed, token }) => {
      expect(draw(typed, "token", "match")).toEqual(token.match);
    },
  );
});

describe("typed characters (the substring region)", () => {
  it.each(CORRECTED_CASES)(
    "$typed ($kind): a corrected letter is its own mark",
    ({ typed, substring }) => {
      expect(draw(typed, "substring")).toEqual(substring.mark);
      expect(draw(typed, "substring", "mark")).toEqual(substring.mark);
    },
  );

  it.each(CORRECTED_CASES)(
    "$typed ($kind): weight and ink cover the letters typed as an ordinary match",
    ({ typed, substring }) => {
      expect(draw(typed, "substring", "match")).toEqual(substring.match);
    },
  );

  it("draws a corrected word as the same word typed right is drawn, under weight and ink", () => {
    // `harbur` and `harbor` cover the same six letters, so the corrected one
    // must not look any different from the exact one.
    expect(draw("harbur", "substring", "match")).toEqual(
      draw("harbor", "substring", "match"),
    );
    expect(draw("harbr", "substring", "match")).toEqual(
      draw("harbor", "substring", "match"),
    );
  });
});

describe("a corrected letter at the end of a word, before the next word", () => {
  // `harbro concrete`: the swap ends the first word, and the space and the
  // second word follow. As the service sends it the space stays in the matched
  // part after the corrected letters; a variant that sent it apart is read the
  // same. Either way the two words are one run, as the same words typed right.
  const TAIL = " PUMPING CO., INC.";
  const sent = [m("HARB"), c("OR"), m(" CONCRETE"), p(TAIL)];
  const apart = [m("HARB"), c("OR"), p(" "), m("CONCRETE"), p(TAIL)];
  const tokens = queryTokens("harbro concrete");
  const right = queryTokens("harbor concrete");
  const exact = [m("HARBOR CONCRETE"), p(TAIL)];

  it.each([
    ["as the service sends it", sent],
    ["with the space sent apart", apart],
  ])(
    "%s: typed characters bridge the space to the next word as a mark",
    (_, parts) => {
      expect(partsFor(LABEL, parts, "substring", tokens)).toEqual(sent);
    },
  );

  it.each([
    ["as the service sends it", sent],
    ["with the space sent apart", apart],
  ])(
    "%s: weight and ink draw it as one match, as the same words typed right",
    (_, parts) => {
      for (const region of ["token", "substring"] as const) {
        expect(partsFor(LABEL, parts, region, tokens, "match")).toEqual(exact);
      }
      expect(partsFor(LABEL, exact, "substring", right, "match")).toEqual(
        exact,
      );
    },
  );

  it("keeps the parts as sent under the whole-word region, a mark of their own", () => {
    expect(partsFor(LABEL, sent, "token", tokens)).toBe(sent);
    expect(partsFor(LABEL, apart, "token", tokens)).toBe(apart);
  });

  it("does not bridge a space that a plain word follows", () => {
    // `harbro conc` with the second word typed as far as CONC: the space is
    // bridged to the matched part of it, and the rest of the word stays plain.
    expect(
      partsFor(LABEL, sent, "substring", queryTokens("harbro conc")),
    ).toEqual([m("HARB"), c("OR"), m(" CONC"), p("RETE PUMPING CO., INC.")]);
    // No second word typed: the space after the corrected letters is plain.
    expect(
      partsFor(
        LABEL,
        [m("HARB"), c("OR"), p(" CONCRETE" + TAIL)],
        "substring",
        queryTokens("harbro"),
      ),
    ).toEqual([m("HARB"), c("OR"), p(" CONCRETE" + TAIL)]);
  });
});

describe("two letters misspelled in one word", () => {
  // The service corrects one edit per word today. If it ever corrects more it
  // flags each stored letter the typed word had wrong, and the SDK needs no
  // change to draw them: each flagged letter is a mark of its own, and the typed
  // text is aligned to the letters through every one. The parts are as the
  // service would send them, by its rules (the whole word matched, the letters
  // changed split out), worked out by hand.
  const SENT = [m("H"), c("A"), m("RB"), c("O"), m("R"), p(REST)];

  it.each([
    // Two substitutions: six typed for six letters.
    ["hxrbur", "two substitutions", SENT, [m("HARBOR"), p(REST)]],
    // Two letters left out: four typed cover all six letters, both marked.
    ["hrbr", "two letters left out", SENT, [m("HARBOR"), p(REST)]],
    // One left out, one substituted: five typed cover six letters.
    [
      "hrbur",
      "a letter left out and one substituted",
      SENT,
      [m("HARBOR"), p(REST)],
    ],
  ])(
    "%s (%s): the whole word, both letters marked",
    (typed, _kind, mark, match) => {
      expect(partsFor(LABEL, SENT, "substring", queryTokens(typed))).toEqual(
        mark,
      );
      expect(
        partsFor(LABEL, SENT, "substring", queryTokens(typed), "match"),
      ).toEqual(match);
    },
  );

  it("covers a prefix through the last letter typed wrong, and leaves the rest plain", () => {
    // `hxrbu`: five typed, the A and the O wrong; the R is not typed yet.
    expect(partsFor(LABEL, SENT, "substring", queryTokens("hxrbu"))).toEqual([
      m("H"),
      c("A"),
      m("RB"),
      c("O"),
      p("R CONCRETE PUMPING CO., INC."),
    ]);
    expect(
      partsFor(LABEL, SENT, "substring", queryTokens("hxrbu"), "match"),
    ).toEqual([m("HARBO"), p("R CONCRETE PUMPING CO., INC.")]);
  });

  it("keeps the whole word as the service sent it under the whole-word region, both letters marked", () => {
    expect(partsFor(LABEL, SENT, "token", queryTokens("hxrbur"))).toBe(SENT);
    expect(
      partsFor(LABEL, SENT, "token", queryTokens("hxrbur"), "match"),
    ).toEqual([m("HARBOR"), p(REST)]);
  });

  it("keeps the marks the service gave a word the typed text does not reach all the way", () => {
    // `hxrb`: four typed never get to the O, so they are no spelling of the word.
    expect(partsFor(LABEL, SENT, "substring", queryTokens("hxrb"))).toEqual(
      SENT,
    );
    expect(partsFor(LABEL, SENT, "substring", ["zebra"])).toEqual(SENT);
  });
});

describe("a corrected word the typed text no longer matches", () => {
  // The rows were answered for an earlier query; the autocomplete service's
  // parts are still the truth about why the row is there, so the word is kept
  // as sent, whole, as any word no typed token starts is.
  it.each([
    ["nothing typed", []],
    ["something else typed", ["zebra"]],
    ["the word typed as far as the correction", ["harb"]],
  ])("keeps it as sent when %s", (_, tokens) => {
    expect(partsFor(LABEL, sent("harbur"), "substring", tokens)).toEqual(
      sent("harbur"),
    );
    expect(
      partsFor(LABEL, sent("harbur"), "substring", tokens, "match"),
    ).toEqual([m("HARBOR"), p(REST)]);
  });
});

describe("typed letters that fold", () => {
  it("aligns a stored letter with a mark to the typed one without", () => {
    // MUÑOZ typed `munaz`: the O is the corrected one, the Ñ is typed as N.
    const parts = [m("MUÑ"), c("O"), m("Z"), p(" FREIGHT")];

    expect(partsFor("MUÑOZ FREIGHT", parts, "substring", ["munaz"])).toEqual(
      parts,
    );
    expect(
      partsFor("MUÑOZ FREIGHT", parts, "substring", ["munaz"], "match"),
    ).toEqual([m("MUÑOZ"), p(" FREIGHT")]);
  });
});

describe("a corrected letter at the start or the end of a word", () => {
  it("covers a corrected last letter typed", () => {
    // `starbuckz` for STARBUCKS: the S is the corrected one.
    const parts = [m("STARBUCK"), c("S"), p(" COFFEE")];

    expect(
      partsFor("STARBUCKS COFFEE", parts, "substring", ["starbuckz"]),
    ).toEqual(parts);
  });

  it("leaves a corrected letter after the typed ones out, when only a prefix is typed", () => {
    const parts = [m("STARB"), c("U"), m("CKS"), p(" COFFEE")];

    // `starbi`: six typed, the U corrected; CKS not yet typed is plain.
    expect(
      partsFor("STARBUCKS COFFEE", parts, "substring", ["starbi"]),
    ).toEqual([m("STARB"), c("U"), p("CKS COFFEE")]);
  });
});
