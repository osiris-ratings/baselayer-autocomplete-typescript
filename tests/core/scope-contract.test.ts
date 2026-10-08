import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  LEGAL_RELATIONS,
  RELATIONS,
  ROUTES,
  ROUTE_NAMES,
} from "@baselayer-sdk/autocomplete";

// The session scope's names, as the API, the autocomplete service and this SDK
// all carry them. A route or a relation reaches this file before any mint can
// name it, so the SDK's tables must match it exactly, in both directions.
const contract = JSON.parse(
  readFileSync(
    join(__dirname, "../../contracts/autocomplete-scope.json"),
    "utf8",
  ),
) as {
  routes: string[];
  relations: string[];
  legal_relations: Record<string, string[]>;
};

const sorted = (names: readonly string[]) => [...names].sort();

describe("the session scope contract", () => {
  it("names exactly the routes the contract names", () => {
    expect(sorted(ROUTE_NAMES)).toEqual(sorted(contract.routes));
  });

  it("names exactly the relations the contract names", () => {
    expect(sorted(RELATIONS)).toEqual(sorted(contract.relations));
  });

  it("gives each route exactly the relations its rows may carry", () => {
    expect(sorted(Object.keys(LEGAL_RELATIONS))).toEqual(
      sorted(Object.keys(contract.legal_relations)),
    );
    for (const route of ROUTE_NAMES) {
      expect(sorted(LEGAL_RELATIONS[route]), route).toEqual(
        sorted(contract.legal_relations[route] ?? []),
      );
    }
  });

  it("describes every route, and each expands exactly its legal relations", () => {
    expect(sorted(Object.keys(ROUTES))).toEqual(sorted(ROUTE_NAMES));
    for (const route of ROUTE_NAMES) {
      expect(sorted(ROUTES[route].includes), route).toEqual(
        sorted(LEGAL_RELATIONS[route]),
      );
    }
  });
});
