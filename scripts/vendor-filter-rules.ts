// Vendors the two fixtures the autocomplete service, the API and this SDK share
// about filters: the rule sets a session may carry and, for each, whether a
// query with some filters is refused, sent or sent short (`filter_rules.json`),
// and how a query's characters are counted against a stem
// (`filter_counts.json`). They land in contracts/filter-rules.json and
// contracts/filter-counts.json, with where they came from in
// contracts/filter-rules.source.json.
//
//   pnpm contracts:filter-rules path/to/fixtures <osiris-app commit>
//   pnpm contracts:filter-rules --check
//
// The directory holds both files under the names the service gives them.
// `--check` fetches each file at the pinned commit with `gh` and fails when a
// vendored copy differs from it.

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const REPOSITORY = "osiris-ratings/osiris-app";
const FIXTURES = "crates/autocomplete/tests/fixtures";
/** The service's file name, and where this repository keeps it. */
const FILES = [
  { upstream: "filter_rules.json", vendored: "filter-rules.json" },
  { upstream: "filter_counts.json", vendored: "filter-counts.json" },
] as const;
const contracts = (name: string) =>
  new URL(`../contracts/${name}`, import.meta.url);
const sourceFile = contracts("filter-rules.source.json");

interface Pinned {
  repository: string;
  commit: string;
  files: Record<string, { path: string; blob: string }>;
}

/** The id git gives a file's content: what `gh` and `git` call its blob. */
function blobOf(content: Buffer): string {
  return createHash("sha1")
    .update(`blob ${content.length}\0`)
    .update(content)
    .digest("hex");
}

const [first, commit] = process.argv.slice(2);

if (first === "--check") {
  const pinned = JSON.parse(readFileSync(sourceFile, "utf8")) as Pinned;
  let failed = false;
  for (const { vendored } of FILES) {
    const file = pinned.files[vendored];
    if (file === undefined) {
      console.error(
        `contracts/filter-rules.source.json does not name ${vendored}`,
      );
      failed = true;
      continue;
    }
    const upstream = execFileSync(
      "gh",
      [
        "api",
        `repos/${pinned.repository}/contents/${file.path}?ref=${pinned.commit}`,
        "-H",
        "Accept: application/vnd.github.raw",
      ],
      { maxBuffer: 64 * 1024 * 1024 },
    );
    if (!readFileSync(contracts(vendored)).equals(upstream)) {
      console.error(
        `contracts/${vendored} differs from ${pinned.repository}@${pinned.commit.slice(0, 9)}:${file.path}`,
      );
      failed = true;
    }
  }
  if (failed) process.exit(1);
  console.log(`matches ${pinned.repository}@${pinned.commit.slice(0, 9)}`);
} else {
  if (
    first === undefined ||
    commit === undefined ||
    !/^[0-9a-f]{40}$/.test(commit)
  ) {
    console.error(
      "usage: pnpm contracts:filter-rules <directory holding filter_rules.json and filter_counts.json> <40-character osiris-app commit>\n       pnpm contracts:filter-rules --check",
    );
    process.exit(2);
  }
  const files: Pinned["files"] = {};
  for (const { upstream, vendored } of FILES) {
    const content = readFileSync(join(first, upstream));
    JSON.parse(content.toString("utf8"));
    writeFileSync(contracts(vendored), content);
    files[vendored] = {
      path: `${FIXTURES}/${upstream}`,
      blob: blobOf(content),
    };
  }
  const pinned: Pinned = { repository: REPOSITORY, commit, files };
  writeFileSync(sourceFile, `${JSON.stringify(pinned, null, 2)}\n`);
  console.log(
    `wrote ${FILES.map(f => f.vendored).join(" and ")} and ${sourceFile.pathname}`,
  );
}
