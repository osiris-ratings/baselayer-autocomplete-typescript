import { describe, expect, it } from "vitest";

import {
  BUSINESS_STRUCTURES,
  formatFound,
  leadAddressOf,
  officersOf,
  orderedStates,
  partsFor,
  peopleLineOf,
  pickedNameOf,
  queryTokens,
  structureLabel,
  typedPrefixLength,
  type BusinessStructure,
  type BusinessSuggestion,
} from "@baselayer-sdk/autocomplete";

const cinder: BusinessSuggestion = {
  type: "business",
  token: "tok-cinder-rigging",
  label: "CINDER RIGGING, INC.",
  matched_name: "EMBERLINE",
  match: "strong",
  domicile_state: "DE",
  // Sorted, as the autocomplete service returns them; the domicile is not first
  // here on purpose.
  states: ["CA", "DE", "FL", "IL", "MA", "MO", "NY"],
  structure: "C_CORPORATION",
  related: {
    people: {
      count: 4,
      matched: null,
      truncated: false,
      items: [
        {
          type: "person",
          token: null,
          label: "NORTHGATE AGENT SERVICES, INC",
          role: "agent",
          matched: false,
          address: null,
          states: null,
          domicile_state: null,
        },
        {
          type: "person",
          token: null,
          label: "Wesley Crane",
          role: "officer",
          matched: false,
          address: null,
          states: null,
          domicile_state: null,
        },
        {
          type: "person",
          token: null,
          label: "Ada Fox",
          role: "officer",
          matched: false,
          address: null,
          states: null,
          domicile_state: null,
        },
      ],
    },
    addresses: {
      count: 2,
      matched: null,
      truncated: false,
      // In the autocomplete service's order: nothing filed in Delaware, so the
      // ladder runs through the other states, own filings by role before the
      // agent's.
      items: [
        {
          type: "address",
          token: "tok-7f1a2c3d",
          label: "412 Orchard Ln, Springfield, MO 65806",
          role: "principal",
          matched: false,
          address: null,
          states: null,
          domicile_state: null,
        },
        {
          type: "address",
          token: "tok-6f1a2c3d",
          label: "PO Box 4417, Durham, NC 27702",
          role: "mailing",
          matched: false,
          address: null,
          states: null,
          domicile_state: null,
        },
        {
          type: "address",
          token: "tok-8f1a2c3d",
          label: "88 Cactus Wren Dr, Tempe, AZ 85281",
          role: "agent",
          matched: false,
          address: null,
          states: null,
          domicile_state: null,
        },
      ],
    },
  },
  highlight: [{ text: "CINDER", matched: true }],
};

const stable: BusinessSuggestion = {
  ...cinder,
  token: "tok-cinder-racing-stables",
  label: "CINDER RACING STABLES, LLC",
  matched_name: null,
  domicile_state: "FL",
  states: ["FL"],
  related: {
    people: { count: 0, matched: null, truncated: false, items: [] },
    addresses: { count: 0, matched: null, truncated: false, items: [] },
  },
};

const agentsOnly: BusinessSuggestion = {
  ...cinder,
  token: "tok-shell-holdings",
  label: "SHELL HOLDINGS LLC",
  related: {
    ...cinder.related,
    people: {
      count: 2,
      matched: null,
      truncated: false,
      items: [
        {
          type: "person",
          token: null,
          label: "NORTHGATE AGENT SERVICES, INC",
          role: "agent",
          matched: false,
          address: null,
          states: null,
          domicile_state: null,
        },
        {
          type: "person",
          token: null,
          label: "LAKESIDE FILING AGENTS",
          role: "agent",
          matched: false,
          address: null,
          states: null,
          domicile_state: null,
        },
      ],
    },
  },
};

// Twelve officers on the family, three in the head (the autocomplete service's
// cap).
const crowded: BusinessSuggestion = {
  ...cinder,
  token: "tok-crowded",
  related: {
    ...cinder.related,
    people: {
      count: 12,
      matched: null,
      truncated: true,
      items: [
        {
          type: "person",
          token: null,
          label: "Wesley Crane",
          role: "officer",
          matched: false,
          address: null,
          states: null,
          domicile_state: null,
        },
        {
          type: "person",
          token: null,
          label: "Ada Fox",
          role: "officer",
          matched: false,
          address: null,
          states: null,
          domicile_state: null,
        },
        {
          type: "person",
          token: null,
          label: "Sam Lee",
          role: "officer",
          matched: false,
          address: null,
          states: null,
          domicile_state: null,
        },
      ],
    },
  },
};

