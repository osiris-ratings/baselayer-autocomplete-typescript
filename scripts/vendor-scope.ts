// Vendors the session scope fixture (the routes, the relations and which
// relations each route's rows carry) into contracts/autocomplete-scope.json.
//
//   pnpm contracts:scope path/to/autocomplete_scope.json

import { readFileSync, writeFileSync } from "node:fs";

import { publicScope, vendoredJson } from "./contracts.ts";

const source = process.argv[2];
if (source === undefined) {
  console.error("usage: pnpm contracts:scope <autocomplete_scope.json>");
  process.exit(2);
}
const fixture = JSON.parse(readFileSync(source, "utf8")) as Record<
  string,
  unknown
>;
const target = new URL("../contracts/autocomplete-scope.json", import.meta.url);
writeFileSync(target, vendoredJson(publicScope(fixture)));
console.log(`wrote ${target.pathname}`);
