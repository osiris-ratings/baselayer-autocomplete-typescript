import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  charsUntilParams,
  parseFilterRules,
  ruleFor,
  type Route,
} from "@baselayer-sdk/autocomplete";

// The service's own cases, shared with it and with the API: for each rule set a
// session may carry, whether a query with these filters is refused, sent, or
// sent short. The SDK's gate is held to every one.

interface RuleSet {
  filter_rules: Record<string, { min_stem: number }>;
  legacy_stem: number;
  min_query_chars: number;
  scope?: Route[];
}

interface Case {
  name: string;
  route: Route;
  q: string;
  times?: number;
  filters: Record<string, string>;
  rules: string;
  outcome: "refused" | "sent" | "sent_short";
  min_length?: number;
}

const fixture = JSON.parse(
  readFileSync(resolve(__dirname, "../../contracts/filter-rules.json"), "utf8"),
) as { version: number; rules: Record<string, RuleSet>; cases: Case[] };

/** The grant a session minted for `set` carries, as the SDK reads it. */
function grantOf(set: RuleSet) {
  const filterRules = parseFilterRules(set.filter_rules);
  return {
    filterMinStem: set.legacy_stem,
    ...(filterRules !== undefined ? { filterRules } : {}),
  };
}

describe("the filter rule sets", () => {
  it("are version 1", () => {
    expect(fixture.version).toBe(1);
  });

  it.each(Object.entries(fixture.rules))(
    "%s: the SDK reads every route's rule the service sent, and no other",
    (_, set) => {
      const read = grantOf(set).filterRules;

      expect(Object.keys(read ?? {}).sort()).toEqual(
        Object.keys(set.filter_rules).sort(),
      );
      for (const [route, rule] of Object.entries(set.filter_rules)) {
        expect(read?.[route as Route]?.minStem).toBe(rule.min_stem);
      }
    },
  );

  it.each(Object.entries(fixture.rules))(
    "%s: the legacy stem is the strictest route's",
    (_, set) => {
      expect(set.legacy_stem).toBe(
        Math.max(...Object.values(set.filter_rules).map(r => r.min_stem)),
      );
    },
  );
});

describe("the service's cases", () => {
  it.each(fixture.cases)("$rules, $name: $outcome", testCase => {
    const set = fixture.rules[testCase.rules]!;
    const rule = ruleFor(grantOf(set), testCase.route);
    const q =
      testCase.times !== undefined
        ? testCase.q.repeat(testCase.times)
        : testCase.q;
    // A blank value is no filter.
    const params = Object.entries(testCase.filters)
      .filter(([, value]) => value.trim() !== "")
      .map(([param]) => param);

    const lacking = charsUntilParams(q, params, rule);

    if (testCase.outcome === "refused") {
      expect(lacking).toBeGreaterThan(0);
      expect(rule.minStem).toBe(testCase.min_length);
    } else {
      expect(lacking).toBe(0);
    }
  });
});
