import { describe, expect, it } from "vitest";

import {
  formatFound,
  leadAddressOf,
  officersOf,
  orderedStates,
  partsFor,
  peopleLineOf,
  queryTokens,
  typedPrefixLength,
  type BusinessSuggestion,
} from "@baselayer/autocomplete";

const osiris: BusinessSuggestion = {
  type: "business",
  token: "tok-osiris-ratings",
  label: "OSIRIS RATINGS, INC.",
  matched_name: "BASELAYER",
  match: "strong",
  domicile_state: "DE",
  // Sorted, as the tier returns them; the domicile is not first here on purpose.
  states: ["CA", "DE", "FL", "IL", "MA", "MO", "NY"],
  related: {
    people: {
      count: 4,
      matched: null,
      truncated: false,
      items: [
        {
          type: "person",
          token: null,
          label: "REGISTERED AGENT SOLUTIONS, INC",
          role: "agent",
          matched: false,
        },
        {
          type: "person",
          token: null,
          label: "Timothy Hyde",
          role: "officer",
          matched: false,
        },
        {
          type: "person",
          token: null,
          label: "Ana Ray",
          role: "officer",
          matched: false,
        },
      ],
    },
    addresses: {
      count: 2,
      matched: null,
      truncated: false,
      // In the tier's order: nothing filed in Delaware, so the ladder runs
      // through the other states, own filings by role before the agent's.
      items: [
        {
          type: "address",
          token: "tok-7f1a2c3d",
          label: "600 W Main St, Jefferson City, MO 65101",
          role: "principal",
          matched: false,
        },
        {
          type: "address",
          token: "tok-6f1a2c3d",
          label: "29622 PO Box, Raleigh, NC 27626",
          role: "mailing",
          matched: false,
        },
        {
          type: "address",
          token: "tok-8f1a2c3d",
          label: "300 W Clarendon Ave, Phoenix, AZ 85013",
          role: "agent",
          matched: false,
        },
      ],
    },
    liens: { count: null, matched: null, truncated: false, items: [] },
  },
  highlight: [{ text: "OSIRIS", matched: true }],
};

const stable: BusinessSuggestion = {
  ...osiris,
  token: "tok-osiris-racing-stables",
  label: "OSIRIS RACING STABLES, LLC",
  matched_name: null,
  domicile_state: "FL",
  states: ["FL"],
  related: {
    people: { count: 0, matched: null, truncated: false, items: [] },
    addresses: { count: 0, matched: null, truncated: false, items: [] },
    liens: { count: null, matched: null, truncated: false, items: [] },
  },
};

const agentsOnly: BusinessSuggestion = {
  ...osiris,
  token: "tok-shell-holdings",
  label: "SHELL HOLDINGS LLC",
  related: {
    ...osiris.related,
    people: {
      count: 2,
      matched: null,
      truncated: false,
      items: [
        {
          type: "person",
          token: null,
          label: "REGISTERED AGENT SOLUTIONS, INC",
          role: "agent",
          matched: false,
        },
        {
          type: "person",
          token: null,
          label: "C T CORPORATION SYSTEM",
          role: "agent",
          matched: false,
        },
      ],
    },
  },
};

// Twelve officers on the family, three in the head (the tier's cap).
const crowded: BusinessSuggestion = {
  ...osiris,
  token: "tok-crowded",
  related: {
    ...osiris.related,
    people: {
      count: 12,
      matched: null,
      truncated: true,
      items: [
        {
          type: "person",
          token: null,
          label: "Timothy Hyde",
          role: "officer",
          matched: false,
        },
        {
          type: "person",
          token: null,
          label: "Ana Ray",
          role: "officer",
          matched: false,
        },
        {
          type: "person",
          token: null,
          label: "Sam Lee",
          role: "officer",
          matched: false,
        },
      ],
    },
  },
};

describe("leadAddressOf", () => {
  it("takes the tier's first address whatever its role, and nothing from an empty head", () => {
    expect(leadAddressOf(osiris)).toBe(
      "600 W Main St, Jefferson City, MO 65101",
    );
    // The tier ranks a registered agent's address last, but when it is all a
    // family has, it is the family's lead address rather than nothing.
    const agentAddressOnly: BusinessSuggestion = {
      ...osiris,
      related: {
        ...osiris.related,
        addresses: {
          ...osiris.related.addresses,
          items: osiris.related.addresses.items.filter(
            item => item.role === "agent",
          ),
        },
      },
    };
    expect(leadAddressOf(agentAddressOnly)).toBe(
      "300 W Clarendon Ave, Phoenix, AZ 85013",
    );
    expect(leadAddressOf(stable)).toBeNull();
  });
});

describe("officersOf", () => {
  it("lists the officers and leaves the registered agents out", () => {
    expect(officersOf(osiris)).toEqual(["Timothy Hyde", "Ana Ray"]);
    expect(officersOf(stable)).toEqual([]);
  });
});