describe("leadAddressOf", () => {
  it("takes the autocomplete service's first address whatever its role, and nothing from an empty head", () => {
    expect(leadAddressOf(cinder)).toBe("412 Orchard Ln, Springfield, MO 65806");
    // The autocomplete service ranks a registered agent's address last, but
    // when it is all a family has, it is the family's lead address rather than
    // nothing.
    const agentAddressOnly: BusinessSuggestion = {
      ...cinder,
      related: {
        ...cinder.related,
        addresses: {
          ...cinder.related.addresses,
          items: cinder.related.addresses.items.filter(
            item => item.role === "agent",
          ),
        },
      },
    };
    expect(leadAddressOf(agentAddressOnly)).toBe(
      "88 Cactus Wren Dr, Tempe, AZ 85281",
    );
    expect(leadAddressOf(stable)).toBeNull();
  });
});

describe("officersOf", () => {
  it("lists the officers and leaves the registered agents out", () => {
    expect(officersOf(cinder)).toEqual(["Wesley Crane", "Ada Fox"]);
    expect(officersOf(stable)).toEqual([]);
  });
});

describe("peopleLineOf", () => {
  it("names the officers when there are any, agents otherwise, nobody when neither", () => {
    expect(peopleLineOf(cinder)).toEqual({
      names: ["Wesley Crane", "Ada Fox"],
      role: "officer",
      more: 1,
      matched: 0,
    });
    expect(peopleLineOf(agentsOnly)).toEqual({
      names: ["NORTHGATE AGENT SERVICES, INC", "LAKESIDE FILING AGENTS"],
      role: "agent",
      more: 1,
      matched: 0,
    });
    expect(peopleLineOf(stable)).toBeNull();
  });

  it("counts the family beyond the head when the head is all officers", () => {
    expect(peopleLineOf(crowded)).toEqual(
      expect.objectContaining({ role: "officer", more: 11 }),
    );
  });

  it("does not count the agents beyond the head against the officer line", () => {
    // The autocomplete service lists officers before agents, so an agent inside
    // the head means every officer is in the head too: the rest of the family
    // are agents (cinder: count 4, head of three with one agent, so +1).
    expect(peopleLineOf(cinder)).toEqual(
      expect.objectContaining({ role: "officer", more: 1 }),
    );
  });

  it("falls back to the head when the autocomplete service sent no total", () => {
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
  it("moves the domicile to the front and keeps the rest in the autocomplete service's order", () => {
    expect(orderedStates(cinder)).toEqual([
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

describe("structureLabel", () => {
  it("draws each structure the autocomplete service knows as a short flag, and OTHER as none", () => {
    const flags: Record<(typeof BUSINESS_STRUCTURES)[number], string | null> = {
      SOLE_PROPRIETORSHIP: "Sole prop.",
      GENERAL_PARTNERSHIP: "GP",
      LLC: "LLC",
      LLP: "LLP",
      LLLP: "LLLP",
      LP: "LP",
      C_CORPORATION: "C-Corp",
      S_CORPORATION: "S-Corp",
      B_CORPORATION: "B-Corp",
      NONPROFIT: "Nonprofit",
      COOPERATIVE: "Co-op",
      TRUST: "Trust",
      PROFESSIONAL_ASSOCIATION: "P.A.",
      PROFESSIONAL_CORPORATION: "P.C.",
      TRADE_NAME: "DBA",
      BANK: "Bank",
      CREDIT_UNION: "Credit union",
      INSURANCE: "Insurance",
      OTHER: null,
    };

    expect(
      Object.fromEntries(BUSINESS_STRUCTURES.map(s => [s, structureLabel(s)])),
    ).toEqual(flags);
  });

  it("never draws a professional association as PA, Pennsylvania's square", () => {
    expect(structureLabel("PROFESSIONAL_ASSOCIATION")).not.toBe("PA");
  });

  it("draws no flag for no structure, or for a value untyped data slips in", () => {
    // The parser refuses a structure the contract does not list, but a host
    // calling this with untyped data still gets no flag, even for a value
    // that names a member of every object.
    for (const structure of [
      null,
      "FOUNDATION",
      "",
      "constructor",
      "toString",
      "__proto__",
    ]) {
      expect(
        structureLabel(structure as BusinessStructure | null),
        String(structure),
      ).toBeNull();
    }
  });

  it("takes a host's label for any value, one at a time, and hides one set to empty", () => {
    const labels: Partial<Record<BusinessStructure, string>> = {
      LLC: "L.L.C.",
      C_CORPORATION: "",
      OTHER: "Other",
    };

    expect(structureLabel("LLC", labels)).toBe("L.L.C.");
    expect(structureLabel("S_CORPORATION", labels)).toBe("S-Corp");
    expect(structureLabel("C_CORPORATION", labels)).toBeNull();
    expect(structureLabel("OTHER", labels)).toBe("Other");
    expect(structureLabel(null, labels)).toBeNull();
  });

  it("keeps the default for a host's label it cannot use", () => {
    // Staged from an untyped config: anything but a string is no label.
    const labels = { LLC: 3, LP: null } as unknown as Partial<
      Record<BusinessStructure, string>
    >;

    expect(structureLabel("LLC", labels)).toBe("LLC");
    expect(structureLabel("LP", labels)).toBe("LP");
    // A null in place of the labels, from plain JavaScript, is no labels.
    expect(
      structureLabel(
        "LLC",
        null as unknown as Partial<Record<BusinessStructure, string>>,
      ),
    ).toBe("LLC");
  });
});

describe("formatFound", () => {
  it("marks a capped count as a floor", () => {
    expect(formatFound(500, true)).toBe("500+");
    expect(formatFound(12, false)).toBe("12");
  });
});

describe("queryTokens", () => {
  it("tokenizes the query the way the autocomplete service does for the marks", () => {
    // `&` is the word `and`, `-` and `_` are spaces, other punctuation goes,
    // diacritics fold, case folds.
    expect(queryTokens("  Cin & Rig-ging, José  ")).toEqual([
      "cin",
      "and",
      "rig",
      "ging",
      "jose",
    ]);
    expect(queryTokens("O'Neill")).toEqual(["o'neill"]);
    expect(queryTokens("   ")).toEqual([]);
  });
});

describe("typedPrefixLength", () => {
  it("is the longest typed token the word starts with, in the word's own characters", () => {
    expect(typedPrefixLength("CINDER", ["cin", "rig"])).toBe(3);
    expect(typedPrefixLength("CINDER", ["ci", "cinde"])).toBe(5);
    expect(typedPrefixLength("JOSÉ", ["jose"])).toBe(4);
  });

  it("is zero when no typed token starts the word", () => {
    expect(typedPrefixLength("RIGGING", ["cin"])).toBe(0);
    expect(typedPrefixLength("RIGGING", [])).toBe(0);
  });
});

describe("partsFor", () => {
  // The autocomplete service's own shape, pinned by its unit test: two matched
  // words with only whitespace between them are ONE part.
  const parts = [
    { text: "CINDER RIGGING", matched: true },
    { text: ", INC.", matched: false },
  ];

  it("hands a line the parts only when they spell its text", () => {
    expect(partsFor("CINDER RIGGING, INC.", parts, "token", [])).toBe(parts);
    expect(partsFor("EMBERLINE", parts, "token", [])).toBeNull();
    expect(partsFor("CINDER RIGGING, INC.", [], "token", [])).toBeNull();
  });

  it("cuts every marked word at its typed characters under the substring region, not only the first", () => {
    expect(
      partsFor("CINDER RIGGING, INC.", parts, "substring", ["cin", "rig"]),
    ).toEqual([
      { text: "CIN", matched: true },
      { text: "DER ", matched: false },
      { text: "RIG", matched: true },
      { text: "GING, INC.", matched: false },
    ]);
  });

  it("grows back into the autocomplete service's whole-word span as the words are typed out", () => {
    // Both words typed in full: the whitespace between them is marked with
    // them, exactly the part the autocomplete service sent, so the two regions
    // agree here.
    expect(
      partsFor("CINDER RIGGING, INC.", parts, "substring", [
        "cinder",
        "rigging",
      ]),
    ).toEqual(parts);
  });

  it("keeps a whole-word mark on a word the typed text no longer starts", () => {
    // The rows were answered for an earlier query; the autocomplete service's
    // mark is still the truth about why the row is there.
    expect(
      partsFor("CINDER RIGGING, INC.", parts, "substring", ["cinder", "xyz"]),
    ).toEqual(parts);
    // ...and, adjacent to a cut word, the two marks are one span.
    expect(
      partsFor("CINDER RIGGING, INC.", parts, "substring", ["rig"]),
    ).toEqual([
      { text: "CINDER RIG", matched: true },
      { text: "GING, INC.", matched: false },
    ]);
  });
});

describe("pickedNameOf", () => {
  it("is the name the family goes by when the row matched that", () => {
    expect(pickedNameOf(cinder)).toBe("EMBERLINE");
  });

  it("is the row's own name when that is what matched", () => {
    expect(pickedNameOf(stable)).toBe("CINDER RACING STABLES, LLC");
  });

  it("is the row's own name for a matched name that says nothing", () => {
    expect(pickedNameOf({ ...cinder, matched_name: "" })).toBe(
      "CINDER RIGGING, INC.",
    );
    expect(pickedNameOf({ ...cinder, matched_name: "  " })).toBe(
      "CINDER RIGGING, INC.",
    );
  });
});
