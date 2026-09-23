// Vendors `POST /autocomplete/sessions` out of the API's public OpenAPI
// document into contracts/sessions-openapi.json: the operation, the schemas
// it reaches and its security scheme, nothing else.
//
//   task generate:openapi:public          # in osiris-app: public_openapi.json
//   pnpm contracts:sessions path/to/public_openapi.json

import { readFileSync, writeFileSync } from "node:fs";

import {
  extractOperation,
  type OpenApiDocument,
} from "../site/api/spec/assemble.ts";

const source = process.argv[2];
if (source === undefined) {
  console.error("usage: pnpm contracts:sessions <public_openapi.json>");
  process.exit(2);
}
const document = JSON.parse(readFileSync(source, "utf8")) as OpenApiDocument;
const extracted = extractOperation(document, "/autocomplete/sessions", "post");
const target = new URL("../contracts/sessions-openapi.json", import.meta.url);
writeFileSync(target, `${JSON.stringify(extracted, null, 2)}\n`);
console.log(`wrote ${target.pathname}`);
