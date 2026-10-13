import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A small structural check of a value against the vendored contract
 * (`contracts/autocomplete-openapi.json`), standing in for a JSON Schema
 * validator the repo does not depend on. It reads the keywords the contract
 * uses (`$ref`, `type`, `enum`, `properties`, `required`, `items`, `oneOf`,
 * `minimum`) and throws on one it does not know, so a contract that grows a
 * keyword cannot pass unchecked.
 */

type Schema = Record<string, unknown>;

interface Contract {
  components: { schemas: Record<string, Schema> };
  paths: Record<string, Record<string, { responses: Record<string, unknown> }>>;
}

const contract = JSON.parse(
  readFileSync(
    join(__dirname, "../../../contracts/autocomplete-openapi.json"),
    "utf8",
  ),
) as Contract;

/** The keywords that say nothing about a value. */
const ANNOTATIONS = new Set([
  "description",
  "format",
  "maxLength",
  "discriminator",
]);

const CHECKED = new Set([
  "$ref",
  "type",
  "enum",
  "properties",
  "required",
  "items",
  "oneOf",
  "minimum",
]);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOfType(type: unknown, value: unknown): boolean {
  switch (type) {
    case "string":
    case "boolean":
      return typeof value === type;
    case "number":
      return typeof value === "number";
    case "integer":
      return Number.isInteger(value);
    case "null":
      return value === null;
    case "array":
      return Array.isArray(value);
    case "object":
      return isObject(value);
    default:
      throw new Error(`the contract uses a type this check lacks: ${type}`);
  }
}

/** A schema the contract names, as `components.schemas.<name>`. */
export function schemaNamed(name: string): Schema {
  const schema = contract.components.schemas[name];
  if (schema === undefined) {
    throw new Error(`the contract has no schema ${name}`);
  }
  return schema;
}

/** The schema a path's operation answers `status` with. */
export function responseSchema(path: string, status: number): Schema {
  const response = contract.paths[path]?.get?.responses[String(status)];
  const schema = (
    response as { content?: Record<string, { schema?: Schema }> } | undefined
  )?.content?.["application/json"]?.schema;
  if (schema === undefined) {
    throw new Error(`the contract has no ${status} body for ${path}`);
  }
  return schema;
}

function resolve(ref: string): Schema {
  const prefix = "#/components/schemas/";
  if (!ref.startsWith(prefix)) {
    throw new Error(`the contract uses a reference this check lacks: ${ref}`);
  }
  return schemaNamed(ref.slice(prefix.length));
}

function check(
  schema: Schema,
  value: unknown,
  path: string,
  found: string[],
): void {
  for (const keyword of Object.keys(schema)) {
    if (!CHECKED.has(keyword) && !ANNOTATIONS.has(keyword)) {
      throw new Error(
        `the contract uses a keyword this check lacks: ${keyword}`,
      );
    }
  }
  if (typeof schema.$ref === "string") {
    check(resolve(schema.$ref), value, path, found);
  }
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some(type => isOfType(type, value))) {
      found.push(`${path}: expected ${types.join(" or ")}`);
      return;
    }
  }
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    found.push(`${path}: expected one of ${schema.enum.join(", ")}`);
  }
  if (
    typeof schema.minimum === "number" &&
    typeof value === "number" &&
    value < schema.minimum
  ) {
    found.push(`${path}: expected at least ${schema.minimum}`);
  }
  if (Array.isArray(schema.oneOf)) {
    const matching = schema.oneOf.filter(branch => {
      const mismatches: string[] = [];
      check(branch as Schema, value, path, mismatches);
      return mismatches.length === 0;
    });
    if (matching.length !== 1) {
      found.push(`${path}: expected exactly one of ${schema.oneOf.length}`);
    }
  }
  if (isObject(value)) {
    const properties = (schema.properties ?? {}) as Record<string, Schema>;
    const required = (schema.required ?? []) as string[];
    for (const key of required) {
      if (!(key in value)) {
        found.push(`${path}.${key}: required`);
      }
    }
    for (const [key, entry] of Object.entries(value)) {
      const declared = properties[key];
      if (declared !== undefined) {
        check(declared, entry, `${path}.${key}`, found);
      } else if (schema.properties !== undefined) {
        found.push(`${path}.${key}: not declared`);
      }
    }
  }
  if (Array.isArray(value) && isObject(schema.items)) {
    value.forEach((entry, index) => {
      check(schema.items as Schema, entry, `${path}[${index}]`, found);
    });
  }
}

/**
 * What is wrong with `value` as `schema` reads it, one line per fault: a
 * wrong type, a value outside an enum, a missing `required` key, and a key the
 * schema does not declare (the contract leaves objects open, but a sample
 * that carries one has drifted from it).
 */
export function faultsAgainst(schema: Schema, value: unknown): string[] {
  const found: string[] = [];
  check(schema, value, "$", found);
  return found;
}
