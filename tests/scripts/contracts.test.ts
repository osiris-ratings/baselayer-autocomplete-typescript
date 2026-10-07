import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  publicAutocompleteSpec,
  publicScope,
  vendoredJson,
} from "../../scripts/contracts.ts";

describe("publicAutocompleteSpec", () => {
  it("names the autocomplete service wherever the spec says only the service", () => {
    const spec = {
      description: "Sealed by the service, so a client cannot read it.",
      nested: [
        { text: "It means the service stopped looking." },
        { text: "It reaches an older service as an unsealed item." },
      ],
    };

    expect(publicAutocompleteSpec(spec)).toEqual({
      description:
        "Sealed by the autocomplete service, so a client cannot read it.",
      nested: [
        { text: "It means the autocomplete service stopped looking." },
        {
          text: "It reaches an older autocomplete service as an unsealed item.",
        },
      ],
    });
  });

  it("drops the server-side class an error envelope is named after", () => {
    expect(
      publicAutocompleteSpec({
        description:
          "The API's catalog error envelope (`some_package.APIError`).",
      }),
    ).toEqual({ description: "The API's catalog error envelope." });
  });

  it("leaves what it does not rewrite exactly as it was", () => {
    const spec = {
      openapi: "3.1.0",
      enum: ["exact", "strong", "partial"],
      count: 3,
      nullable: null,
      flag: true,
      text: "The autocomplete service answers; a service-level note stays.",
    };

    expect(publicAutocompleteSpec(spec)).toEqual(spec);
  });
});

describe("publicScope", () => {
  const fixture = {
    $comment: ["Who reads this file, by their internal names."],
    legal_relations: {
      people: ["addresses", "businesses"],
      businesses: ["addresses", "people"],
      addresses: ["businesses", "people"],
    },
    relations: ["addresses", "businesses", "people"],
    routes: ["addresses", "businesses", "people"],
  };

  it("keeps the routes, the relations and the legal table, and nothing else", () => {
    const scope = publicScope(fixture);

    expect(Object.keys(scope)).toEqual([
      "routes",
      "relations",
      "legal_relations",
    ]);
    expect(scope.routes).toEqual(["addresses", "businesses", "people"]);
    expect(scope.relations).toEqual(["addresses", "businesses", "people"]);
    expect(scope.legal_relations).toEqual(fixture.legal_relations);
  });

  it("refuses a fixture that lacks one of the three", () => {
    const withoutRoutes: Record<string, unknown> = { ...fixture };
    delete withoutRoutes.routes;

    expect(() => publicScope(withoutRoutes)).toThrow("routes");
  });

  it("refuses a legal table naming a route or a relation the lists lack", () => {
    expect(() =>
      publicScope({
        ...fixture,
        legal_relations: { ...fixture.legal_relations, liens: ["people"] },
      }),
    ).toThrow("liens");
    expect(() =>
      publicScope({
        ...fixture,
        legal_relations: { ...fixture.legal_relations, people: ["liens"] },
      }),
    ).toThrow("liens");
  });
});

describe("vendoredJson", () => {
  it("indents by two and escapes every character past ASCII, as upstream spells it", () => {
    expect(vendoredJson({ dash: "a — b", plain: "ok" })).toBe(
      '{\n  "dash": "a \\u2014 b",\n  "plain": "ok"\n}\n',
    );
  });

  it("reads back as the value it wrote", () => {
    const value = { text: "café — naïve", list: [1, null, true] };

    expect(JSON.parse(vendoredJson(value))).toEqual(value);
  });
});

describe("the vendored autocomplete spec", () => {
  // The two descriptions upstream once wrote for its own readers. Held to
  // their public text exactly, so any change to them is a deliberate update
  // here, read before it ships.
  const vendored = JSON.parse(
    readFileSync(
      join(__dirname, "../../contracts/autocomplete-openapi.json"),
      "utf8",
    ),
  ) as {
    components: {
      schemas: Record<
        string,
        {
          description?: string;
          properties?: Record<string, { description?: string }>;
        }
      >;
    };
  };
  const { schemas } = vendored.components;

  it("describes a related item's token in exactly its public words", () => {
    expect(schemas.RelatedItem?.properties?.token?.description).toBe(
      [
        "Opaque handle for this row, sealed the way the suggestion's own `token` is",
        "and bound to the same organization and fifteen minutes. A business's handle,",
        "on whatever row it is, is a `business_token` `POST /searches` redeems; nothing",
        "redeems a person's or an address's handle yet. Null when the autocomplete service cannot",
        "name the row: its id was unreadable, or it is a kind of row this service",
        "version cannot seal yet.",
      ].join("\n"),
    );
  });

  it("describes the error envelope in exactly its public words", () => {
    expect(schemas.ErrorEnvelope?.description).toBe(
      "The error envelope the API answers with: a numeric `code`, a `message`, and\n`metadata` that names the reason.",
    );
  });
});
