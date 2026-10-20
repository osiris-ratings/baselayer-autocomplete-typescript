import {
  ADDRESS_LISTINGS,
  PERSON_ROLES,
  includeForLayout,
  leadAddressOf,
  matchedOn,
  partsFor,
  peopleLineOf,
  structureLabel,
} from "@baselayer-sdk/autocomplete";
import { queryTokens } from "@baselayer-sdk/autocomplete";
import { DEFAULT_LIMIT } from "@baselayer-sdk/autocomplete/react";
import { describe, expect, it } from "vitest";

import {
  SAMPLE_ADDRESSES,
  SAMPLE_PEOPLE,
  SAMPLE_QUERY,
  SAMPLE_SUGGESTIONS,
  samplePeople,
  sampleRows,
  serviceHighlightFor,
} from "../../site/demo/sample";

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

describe("the sample rows under Behavior", () => {
  const all = ["people", "addresses"] as const;

  it("shows as many rows as Rows asks for, up to the sample's own", () => {
    expect(sampleRows({ limit: 2, include: [...all] })).toHaveLength(2);
    expect(sampleRows({ limit: 20, include: [...all] })).toHaveLength(
      SAMPLE_SUGGESTIONS.length,
    );
    // More rows than the default limit, so raising it shows more.
    expect(SAMPLE_SUGGESTIONS.length).toBeGreaterThan(5);
  });

  it("leaves out the related entities no placed field asks for", () => {
    const rows = sampleRows({
      limit: 20,
      include: includeForLayout({ subtitle: null }),
    });

    for (const row of rows) {
      expect(row.related.addresses).toEqual({
        count: null,
        matched: null,
        truncated: false,
        items: [],
      });
    }
    expect(rows.some(row => row.related.people.items.length > 0)).toBe(true);
  });
});

describe("the sample rows' fields", () => {
  // What the preview shows before Rows is raised.
  const shown = SAMPLE_SUGGESTIONS.slice(0, DEFAULT_LIMIT);

  it("draw every field on the rows the preview opens with", () => {
    expect(shown.every(row => row.states.length > 0)).toBe(true);
    expect(shown.some(row => row.states.length > 3)).toBe(true);
    expect(shown.some(row => structureLabel(row.structure) !== null)).toBe(
      true,
    );
    expect(shown.every(row => leadAddressOf(row) !== null)).toBe(true);
    const people = shown.map(peopleLineOf);
    expect(people.some(line => line?.role === "officer" && line.more > 0)).toBe(
      true,
    );
    expect(people.some(line => line?.role === "agent")).toBe(true);
  });

  it("include a row an officer filter reached and one an officer's address did, among those the preview opens with", () => {
    const found = shown.flatMap(row => matchedOn(row, {}));

    expect(found.map(match => match.kind).sort()).toEqual([
      "address",
      "alias",
      "officer",
    ]);
    expect(found).toContainEqual({
      kind: "officer",
      names: ["Priya Raman"],
      of: 1,
    });
    expect(found).toContainEqual({
      kind: "address",
      label: "2210 Pellington Hwy, Baltimore, MD 21230",
      role: "officer",
    });
    // The first the preview opens with is reached by its name alone.
    expect(matchedOn(shown[0]!, {})).toEqual([]);
  });

  it("carry a spread of structures, one not known, each drawn as its own flag", () => {
    const structures = SAMPLE_SUGGESTIONS.map(row => row.structure);
    const flags = new Set(
      structures.flatMap(structure => structureLabel(structure) ?? []),
    );

    expect(flags.size).toBeGreaterThanOrEqual(5);
    expect(shown.some(row => row.structure === null)).toBe(true);
    // A known structure always draws: none of them is OTHER.
    for (const structure of structures) {
      if (structure !== null) {
        expect(structureLabel(structure), structure).not.toBeNull();
      }
    }
  });

  it("carry a structure on a name with no suffix to say it, where the flag earns its place", () => {
    const suffix = /(INC\.|LLC|LP|CO\.)$/;
    const bare = shown.find(row => !suffix.test(row.label));

    expect(bare?.structure).toBe("TRADE_NAME");
    expect(structureLabel(bare!.structure)).toBe("DBA");
  });
});

