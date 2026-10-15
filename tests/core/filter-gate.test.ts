import { describe, expect, it } from "vitest";

import {
  charsUntilFilters,
  fallbackFilterRules,
  type FilterRule,
} from "@baselayer-sdk/autocomplete";

// The gate on rules written out here. The service's own cases, which hold it to
// what the service does, are in `filter-rules-fixture.test.ts`.

describe("fallbackFilterRules", () => {
  it("is today's service rules, with the grant's stem", () => {
    expect(fallbackFilterRules(5)).toEqual({
      businesses: {
        minStem: 5,
        count: "stem",
        gated: "all",
        shortAllowedWith: [],
      },
      people: {
        minStem: 5,
        count: "person_name",
        gated: "all",
        shortAllowedWith: ["business.name"],
      },
      addresses: {
        minStem: 5,
        count: "stem",
        gated: "all",
        shortAllowedWith: [],
      },
    });
  });
});

describe("charsUntilFilters, on a rule that gates only some filters", () => {
  const rule: FilterRule = {
    minStem: 5,
    count: "stem",
    gated: ["person.name"],
    shortAllowedWith: [],
  };

  it("lets a short query through with a filter the rule does not gate", () => {
    expect(
      charsUntilFilters(
        "businesses",
        { q: "hal", filters: { state: ["DE"] } },
        rule,
      ),
    ).toBe(0);
  });

  it("holds it for one the rule gates", () => {
    expect(
      charsUntilFilters(
        "businesses",
        { q: "hal", filters: { person: { name: "dana" } } },
        rule,
      ),
    ).toBe(2);
  });
});

describe("a stem no name can reach", () => {
  const people = (minStem: number): FilterRule => ({
    minStem,
    count: "person_name",
    gated: "all",
    shortAllowedWith: [],
  });
  const name = (length: number) => ({
    q: "a".repeat(length),
    filters: { business: { state: ["DE"] } },
  });

  it("is met by the longest name the people count reports, 255", () => {
    expect(charsUntilFilters("people", name(255), people(256))).toBe(0);
    expect(charsUntilFilters("people", name(254), people(256))).toBe(1);
  });

  it("is 256 for the text businesses and addresses count, the longest query there is", () => {
    const stem: FilterRule = { ...people(256), count: "stem" };

    expect(
      charsUntilFilters(
        "addresses",
        { q: "a".repeat(256), filters: { state: ["DE"] } },
        stem,
      ),
    ).toBe(0);
  });
});
