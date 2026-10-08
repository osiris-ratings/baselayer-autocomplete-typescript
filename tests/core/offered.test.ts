import { describe, expect, it } from "vitest";

import {
  DEFAULT_SESSION_SCOPE,
  allowedFilters,
  offeredRoutes,
  type SessionScope,
} from "@baselayer-sdk/autocomplete";

const scope = (routes: SessionScope["routes"]): SessionScope => ({
  routes,
  maxLimit: 20,
});

describe("offeredRoutes", () => {
  it("offers businesses alone to a grant without a scope", () => {
    expect(offeredRoutes(DEFAULT_SESSION_SCOPE)).toEqual(["businesses"]);
  });

  it("offers every route the scope reaches, in the SDK's order", () => {
    expect(
      offeredRoutes(
        scope({
          addresses: ["businesses", "people"],
          people: ["businesses"],
          businesses: [],
        }),
      ),
    ).toEqual(["businesses", "people", "addresses"]);
  });

  it("offers a person or address search only where its businesses can be picked", () => {
    // A pick is a business: a person row without its businesses has nothing
    // to pick from.
    expect(
      offeredRoutes(
        scope({ people: ["addresses"], addresses: ["businesses"] }),
      ),
    ).toEqual(["addresses"]);
  });

  it("offers nothing to a scope that names no route it knows", () => {
    expect(offeredRoutes(scope({}))).toEqual([]);
  });
});

describe("allowedFilters", () => {
  it("allows a route's direct filters whatever its relations", () => {
    expect(
      allowedFilters(scope({ businesses: [] }), "businesses").map(
        ({ param }) => param,
      ),
    ).toEqual(["state", "domicile_state"]);
    expect(
      allowedFilters(scope({ addresses: ["businesses"] }), "addresses").map(
        ({ param }) => param,
      ),
    ).toEqual(["state"]);
  });

  it("allows a relation filter only where the scope grants its relation", () => {
    expect(
      allowedFilters(scope({ businesses: ["addresses"] }), "businesses").map(
        ({ param }) => param,
      ),
    ).toEqual([
      "state",
      "domicile_state",
      "address.text",
      "address.city",
      "address.postal_code",
      "address.state",
    ]);
    expect(
      allowedFilters(scope({ people: ["businesses"] }), "people").map(
        ({ param }) => param,
      ),
    ).toEqual(["business.state"]);
    expect(allowedFilters(scope({ people: ["addresses"] }), "people")).toEqual(
      [],
    );
  });

  it("allows nothing on a route the scope leaves out", () => {
    expect(allowedFilters(DEFAULT_SESSION_SCOPE, "addresses")).toEqual([]);
  });
});