describe("peopleLineOf", () => {
  it("names the officers when there are any, agents otherwise, nobody when neither", () => {
    expect(peopleLineOf(osiris)).toEqual({
      names: ["Timothy Hyde", "Ana Ray"],
      role: "officer",
      more: 1,
    });
    expect(peopleLineOf(agentsOnly)).toEqual({
      names: ["REGISTERED AGENT SOLUTIONS, INC", "C T CORPORATION SYSTEM"],
      role: "agent",
      more: 1,
    });
    expect(peopleLineOf(stable)).toBeNull();
  });

  it("counts the family beyond the head when the head is all officers", () => {
    expect(peopleLineOf(crowded)).toEqual(
      expect.objectContaining({ role: "officer", more: 11 }),
    );
  });

  it("does not count the agents beyond the head against the officer line", () => {
    // The tier lists officers before agents, so an agent inside the head
    // means every officer is in the head too: the rest of the family are
    // agents (osiris: count 4, head of three with one agent, so +1).
    expect(peopleLineOf(osiris)).toEqual(
      expect.objectContaining({ role: "officer", more: 1 }),
    );
  });

  it("falls back to the head when the tier sent no total", () => {
    expect(
      peopleLineOf({
        ...crowded,
        related: {
          ...crowded.related,
          people: { ...crowded.related.people, count: null },
        },
      }),
    ).toEqual(expect.objectContaining({ more: 2 }));
  });
});

describe("orderedStates", () => {
  it("moves the domicile to the front and keeps the rest in the tier's order", () => {
    expect(orderedStates(osiris)).toEqual([
      "DE",
      "CA",
      "FL",
      "IL",
      "MA",
      "MO",
      "NY",
    ]);
  });
});

describe("formatFound", () => {
  it("marks a capped count as a floor", () => {
    expect(formatFound(500, true)).toBe("500+");
    expect(formatFound(12, false)).toBe("12");
  });
});

describe("queryTokens", () => {
  it("tokenizes the query the way the tier does for the marks", () => {
    // `normalize_name`, then `fold`: `&` is the word `and`, `-` and `_` are
    // spaces, other punctuation goes, diacritics fold, case folds.
    expect(queryTokens("  Osi & Rat-ings, José  ")).toEqual([
      "osi",
      "and",
      "rat",
      "ings",
      "jose",
    ]);
    expect(queryTokens("O'Neill")).toEqual(["o'neill"]);
    expect(queryTokens("   ")).toEqual([]);
  });
});

describe("typedPrefixLength", () => {
  it("is the longest typed token the word starts with, in the word's own characters", () => {
    expect(typedPrefixLength("OSIRIS", ["osi", "rat"])).toBe(3);
    expect(typedPrefixLength("OSIRIS", ["os", "osiri"])).toBe(5);
    expect(typedPrefixLength("JOSÉ", ["jose"])).toBe(4);
  });

  it("is zero when no typed token starts the word", () => {
    expect(typedPrefixLength("RATINGS", ["osi"])).toBe(0);
    expect(typedPrefixLength("RATINGS", [])).toBe(0);
  });
});

describe("partsFor", () => {
  // The tier's own shape, pinned by its unit test: two matched words with
  // only whitespace between them are ONE part.
  const parts = [
    { text: "OSIRIS RATINGS", matched: true },
    { text: ", INC.", matched: false },
  ];

  it("hands a line the parts only when they spell its text", () => {
    expect(partsFor("OSIRIS RATINGS, INC.", parts, "token", [])).toBe(parts);
    expect(partsFor("BASELAYER", parts, "token", [])).toBeNull();
    expect(partsFor("OSIRIS RATINGS, INC.", [], "token", [])).toBeNull();
  });

  it("cuts every marked word at its typed characters under the substring region, not only the first", () => {
    expect(
      partsFor("OSIRIS RATINGS, INC.", parts, "substring", ["osi", "rat"]),
    ).toEqual([
      { text: "OSI", matched: true },
      { text: "RIS ", matched: false },
      { text: "RAT", matched: true },
      { text: "INGS, INC.", matched: false },
    ]);
  });

  it("grows back into the tier's whole-word span as the words are typed out", () => {
    // Both words typed in full: the whitespace between them is marked with
    // them, exactly the part the tier sent, so the two regions agree here.
    expect(
      partsFor("OSIRIS RATINGS, INC.", parts, "substring", [
        "osiris",
        "ratings",
      ]),
    ).toEqual(parts);
  });

  it("keeps a whole-word mark on a word the typed text no longer starts", () => {
    // The rows were answered for an earlier query; the tier's mark is still
    // the truth about why the row is there.
    expect(
      partsFor("OSIRIS RATINGS, INC.", parts, "substring", ["osiris", "xyz"]),
    ).toEqual(parts);
    // ...and, adjacent to a cut word, the two marks are one span.
    expect(
      partsFor("OSIRIS RATINGS, INC.", parts, "substring", ["rat"]),
    ).toEqual([
      { text: "OSIRIS RAT", matched: true },
      { text: "INGS, INC.", matched: false },
    ]);
  });
});
