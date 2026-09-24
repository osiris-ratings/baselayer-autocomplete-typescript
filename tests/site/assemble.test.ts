import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { parse } from "yaml";

import {
  applyOverlay,
  assembleReference,
  extractOperation,
  normalizeMarkdown,
  refsIn,
  type OpenApiDocument,
  type Overlay,
} from "../../site/api/spec/assemble";

const read = (path: string): unknown =>
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL(`../../${path}`, import.meta.url)),
      "utf8",
    ),
  );

const tier = read("contracts/tier-openapi.json") as OpenApiDocument;
const sessions = read("contracts/sessions-openapi.json") as OpenApiDocument;
const overlay = parse(
  readFileSync(
    fileURLToPath(
      new URL("../../contracts/autocomplete.overlay.yaml", import.meta.url),
    ),
    "utf8",
  ),
) as Overlay;

function doc(partial: Partial<OpenApiDocument>): OpenApiDocument {
  return {
    openapi: "3.1.0",
    info: { title: "t", version: "1" },
    paths: {},
    ...partial,
  };
}

describe("extractOperation", () => {
  const source = doc({
    servers: [{ url: "https://api.example.com/" }],
    paths: {
      "/a": {
        post: {
          tags: ["Internal"],
          summary: "A",
          security: [{ Key: [] }],
          responses: {
            "201": {
              description: "ok",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/A" },
                },
              },
            },
          },
        },
        get: { summary: "not this one", responses: {} },
      },
      "/b": { get: { summary: "B", responses: {} } },
    },
    components: {
      schemas: {
        A: {
          type: "object",
          properties: { b: { $ref: "#/components/schemas/B" } },
        },
        B: { type: "string" },
        Unused: { type: "string" },
      },
      securitySchemes: {
        Key: { type: "apiKey", in: "header", name: "X-Key" },
        Other: { type: "apiKey", in: "header", name: "X-Other" },
      },
    },
  });

  it("keeps the one operation, drops its tags, and takes every schema it reaches", () => {
    const out = extractOperation(source, "/a", "post");
    expect(Object.keys(out.paths)).toEqual(["/a"]);
    expect(Object.keys(out.paths["/a"]!)).toEqual(["post"]);
    expect(out.paths["/a"]!.post!.tags).toBeUndefined();
    expect(Object.keys(out.components!.schemas!).sort()).toEqual(["A", "B"]);
    expect(Object.keys(out.components!.securitySchemes!)).toEqual(["Key"]);
    expect(out.servers).toEqual([{ url: "https://api.example.com/" }]);
  });

  it("refuses an operation the document does not have", () => {
    expect(() => extractOperation(source, "/a", "delete")).toThrow(
      /delete \/a/,
    );
  });
});

describe("applyOverlay", () => {
  const base = doc({
    paths: {
      "/a": {
        get: {
          summary: "old",
          parameters: [{ name: "q", in: "query" }],
          responses: { "200": { description: "ok" } },
        },
      },
    },
  });

  it("merges objects, replaces primitives and appends to arrays", () => {
    const out = applyOverlay(base, {
      overlay: "1.0.0",
      info: { title: "o", version: "1" },
      actions: [
        {
          target: "$.paths['/a'].get",
          update: {
            summary: "new",
            parameters: [{ name: "Origin", in: "header" }],
            responses: { "401": { description: "no" } },
          },
        },
      ],
    });
    const op = out.paths["/a"]!.get!;
    expect(op.summary).toBe("new");
    expect(op.parameters!.map(p => p.name)).toEqual(["q", "Origin"]);
    expect(Object.keys(op.responses)).toEqual(["200", "401"]);
    expect(base.paths["/a"]!.get!.summary).toBe("old");
  });

  it("finds an array element by name", () => {
    const out = applyOverlay(base, {
      overlay: "1.0.0",
      info: { title: "o", version: "1" },
      actions: [
        {
          target: "$.paths['/a'].get.parameters[?(@.name=='q')]",
          update: { description: "the name" },
        },
      ],
    });
    expect(out.paths["/a"]!.get!.parameters![0]!.description).toBe("the name");
  });

  it("removes a target", () => {
    const out = applyOverlay(base, {
      overlay: "1.0.0",
      info: { title: "o", version: "1" },
      actions: [{ target: "$.paths['/a'].get.responses['200']", remove: true }],
    });
    expect(out.paths["/a"]!.get!.responses).toEqual({});
  });

  it("fails on a target that matches nothing, so a renamed route breaks the build", () => {
    expect(() =>
      applyOverlay(base, {
        overlay: "1.0.0",
        info: { title: "o", version: "1" },
        actions: [{ target: "$.paths['/gone'].get", update: { summary: "x" } }],
      }),
    ).toThrow(/\/gone/);
  });
});

describe("normalizeMarkdown", () => {
  it("turns reStructuredText literals into Markdown code", () => {
    expect(normalizeMarkdown("send ``X-Autocomplete-Session`` verbatim")).toBe(
      "send `X-Autocomplete-Session` verbatim",
    );
  });
});

describe("assembleReference", () => {
  const reference = assembleReference({ tier, sessions, overlay });

  it("documents exactly the two public routes", () => {
    expect(
      Object.entries(reference.paths).flatMap(([path, item]) =>
        Object.keys(item).map(method => `${method.toUpperCase()} ${path}`),
      ),
    ).toEqual(["POST /autocomplete/sessions", "GET /autocomplete/businesses"]);
  });

  it("resolves every reference it contains", () => {
    const schemas = reference.components?.schemas ?? {};
    for (const ref of refsIn(reference)) {
      expect(ref.startsWith("#/components/schemas/")).toBe(true);
      expect(schemas[ref.slice("#/components/schemas/".length)]).toBeDefined();
    }
  });

  it("names a security scheme for each route", () => {
    const schemes = reference.components?.securitySchemes ?? {};
    for (const item of Object.values(reference.paths)) {
      for (const op of Object.values(item)) {
        const names = (op.security ?? []).flatMap(s => Object.keys(s));
        expect(names.length).toBeGreaterThan(0);
        for (const name of names) expect(schemes[name]).toBeDefined();
      }
    }
  });

  it("gives every operation a tag the document declares", () => {
    const tags = new Set((reference.tags ?? []).map(t => t.name));
    for (const item of Object.values(reference.paths)) {
      for (const op of Object.values(item)) {
        expect(op.tags?.length).toBeGreaterThan(0);
        for (const tag of op.tags ?? []) expect(tags.has(tag)).toBe(true);
      }
    }
  });
});
