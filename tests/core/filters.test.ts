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

  it("takes exactly the people route's filters, in the contract's order", () => {
    expect(FILTER_PARAMS.people.map(({ param }) => param)).toEqual(
      contractFilters("/autocomplete/people"),
    );
  });

  it("takes exactly the addresses route's filters, its own state first", () => {
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

  it("sends a person row's business name and address text after its business state, in the contract's order", () => {
    expect(
      filterParams("people", {
        address: { text: "77 quillback ln" },
        business: { name: "harbor concrete", state: ["PA"] },
      }),
    ).toEqual([
      ["business.state", "PA"],
      ["business.name", "harbor concrete"],
      ["address.text", "77 quillback ln"],
    ]);
  });

  it("sends an address row's person and business names after its state, in the contract's order", () => {
    expect(
      filterParams("addresses", {
        business: { name: "quillback holdings" },
        person: { name: "dana" },
        state: ["OR"],
      }),
    ).toEqual([
      ["state", "OR"],
      ["person.name", "dana"],
      ["business.name", "quillback holdings"],
    ]);
  });

  it("sends no filter for an empty or blank name", () => {
    expect(
      filterParams("people", {
        business: { name: "  " },
        address: { text: "" },
      }),
    ).toEqual([]);
    expect(
      filterParams("addresses", {
        person: { name: "" },
        business: { name: " " },
      }),
    ).toEqual([]);
  });

  it("never sends a filter its route does not take, even from untyped data", () => {
    const stray = {
      state: ["CA"],
      domicileState: "DE",
      business: { state: ["CA"], city: "Erie" },
      address: { city: "Austin" },
      person: { role: "officer" },
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
    expect(hasFilters("people", { address: { text: "77 quillback" } })).toBe(
      true,
    );
    expect(hasFilters("addresses", { person: { name: " " } })).toBe(false);
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

  it("asks the people route with every filter it takes, once each, in order", () => {
    const url = new URL(
      buildSuggestUrl("https://api.test", "people", {
        q: "dana",
        filters: {
          address: { text: "77 quillback ln" },
          business: { name: "harbor", state: ["PA", "OH"] },
        },
      }),
    );

    expect([...url.searchParams]).toEqual([
      ["q", "dana"],
      ["business.state", "PA,OH"],
      ["business.name", "harbor"],
      ["address.text", "77 quillback ln"],
    ]);
  });

  it("asks the addresses route with every filter it takes, once each, in order", () => {
    const url = new URL(
      buildSuggestUrl("https://api.test", "addresses", {
        q: "77 quillback",
        filters: {
          business: { name: "quillback holdings" },
          person: { name: "dana" },
          state: ["OR"],
        },
      }),
    );

    expect([...url.searchParams]).toEqual([
      ["q", "77 quillback"],
      ["state", "OR"],
      ["person.name", "dana"],
      ["business.name", "quillback holdings"],
    ]);
  });

  it("asks the addresses route with its state", () => {
    const url = new URL(
      buildSuggestUrl("https://api.test", "addresses", {
        q: "1200 tallowmere rd",
        filters: { state: ["PA"] },
      }),
    );

    expect(url.pathname).toBe("/autocomplete/addresses");
    expect([...url.searchParams]).toEqual([
      ["q", "1200 tallowmere rd"],
      ["state", "PA"],
    ]);
  });

  it("types each route's filters as exactly what it takes", () => {
    const people: RouteQuery<"people"> = {
      q: "dana",
      filters: {
        business: { state: ["PA"], name: "harbor" },
        address: { text: "77 quillback ln" },
      },
    };
    const addresses: RouteQuery<"addresses"> = {
      q: "77 quillback",
      filters: {
        state: ["OR"],
        person: { name: "dana" },
        business: { name: "quillback" },
      },
    };
    const ownState: RouteQuery<"people"> = {
      q: "dana",
      // @ts-expect-error: a person row has no state of its own.
      filters: { state: ["PA"] },
    };
    const byPerson: RouteQuery<"people"> = {
      q: "dana",
      // @ts-expect-error: the people route filters by business and address, not by person.
      filters: { person: { name: "dana" } },
    };
    const byCity: RouteQuery<"people"> = {
      q: "dana",
      // @ts-expect-error: an address filters a person by its text only.
      filters: { address: { city: "Erie" } },
    };
    const byAddress: RouteQuery<"addresses"> = {
      q: "77 quillback",
      // @ts-expect-error: the addresses route filters by person and business, not by address.
      filters: { address: { text: "77 quillback" } },
    };

    expect([
      people,
      addresses,
      ownState,
      byPerson,
      byCity,
      byAddress,
    ]).toHaveLength(6);
  });
});
