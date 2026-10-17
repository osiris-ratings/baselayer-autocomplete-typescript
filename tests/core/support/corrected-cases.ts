import type { HighlightPart } from "@baselayer-sdk/autocomplete";

import golden from "../fixtures/typo-highlights.json";

// The twelve typed texts of the service's answers (`fixtures/typo-highlights.json`)
// and what the components draw of each, worked out by hand from the letters of
// HARBOR CONCRETE PUMPING CO., INC.: the whole word the service marked (the
// `token` region) or the letters typed (`substring`), and a corrected letter as
// a mark of its own (`mark`: the underline and background emphases) or as an
// ordinary match (`match`: weight and ink, which mark nothing for a fuzzy
// match). Shared by the core and the view tests.

export const LABEL = golden.label;
const REST = " CONCRETE PUMPING CO., INC.";
const TAIL = " PUMPING CO., INC.";

export const m = (text: string): HighlightPart => ({ text, matched: true });
export const p = (text: string): HighlightPart => ({ text, matched: false });
export const c = (text: string): HighlightPart => ({
  text,
  matched: false,
  corrected: true,
});

type Drawn = Record<"mark" | "match", HighlightPart[]>;

export interface CorrectedCase {
  typed: string;
  kind: string;
  /** The parts the service sent. */
  sent: HighlightPart[];
  /** Drawn as sent, a whole word marked (the `token` region). */
  token: Drawn;
  /** Drawn cut at the typed letters (the `substring` region). */
  substring: Drawn;
}

const sentFor = (typed: string): HighlightPart[] =>
  golden.cases.find(entry => entry.typed === typed)!
    .highlight as HighlightPart[];

const entry = (
  typed: string,
  kind: string,
  tokenMatch: HighlightPart[],
  substringMark: HighlightPart[],
  substringMatch: HighlightPart[],
): CorrectedCase => ({
  typed,
  kind,
  sent: sentFor(typed),
  token: { mark: sentFor(typed), match: tokenMatch },
  substring: { mark: substringMark, match: substringMatch },
});

export const CORRECTED_CASES: CorrectedCase[] = [
  // Six typed for six letters, the O between the solid ones.
  entry(
    "harbur",
    "substitution",
    [m("HARBOR"), p(REST)],
    [m("HARB"), c("O"), m("R"), p(REST)],
    [m("HARBOR"), p(REST)],
  ),
  // Five typed cover all six letters, the O the one left out and marked; never
  // HARBO with the R left out.
  entry(
    "harbr",
    "deletion",
    [m("HARBOR"), p(REST)],
    [m("HARB"), c("O"), m("R"), p(REST)],
    [m("HARBOR"), p(REST)],
  ),
  // Both letters corrected, six typed for six letters.
  entry(
    "harbro",
    "swap",
    [m("HARBOR"), p(REST)],
    [m("HARB"), c("OR"), p(REST)],
    [m("HARBOR"), p(REST)],
  ),
  // Nothing to flag; the word the typed text does not start is kept whole.
  entry(
    "harbbor",
    "an extra letter",
    [m("HARBOR"), p(REST)],
    [m("HARBOR"), p(REST)],
    [m("HARBOR"), p(REST)],
  ),
  // No correction: the typed four only, under the typed letters.
  entry(
    "harb",
    "a prefix still being typed",
    [m("HARBOR"), p(REST)],
    [m("HARB"), p("OR CONCRETE PUMPING CO., INC.")],
    [m("HARB"), p("OR CONCRETE PUMPING CO., INC.")],
  ),
  entry(
    "harbur concrate",
    "two words, a substitution in each",
    [m("HARBOR CONCRETE"), p(TAIL)],
    [m("HARB"), c("O"), m("R CONCR"), c("E"), m("TE"), p(TAIL)],
    [m("HARBOR CONCRETE"), p(TAIL)],
  ),
  // Five typed, the O corrected, the R not yet typed stays plain.
  entry(
    "harbu",
    "a prefix whose last typed letter is wrong",
    [m("HARBOR"), p(REST)],
    [m("HARB"), c("O"), p("R CONCRETE PUMPING CO., INC.")],
    [m("HARBO"), p("R CONCRETE PUMPING CO., INC.")],
  ),
  // The whole of HARBOR, and CONC of the next word.
  entry(
    "harbr conc",
    "a deletion, then a prefix",
    [m("HARBOR CONCRETE"), p(TAIL)],
    [m("HARB"), c("O"), m("R CONC"), p("RETE PUMPING CO., INC.")],
    [m("HARBOR CONC"), p("RETE PUMPING CO., INC.")],
  ),
  entry(
    "harbor",
    "typed right",
    [m("HARBOR"), p(REST)],
    [m("HARBOR"), p(REST)],
    [m("HARBOR"), p(REST)],
  ),
  // The swap ends the first word and an exact word follows: the space stays in
  // the next word's matched part, so the run goes on across it.
  entry(
    "harbro concrete",
    "a swap that ends the first word, then an exact word",
    [m("HARBOR CONCRETE"), p(TAIL)],
    [m("HARB"), c("OR"), m(" CONCRETE"), p(TAIL)],
    [m("HARBOR CONCRETE"), p(TAIL)],
  ),
  entry(
    "harbor concrete",
    "two words typed right",
    [m("HARBOR CONCRETE"), p(TAIL)],
    [m("HARBOR CONCRETE"), p(TAIL)],
    [m("HARBOR CONCRETE"), p(TAIL)],
  ),
  // The swap ends the last typed word: the corrected letters are the stored ones
  // (ET), the rest of the word is matched again (E), and seven typed cover the
  // first seven letters of CONCRETE, so the last E is not yet typed.
  entry(
    "harbor concrte",
    "a swap that ends the last typed word, the rest of the word matched again",
    [m("HARBOR CONCRETE"), p(TAIL)],
    [m("HARBOR CONCR"), c("ET"), p("E PUMPING CO., INC.")],
    [m("HARBOR CONCRET"), p("E PUMPING CO., INC.")],
  ),
];
