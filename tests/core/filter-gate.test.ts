import { describe, expect, it } from "vitest";

import {
  charsUntilFilters,
  fallbackFilterRules,
  type FilterRule,
  type Route,
} from "@baselayer-sdk/autocomplete";

import fixture from "./fixtures/filter-gate.json";

// Whether a query waits for its filters, per route, from the rules in force.
// The cases are shared with the service.

interface WireRule {
  count: "stem" | "person_name";
  gated: string[] | "all";
  short_allowed_with: string[];
}

interface Case {
  route: Route;
  q: string;
  filters: string[];
  min_stem: number;
  expect: "wait" | "send";
  missing?: number;
}

const wire = fixture.rules.fallback as Record<Route, WireRule>;
const cases = fixture.cases as Case[];

/** A query with the named wire parameters set, in the SDK's own shape. */
function ruleOf(route: Route, minStem: number): FilterRule {
  const rule = wire[route];
  return {
    minStem,
    count: rule.count,
    gated: rule.gated,
    shortAllowedWith: rule.short_allowed_with,
  };
}

const FILTER_VALUE: Record<string, unknown> = {
  state: ["DE"],
  domicile_state: "DE",
  "person.name": "dana",
  "person.role": "officer",
  "address.text": "1200 tallowmere",
  "address.city": "pittsburgh",
  "address.postal_code": "15212",
  "address.state": "PA",
  "business.state": ["DE"],
  "business.name": "osiris",
};

function filtersOf(params: string[]): object {
  const filters: Record<string, Record<string, unknown>> = {};
  const nest = (path: string[], value: unknown) => {
    if (path.length === 1) {
      (filters as Record<string, unknown>)[path[0]!] = value;
      return;
    }
    const [head, tail] = path as [string, string];
    filters[head] = { ...filters[head], [tail]: value };
  };
  for (const param of params) {
    const camel = param
      .split(".")
      .map((part, i) =>
        i === 0
          ? part.replace(/_(\w)/g, (_, c: string) => c.toUpperCase())
          : part.replace(/_(\w)/g, (_, c: string) => c.toUpperCase()),
      );
    nest(camel, FILTER_VALUE[param]);
  }
  return filters;
}

describe("charsUntilFilters, on today's rules", () => {
  it.each(cases)(
    "$route $q with $filters at a stem of $min_stem: $expect",
    ({ route, q, filters, min_stem, expect: answer, missing }) => {
      const lacking = charsUntilFilters(
        route,
        { q, filters: filtersOf(filters) },
        ruleOf(route, min_stem),
      );

      if (answer === "send") {
        expect(lacking).toBe(0);
      } else {
        expect(lacking).toBeGreaterThan(0);
        if (missing !== undefined) expect(lacking).toBe(missing);
      }
    },
  );
});

describe("fallbackFilterRules", () => {
  it("is today's service rules, with the grant's stem", () => {
    const rules = fallbackFilterRules(5);

    for (const route of ["businesses", "people", "addresses"] as const) {
      expect(rules[route]).toEqual(ruleOf(route, 5));
    }
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