describe("the sample people and addresses", () => {
  it("never show an address no business is filed at, which the addresses route leaves out", () => {
    for (const row of SAMPLE_ADDRESSES) {
      expect(row.related.businesses.items.length, row.label).toBeGreaterThan(0);
    }
  });

  it("give each person their addresses, counted in full, each with neither a token nor a role", () => {
    for (const row of SAMPLE_PEOPLE) {
      const { items, count } = row.related.addresses;
      expect(items.length, row.label).toBeGreaterThan(0);
      expect(count, row.label).toBeGreaterThanOrEqual(items.length);
      for (const item of items) {
        expect(Object.keys(item).sort(), item.label).toEqual([
          "highlight",
          "label",
          "matched",
          "type",
        ]);
      }
    }
  });

  it("list at each address the people who list it, and only them, each with neither a token nor a role", () => {
    const at = (address: string) =>
      SAMPLE_PEOPLE.filter(person =>
        person.related.addresses.items.some(item => item.label === address),
      )
        .map(person => person.label)
        .sort();
    for (const row of SAMPLE_ADDRESSES) {
      expect(
        row.related.people.items.map(item => item.label).sort(),
        row.label,
      ).toEqual(at(row.label));
      for (const item of row.related.people.items) {
        expect(Object.keys(item).sort(), item.label).toEqual([
          "highlight",
          "label",
          "matched",
          "type",
        ]);
      }
    }
  });

  it("carry, on each business under them, what its own row leads with", () => {
    for (const row of [...SAMPLE_PEOPLE, ...SAMPLE_ADDRESSES]) {
      for (const item of row.related.businesses.items) {
        const own = SAMPLE_SUGGESTIONS.find(b => b.label === item.label)!;
        expect(item.address).toBe(leadAddressOf(own));
        expect(item.states).toEqual(own.states);
        expect(item.domicile_state).toBe(own.domicile_state);
        // The token its own row seals, which a pick spends (a pin may follow).
        expect(item.token.startsWith(own.token), item.label).toBe(true);
      }
    }
  });

  it("have no other name that matched on a person or an address, and give a person the states of their businesses", () => {
    for (const row of [...SAMPLE_PEOPLE, ...SAMPLE_ADDRESSES]) {
      expect("matched_name" in row, row.label).toBe(false);
    }
    for (const row of SAMPLE_PEOPLE) {
      const states = row.related.businesses.items.flatMap(
        item => SAMPLE_SUGGESTIONS.find(b => b.label === item.label)!.states,
      );
      expect(row.states, row.label).toEqual([...new Set(states)].sort());
    }
    const dana = SAMPLE_PEOPLE.find(row => row.label === "Dana Whitfield")!;
    expect(dana.states).toEqual([
      "AZ",
      "CA",
      "MD",
      "NJ",
      "NV",
      "NY",
      "OH",
      "OR",
      "PA",
      "WV",
    ]);
  });

  it("name, on each business under a person, the role they hold, and under an address, how it is listed there, never the former role key", () => {
    for (const row of SAMPLE_PEOPLE) {
      for (const item of row.related.businesses.items) {
        expect(PERSON_ROLES, item.label).toContain(item.role);
        expect("listed_as" in item, item.label).toBe(false);
      }
    }
    for (const row of SAMPLE_ADDRESSES) {
      for (const item of row.related.businesses.items) {
        expect(ADDRESS_LISTINGS, item.label).toContain(item.listed_as);
        expect("role" in item, item.label).toBe(false);
      }
    }
  });
});

