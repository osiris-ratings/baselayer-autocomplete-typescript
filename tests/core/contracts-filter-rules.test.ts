import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

// The filter rules and the counts fixtures are the service's, vendored. `pnpm
// contracts:filter-rules --check` compares them with the pinned commit's copies;
// this holds them to what was pinned, without the network.

const root = resolve(__dirname, "../..");
const source = JSON.parse(
  readFileSync(resolve(root, "contracts/filter-rules.source.json"), "utf8"),
) as {
  repository: string;
  commit: string;
  files: Record<string, { path: string; blob: string }>;
};

const UPSTREAM = {
  "filter-rules.json": "crates/autocomplete/tests/fixtures/filter_rules.json",
  "filter-counts.json": "crates/autocomplete/tests/fixtures/filter_counts.json",
};

describe("the vendored filter fixtures", () => {
  it("name the service repository and a full commit", () => {
    expect(source.repository).toBe("osiris-ratings/osiris-app");
    expect(source.commit).toMatch(/^[0-9a-f]{40}$/);
  });

  it("are the two the service shares, and no other", () => {
    expect(Object.keys(source.files).sort()).toEqual(
      Object.keys(UPSTREAM).sort(),
    );
  });

  it.each(Object.entries(UPSTREAM))(
    "%s: is the file the pinned commit holds, at the path the service keeps it: its git blob id is the one recorded",
    (name, path) => {
      const vendored = readFileSync(resolve(root, "contracts", name));
      const blob = createHash("sha1")
        .update(`blob ${vendored.length}\0`)
        .update(vendored)
        .digest("hex");

      expect(source.files[name]?.path).toBe(path);
      expect(blob).toBe(source.files[name]?.blob);
    },
  );
});
