// Vendors the filter rules fixture the autocomplete service, the API and this
// SDK share (the rule sets a session may carry, and for each, whether a query
// with some filters is refused, sent or sent short) into
// contracts/filter-rules.json, with where it came from in
// contracts/filter-rules.source.json.
//
//   pnpm contracts:filter-rules path/to/filter_rules.json <osiris-app commit>
//   pnpm contracts:filter-rules --check
//
// `--check` fetches the file at the pinned commit with `gh` and fails when the
// vendored copy differs from it.

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const REPOSITORY = "osiris-ratings/osiris-app";
const PATH = "crates/autocomplete/tests/fixtures/filter_rules.json";
const target = new URL("../contracts/filter-rules.json", import.meta.url);
const sourceFile = new URL(
  "../contracts/filter-rules.source.json",
  import.meta.url,
);

/** The id git gives a file's content: what `gh` and `git` call its blob. */
function blobOf(content: Buffer): string {
  return createHash("sha1")
    .update(`blob ${content.length}\0`)
    .update(content)
    .digest("hex");
}

const [first, commit] = process.argv.slice(2);

if (first === "--check") {
  const pinned = JSON.parse(readFileSync(sourceFile, "utf8")) as {
    repository: string;
    path: string;
    commit: string;
    blob: string;
  };
  const upstream = execFileSync(
    "gh",
    [
      "api",
      `repos/${pinned.repository}/contents/${pinned.path}?ref=${pinned.commit}`,
      "-H",
      "Accept: application/vnd.github.raw",
    ],
    { maxBuffer: 64 * 1024 * 1024 },
  );
  const vendored = readFileSync(target);
  if (!vendored.equals(upstream)) {
    console.error(
      `contracts/filter-rules.json differs from ${pinned.repository}@${pinned.commit.slice(0, 9)}:${pinned.path}`,
    );
    process.exit(1);
  }
  console.log(`matches ${pinned.repository}@${pinned.commit.slice(0, 9)}`);
} else {
  if (
    first === undefined ||
    commit === undefined ||
    !/^[0-9a-f]{40}$/.test(commit)
  ) {
    console.error(
      "usage: pnpm contracts:filter-rules <filter_rules.json> <40-character osiris-app commit>\n       pnpm contracts:filter-rules --check",
    );
    process.exit(2);
  }
  const content = readFileSync(first);
  JSON.parse(content.toString("utf8"));
  writeFileSync(target, content);
  writeFileSync(
    sourceFile,
    `${JSON.stringify({ repository: REPOSITORY, path: PATH, commit, blob: blobOf(content) }, null, 2)}\n`,
  );
  console.log(`wrote ${target.pathname} and ${sourceFile.pathname}`);
}
