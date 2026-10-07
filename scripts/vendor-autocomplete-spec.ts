// Vendors the autocomplete service's OpenAPI document into
// contracts/autocomplete-openapi.json, worded for this repository (see
// publicAutocompleteSpec).
//
//   pnpm contracts:autocomplete path/to/openapi.json

import { readFileSync, writeFileSync } from "node:fs";

import { publicAutocompleteSpec, vendoredJson } from "./contracts.ts";

const source = process.argv[2];
if (source === undefined) {
  console.error("usage: pnpm contracts:autocomplete <openapi.json>");
  process.exit(2);
}
const spec: unknown = JSON.parse(readFileSync(source, "utf8"));
const target = new URL(
  "../contracts/autocomplete-openapi.json",
  import.meta.url,
);
writeFileSync(target, vendoredJson(publicAutocompleteSpec(spec)));
console.log(`wrote ${target.pathname}`);
