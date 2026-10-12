import { fileURLToPath } from "node:url";

import { BUSINESS_STRUCTURES } from "@baselayer-sdk/autocomplete";
import { describe, expect, it, vi } from "vitest";

import {
  FORMER_IDS,
  fieldRows,
  operations,
  requestBodyOf,
  schemaOf,
} from "../../site/api/model";

// The page's document, assembled from contracts/ as the build assembles it.
vi.mock("virtual:api-reference", async () => {
  const { buildReference } = await import("../../site/api/spec/plugin");
  return buildReference(fileURLToPath(new URL("../..", import.meta.url)));
});

describe("the reference's fields for a suggestion", () => {
  const route = operations.find(
    entry => entry.path === "/autocomplete/businesses",
  );
  const schema = schemaOf(route!.operation.responses["200"]!);
  const rows = fieldRows(schema!);
  const row = (path: string) => rows.find(candidate => candidate.path === path);

  it("describes a structure the autocomplete service may leave null, with every value it takes", () => {
    // The contract writes it as `oneOf: [null, $ref]`, with the description
    // on the second variant and the values on the schema it points at.
    const structure = row("suggestions[].structure");

    expect(structure?.type).toBe("enum or null");
    expect(structure?.required).toBe(false);
    expect(structure?.description).toMatch(/legal structure/);
    expect(structure?.values).toEqual([...BUSINESS_STRUCTURES]);
  });

  it("still reads a field's own description and values", () => {
    expect(row("suggestions[].label")?.description).toMatch(/Display-cased/);
    expect(row("suggestions[].match")?.values).toEqual([
      "exact",
      "strong",
      "partial",
    ]);
  });
});

describe("the reference's mint", () => {
  const mint = operations.find(
    entry => entry.path === "/autocomplete/sessions",
  )!.operation;
  const ROUTES = ["businesses", "people", "addresses"];

  it("has a request body, which may be left out, with its fields optional", () => {
    const body = requestBodyOf(mint);

    expect(body?.optional).toBe(true);
    expect(body?.description).toMatch(/body is optional/);
    const rows = fieldRows(body!.schema);
    expect(rows.map(row => row.path)).toEqual([
      "scope",
      "scope.routes",
      "scope.max_limit",
    ]);
    expect(rows.every(row => !row.required)).toBe(true);
  });

  it("says which routes a scope may name and which relations each lists, in the request and in the grant", () => {
    const request = fieldRows(requestBodyOf(mint)!.schema);
    const grant = fieldRows(schemaOf(mint.responses["201"]!)!);

    for (const rows of [request, grant]) {
      const routes = rows.find(row => row.path === "scope.routes");
      // A map: its keys are routes and each value lists relations.
      expect(routes?.keys).toEqual(ROUTES);
      expect(routes?.itemValues).toEqual(ROUTES);
      expect(routes?.values).toEqual([]);
      const limit = rows.find(row => row.path === "scope.max_limit");
      expect(limit?.range).toBe("1 to 20");
    }
  });

  it("gives a plain field no choices it does not have", () => {
    const grant = fieldRows(schemaOf(mint.responses["201"]!)!);
    const token = grant.find(row => row.path === "session_token");

    expect(token?.keys).toEqual([]);
    expect(token?.itemValues).toEqual([]);
    expect(token?.range).toBeNull();
  });
});

describe("the reference's autocomplete routes", () => {
  it("are named for what they do, autocomplete, a search being what a business token runs", () => {
    expect(
      operations
        .filter(
          entry =>
            entry.path.startsWith("/autocomplete/") && entry.method === "get",
        )
        .map(entry => [entry.id, entry.operation.summary]),
    ).toEqual([
      ["autocomplete-businesses", "Autocomplete businesses"],
      ["autocomplete-people", "Autocomplete people"],
      ["autocomplete-addresses", "Autocomplete addresses"],
    ]);
  });

  it("keeps each one's former id for the links that still use it", () => {
    const ids = new Set(operations.map(entry => entry.id));
    for (const [id, former] of Object.entries(FORMER_IDS)) {
      expect(ids.has(id)).toBe(true);
      expect(former).toMatch(/^search-/);
    }
  });
});
