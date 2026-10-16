import { describe, expect, it } from "vitest";

import {
  ContractViolation,
  parseBusinessesResponse,
  parseSuggestResponse,
  partsFor,
  type HighlightPart,
} from "@baselayer-sdk/autocomplete";

import { golden } from "./fixtures/golden";

// A word the search corrected comes split by letter: the letters that answer
// what was typed are `matched`, the letters the correction changed are
// `corrected` (never matched), and the parts still spell the name.

const corrected = golden("businesses_corrected");

/** The first row's highlight parts of an answer parsed as a client reads it. */
function partsOf(answer: unknown): HighlightPart[] {
  const [row] = parseBusinessesResponse(answer).suggestions;
  return row?.highlight ?? [];
}

describe("a highlight part the search corrected", () => {
  it("reads the flag on the letters it changed, and only there", () => {
    expect(partsOf(corrected)).toEqual([
      { text: "HALCY", matched: true },
      { text: "O", matched: false, corrected: true },
      { text: "N", matched: true },
      { text: " FERRY WORKS LLC", matched: false },
    ]);
  });

  it("keeps the parts spelling the name, byte for byte", () => {
    const [row] = parseBusinessesResponse(corrected).suggestions;
    expect(row?.highlight?.map(part => part.text).join("")).toBe(row?.label);
  });

  it("leaves a part with no flag as it was: no key, not an undefined one", () => {
    const exact = partsOf(golden("businesses"));
    expect(exact).toEqual([
      { text: "HALCYON", matched: true },
      { text: " FERRY WORKS LLC", matched: false },
    ]);
    for (const part of exact) {
      expect(Object.keys(part).sort()).toEqual(["matched", "text"]);
    }
  });

  it("reads a flag of false as none, where the contract omits it", () => {
    const answer = structuredClone(corrected) as {
      suggestions: { highlight: Record<string, unknown>[] }[];
    };
    answer.suggestions[0]!.highlight[1]!.corrected = false;
    expect(partsOf(answer)[1]).toEqual({ text: "O", matched: false });
  });

  it("refuses a flag that is not a boolean, as it refuses any part's wrong type", () => {
    const answer = structuredClone(corrected) as {
      suggestions: { highlight: Record<string, unknown>[] }[];
    };
    answer.suggestions[0]!.highlight[1]!.corrected = "yes";
    expect(() => parseBusinessesResponse(answer)).toThrow(ContractViolation);
  });

  it("is read on the people and addresses routes' highlights too, where the type is shared", () => {
    const people = golden("people") as {
      suggestions: { label: string; highlight: unknown }[];
      sources: unknown;
    };
    const first = people.suggestions[0]!;
    const answer = {
      ...people,
      suggestions: [
        {
          ...first,
          highlight: [
            { text: first.label.slice(0, 1), matched: true },
            { text: first.label.slice(1, 2), matched: false, corrected: true },
            { text: first.label.slice(2), matched: false },
          ],
        },
        ...people.suggestions.slice(1),
      ],
    };
    const [row] = parseSuggestResponse("people", answer).suggestions;
    expect(row?.highlight?.[1]).toEqual({
      text: first.label.slice(1, 2),
      matched: false,
      corrected: true,
    });
  });
});

describe("partsFor with corrected parts", () => {
  const parts: HighlightPart[] = [
    { text: "HALCY", matched: true },
    { text: "O", matched: false, corrected: true },
    { text: "N", matched: true },
    { text: " FERRY WORKS LLC", matched: false },
  ];
  const text = "HALCYON FERRY WORKS LLC";

  it("hands them over as they are under the token region", () => {
    expect(partsFor(text, parts, "token", [])).toBe(parts);
  });

  it("keeps them under the substring region, where the matched parts are cut at the typed text", () => {
    expect(partsFor(text, parts, "substring", ["halcyin"])).toEqual(parts);
  });

  it("does not fold a corrected letter into the unmarked text beside it", () => {
    const beside: HighlightPart[] = [
      { text: "HALCY", matched: true },
      { text: "O", matched: false, corrected: true },
      { text: "N FERRY", matched: false },
    ];
    expect(partsFor("HALCYON FERRY", beside, "substring", ["halcyin"])).toEqual(
      beside,
    );
  });

  it("joins corrected letters that sit together into one part", () => {
    const apart: HighlightPart[] = [
      { text: "STARB", matched: true },
      { text: "U", matched: false, corrected: true },
      { text: "C", matched: false, corrected: true },
      { text: "KS", matched: true },
    ];
    expect(partsFor("STARBUCKS", apart, "substring", ["starbicks"])).toEqual([
      { text: "STARB", matched: true },
      { text: "UC", matched: false, corrected: true },
      { text: "KS", matched: true },
    ]);
  });

  it("is what it was for parts with no corrected letter", () => {
    const exact: HighlightPart[] = [
      { text: "CINDER RIGGING", matched: true },
      { text: ", INC.", matched: false },
    ];
    expect(partsFor("CINDER RIGGING, INC.", exact, "token", [])).toBe(exact);
    expect(
      partsFor("CINDER RIGGING, INC.", exact, "substring", ["cin", "rig"]),
    ).toEqual([
      { text: "CIN", matched: true },
      { text: "DER ", matched: false },
      { text: "RIG", matched: true },
      { text: "GING, INC.", matched: false },
    ]);
  });
});
