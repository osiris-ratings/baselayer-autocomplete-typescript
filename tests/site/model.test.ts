import { fileURLToPath } from "node:url";

import { BUSINESS_STRUCTURES } from "@baselayer-sdk/autocomplete";
import { describe, expect, it, vi } from "vitest";

import { fieldRows, operations, schemaOf } from "../../site/api/model";

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
