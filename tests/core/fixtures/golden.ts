import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A golden answer: what the autocomplete service sends, as the files under
 * `golden/` keep it (made-up names, `<sealed token>` for every token).
 */
export type GoldenName =
  | "businesses"
  | "businesses_filtered"
  | "people"
  | "addresses"
  | "invalid_request";

export function golden(name: GoldenName): unknown {
  return JSON.parse(
    readFileSync(join(__dirname, "golden", `${name}.json`), "utf8"),
  );
}