describe("the sample businesses' officers and addresses", () => {
  it("each name the role they hold, or how it is listed, with no token and no former role key", () => {
    for (const business of SAMPLE_SUGGESTIONS) {
      for (const item of business.related.people.items) {
        expect(PERSON_ROLES, item.label).toContain(item.role);
        expect(Object.keys(item).sort(), item.label).toEqual([
          "highlight",
          "label",
          "matched",
          "role",
          "type",
        ]);
      }
      for (const item of business.related.addresses.items) {
        expect(ADDRESS_LISTINGS, item.label).toContain(item.listed_as);
        expect(Object.keys(item).sort(), item.label).toEqual([
          "highlight",
          "label",
          "listed_as",
          "matched",
          "type",
        ]);
      }
    }
  });

  it("spell a registered agent's office as the contract does", () => {
    const dover = SAMPLE_ADDRESSES.find(
      row => row.components.city === "Dover",
    )!;

    expect(dover.related.businesses.items.map(item => item.listed_as)).toEqual([
      "registered_office",
      "registered_office",
      "registered_office",
    ]);
  });
});

describe("the typo the Styling preview shows", () => {
  const all = ["people", "addresses"] as const;
  const corrected = (parts: readonly { text: string; corrected?: true }[]) =>
    parts.filter(part => part.corrected === true).map(part => part.text);

  it("is one business among the rows the preview opens with, two letters of the word typed swapped", () => {
    const shown = sampleRows({ limit: DEFAULT_LIMIT, include: [...all] });
    const typoed = shown.filter(row => corrected(row.highlight).length > 0);

    expect(typoed.map(row => row.label)).toEqual([
      "HARBRO CONCRETE SUPPLY, INC.",
    ]);
    // "harbor" typed, HARBRO stored: the two letters swapped, side by side, are
    // what the search corrected, one run of two.
    expect(corrected(typoed[0]!.highlight)).toEqual(["RO"]);
    expect(typoed[0]!.highlight.map(part => part.text).join("")).toBe(
      typoed[0]!.label,
    );
  });

  it("carries the highlight the service would send, parts tidied as its own", () => {
    const row = sampleRows({ limit: 20, include: [...all] }).find(
      each => corrected(each.highlight).length > 0,
    )!;

    expect(row.highlight).toEqual(serviceHighlightFor(row.label, tokens));
    expect(row.highlight).toContainEqual({
      text: "RO",
      matched: false,
      corrected: true,
    });
  });

  it("is the business as it was but for its name: same count of rows, same fields", () => {
    const rows = sampleRows({ limit: 20, include: [...all] });
    const supply = SAMPLE_SUGGESTIONS.find(
      row => row.label === "HARBOR CONCRETE SUPPLY, INC.",
    )!;
    const typoed = rows.find(row => row.label.startsWith("HARBRO"))!;

    expect(rows).toHaveLength(SAMPLE_SUGGESTIONS.length);
    expect(typoed.states).toEqual(supply.states);
    expect(typoed.structure).toBe(supply.structure);
    expect(typoed.domicile_state).toBe(supply.domicile_state);
    expect(typoed.related).toEqual(supply.related);
  });

  it("is one person among those the preview opens with", () => {
    const shown = samplePeople(DEFAULT_LIMIT);
    const typoed = shown.filter(row => corrected(row.highlight).length > 0);

    expect(shown).toHaveLength(DEFAULT_LIMIT);
    expect(typoed.map(row => row.label)).toEqual(["Daan Okafor"]);
    // "dana" typed, Daan stored: the two letters swapped, side by side.
    expect(corrected(typoed[0]!.highlight)).toEqual(["an"]);
    expect(typoed[0]!.highlight.map(part => part.text).join("")).toBe(
      typoed[0]!.label,
    );
    expect(samplePeople(20)).toHaveLength(SAMPLE_PEOPLE.length);
  });

  it("leaves the lists the sample API and the home page's reel answer from as they were", () => {
    // These carry no corrected letter: a typo shown on the home page, or a
    // name the made-up API finds that the real one does not, would be a lie.
    for (const row of [
      ...SAMPLE_SUGGESTIONS,
      ...SAMPLE_PEOPLE,
      ...SAMPLE_ADDRESSES,
    ]) {
      expect(corrected(row.highlight ?? []), row.label).toEqual([]);
    }
    expect(SAMPLE_PEOPLE.map(row => row.label)).toContain("Dana Okafor");
    expect(SAMPLE_PEOPLE.map(row => row.label)).not.toContain("Daan Okafor");
  });
});
