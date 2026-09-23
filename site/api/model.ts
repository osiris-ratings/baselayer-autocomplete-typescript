// What the reference page draws, derived from the assembled document: the
// sections in order, each operation, and the rows of each schema.

import { document } from "virtual:api-reference";
import type { LanguageName } from "sugar-high";

import type {
  JsonSchema,
  Method,
  Operation,
  Response,
  Tag,
} from "./spec/assemble";

const METHODS: Method[] = ["get", "post", "put", "patch", "delete"];
const SCHEMA_REF = "#/components/schemas/";

export function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export interface OperationEntry {
  id: string;
  path: string;
  method: Method;
  operation: Operation;
}

export const operations: OperationEntry[] = Object.entries(
  document.paths,
).flatMap(([path, item]) =>
  METHODS.flatMap(method => {
    const operation = item[method];
    return operation === undefined
      ? []
      : [
          {
            id: slug(operation.summary ?? `${method} ${path}`),
            path,
            method,
            operation,
          },
        ];
  }),
);

export type Section =
  | { kind: "overview"; id: string; label: string }
  | { kind: "tag"; id: string; label: string; tag: Tag }
  | { kind: "operation"; id: string; label: string; entry: OperationEntry };

/**
 * Overview first, then each tag in document order: a tag with operations
 * contributes them, a trait tag (`x-traitTag`, Redoc's convention) is a
 * section of prose. An operation whose tags the document does not declare
 * still gets a section, last.
 */
export const sections: Section[] = (() => {
  const out: Section[] = [
    { kind: "overview", id: "overview", label: "Overview" },
  ];
  const placed = new Set<OperationEntry>();
  for (const tag of document.tags ?? []) {
    if (tag["x-traitTag"] === true) {
      out.push({ kind: "tag", id: slug(tag.name), label: tag.name, tag });
      continue;
    }
    for (const entry of operations) {
      if (
        !placed.has(entry) &&
        (entry.operation.tags ?? []).includes(tag.name)
      ) {
        placed.add(entry);
        out.push({
          kind: "operation",
          id: entry.id,
          label: entry.operation.summary ?? entry.path,
          entry,
        });
      }
    }
  }
  for (const entry of operations.filter(e => !placed.has(e))) {
    out.push({ kind: "operation", id: entry.id, label: entry.path, entry });
  }
  return out;
})();

function refName(schema: JsonSchema): string | null {
  return schema.$ref?.startsWith(SCHEMA_REF) === true
    ? schema.$ref.slice(SCHEMA_REF.length)
    : null;
}

function resolve(schema: JsonSchema): JsonSchema {
  const name = refName(schema);
  return name === null
    ? schema
    : (document.components?.schemas?.[name] ?? schema);
}

/** The variants of a `T | null` written as `anyOf`, without the null. */
function nonNull(schema: JsonSchema): JsonSchema[] {
  const variants = schema.anyOf ?? schema.oneOf;
  return variants === undefined
    ? [schema]
    : variants.filter(v => v.type !== "null");
}

export function describeType(schema: JsonSchema | undefined): string {
  if (schema === undefined) {
    return "string";
  }
  const resolved = resolve(schema);
  if (resolved.anyOf !== undefined || resolved.oneOf !== undefined) {
    const variants = (resolved.anyOf ?? resolved.oneOf)!;
    const nullable = variants.some(v => v.type === "null");
    const named = nonNull(resolved).map(describeType).join(" or ");
    return nullable ? `${named} or null` : named;
  }
  if (resolved.enum !== undefined) {
    return "enum";
  }
  if (resolved.properties !== undefined) {
    return "object";
  }
  const types = Array.isArray(resolved.type)
    ? resolved.type
    : resolved.type !== undefined
      ? [resolved.type]
      : ["object"];
  return types
    .map(t => (t === "array" ? `array of ${describeType(resolved.items)}` : t))
    .join(" or ");
}

export interface FieldRow {
  path: string;
  name: string;
  depth: number;
  type: string;
  required: boolean;
  description: string | undefined;
  values: string[];
  sameAs: string | null;
}

/** The object a property holds, directly or as its array's element. */
function nestedObject(
  property: JsonSchema,
): { schema: JsonSchema; array: boolean } | null {
  const target = resolve(nonNull(resolve(property))[0] ?? property);
  if (target.properties !== undefined) {
    return { schema: nonNull(resolve(property))[0] ?? property, array: false };
  }
  if (
    target.items !== undefined &&
    resolve(target.items).properties !== undefined
  ) {
    return { schema: target.items, array: true };
  }
  return null;
}

/**
 * Every field of a schema in the order the spec declares them, nested
 * fields under their parent. A named shape met a second time points at the
 * first rather than repeating (`related.addresses` has `related.people`'s).
 */
export function fieldRows(
  schema: JsonSchema,
  prefix = "",
  depth = 0,
  seen: Map<string, string> = new Map(),
): FieldRow[] {
  const resolved = resolve(schema);
  const rows: FieldRow[] = [];
  for (const [key, property] of Object.entries(resolved.properties ?? {})) {
    const path = prefix === "" ? key : `${prefix}.${key}`;
    const target = resolve(property);
    const nested = nestedObject(property);
    const shape = nested !== null ? refName(nested.schema) : null;
    const repeat = shape !== null ? (seen.get(shape) ?? null) : null;
    rows.push({
      path,
      name: key,
      depth,
      type: describeType(property),
      required: resolved.required?.includes(key) ?? false,
      description: property.description ?? target.description,
      values: (target.enum ?? []).map(String),
      sameAs: repeat,
    });
    if (nested === null || repeat !== null) {
      continue;
    }
    const childPath = nested.array ? `${path}[]` : path;
    if (shape !== null) {
      seen.set(shape, childPath);
    }
    rows.push(...fieldRows(nested.schema, childPath, depth + 1, seen));
  }
  return rows;
}

export function schemaOf(response: Response): JsonSchema | undefined {
  return response.content?.["application/json"]?.schema;
}

export function snippetLang(lang: string): LanguageName {
  switch (lang.toLowerCase()) {
    case "shell":
    case "bash":
    case "curl":
      return "shell";
    case "javascript":
    case "typescript":
    case "node":
      return "typescript";
    case "python":
      return "python";
    case "json":
      return "json";
    default:
      return "plaintext";
  }
}
