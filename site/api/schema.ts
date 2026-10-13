// A schema of the assembled document, followed to what it is: past a `$ref`
// into `components.schemas`, and past a `T | null` written as `anyOf` or
// `oneOf`. Given the schemas, so what reads it needs no document of its own.

import type { JsonSchema } from "./spec/assemble";

const SCHEMA_REF = "#/components/schemas/";

export type Schemas = Readonly<Record<string, JsonSchema>>;

export function resolveIn(schemas: Schemas, schema: JsonSchema): JsonSchema {
  const follow = (each: JsonSchema) =>
    each.$ref?.startsWith(SCHEMA_REF) === true
      ? (schemas[each.$ref.slice(SCHEMA_REF.length)] ?? each)
      : each;
  const resolved = follow(schema);
  const variants = resolved.anyOf ?? resolved.oneOf;
  const held = variants?.find(variant => variant.type !== "null");
  return held === undefined ? resolved : follow(held);
}
