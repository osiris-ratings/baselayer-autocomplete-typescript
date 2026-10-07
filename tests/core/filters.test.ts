import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  FILTER_PARAMS,
  LEGAL_RELATIONS,
  ROUTES,
  ROUTE_NAMES,
  buildSuggestUrl,
  filterParams,
  hasFilters,
  type RouteQuery,
} from "@baselayer-sdk/autocomplete";

const spec = JSON.parse(
  readFileSync(
    join(__dirname, "../../contracts/autocomplete-openapi.json"),
    "utf8",
  ),
) as {
  paths: Record<string, { get?: { parameters?: { name: string }[] } }>;
};

/** The parameters a route takes besides `q`, `limit` and `include`, per the contract. */
function contractFilters(path: string): string[] | null {
  const parameters = spec.paths[path]?.get?.parameters;
  if (parameters === undefined) {
    return null;
  }
  return parameters
    .map(({ name }) => name)
    .filter(name => !["q", "limit", "include"].includes(name));
}

const RELATION_OF_PREFIX: Record<string, string> = {
  person: "people",
  address: "addresses",
  business: "businesses",
};

describe("the filters each route takes", () => {
  it("sends only parameters the contract lists for the route", () => {
    for (const route of ROUTE_NAMES) {
      const served = contractFilters(ROUTES[route].path);
      if (served === null) {
        continue;
      }
      for (const { param } of FILTER_PARAMS[route]) {
        expect(served, `${route} ${param}`).toContain(param);
      }
    }
  });

  it("takes exactly the people route's one filter", () => {
    expect(FILTER_PARAMS.people.map(({ param }) => param)).toEqual(
      contractFilters("/autocomplete/people"),
    );
  });

  it("takes exactly the addresses route's one filter, its own state", () => {
    expect(FILTER_PARAMS.addresses.map(({ param }) => param)).toEqual(
      contractFilters("/autocomplete/addresses"),
    );
  });

  it("names the relation each filter touches, which its route's rows may carry", () => {
    for (const route of ROUTE_NAMES) {
      for (const { param, relation } of FILTER_PARAMS[route]) {
        const prefix = param.includes(".") ? param.split(".")[0]! : null;
        expect(relation, param).toBe(
          prefix === null ? null : RELATION_OF_PREFIX[prefix],
        );
        if (relation !== null) {
          expect(LEGAL_RELATIONS[route], `${route} ${param}`).toContain(
            relation,
          );
        }
      }
    }
  });
});

describe("filterParams", () => {
  it("sends a person row's business state as one comma list", () => {
    expect(
      filterParams("people", { business: { state: ["CA", "DE"] } }),
    ).toEqual([["business.state", "CA,DE"]]);
  });

  it("sends an address route's state as one comma list", () => {
    expect(filterParams("addresses", { state: ["DE", "NY"] })).toEqual([
      ["state", "DE,NY"],
    ]);
  });

  it("never sends a filter its route does not take, even from untyped data", () => {
    const stray = {
      state: ["CA"],
      business: { name: "apple", state: ["CA"] },
      address: { city: "Austin" },
      person: { name: "dana" },
    } as unknown as RouteQuery<"people">["filters"];

    expect(filterParams("people", stray)).toEqual([["business.state", "CA"]]);
    expect(
      filterParams(
        "addresses",
        stray as unknown as RouteQuery<"addresses">["filters"],
      ),
    ).toEqual([["state", "CA"]]);
  });

  it("counts only the filters a route takes", () => {
    expect(hasFilters("people", { business: { state: ["CA"] } })).toBe(true);
    expect(hasFilters("people", { business: { state: [] } })).toBe(false);
    expect(
      hasFilters("people", {
        state: ["CA"],
      } as unknown as RouteQuery<"people">["filters"]),
    ).toBe(false);
    expect(hasFilters("businesses", { person: { name: "dana" } })).toBe(true);
  });
});

describe("buildSuggestUrl on the people and addresses routes", () => {
  it("asks the people route with its filter", () => {
    const url = new URL(
      buildSuggestUrl("https://api.test/", "people", {
        q: "dana whitfield",
        include: ["businesses"],
        filters: { business: { state: ["PA"] } },
      }),
    );

    expect(url.pathname).toBe("/autocomplete/people");
    expect([...url.searchParams]).toEqual([
      ["q", "dana whitfield"],
      ["include", "businesses"],
      ["business.state", "PA"],
    ]);
  });

  it("asks the addresses route with its state", () => {
    const url = new URL(
      buildSuggestUrl("https://api.test", "addresses", {
        q: "1200 river rd",
        filters: { state: ["PA"] },
      }),
    );

    expect(url.pathname).toBe("/autocomplete/addresses");
    expect([...url.searchParams]).toEqual([
      ["q", "1200 river rd"],
      ["state", "PA"],
    ]);
  });

  it("types each route's filters as exactly what it takes", () => {
    const people: RouteQuery<"people"> = {
      q: "dana",
      // @ts-expect-error: a person row has no state of its own.
      filters: { state: ["PA"] },
    };
    const byName: RouteQuery<"people"> = {
      q: "dana",
      // @ts-expect-error: the people route filters businesses by state only.
      filters: { business: { name: "harbor" } },
    };
    const addresses: RouteQuery<"addresses"> = {
      q: "1200 river",
      // @ts-expect-error: the addresses route takes no relation filter.
      filters: { person: { name: "dana" } },
    };

    expect([people, byName, addresses]).toHaveLength(3);
  });
});
