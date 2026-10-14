import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

// The filter rules fixture is the service's, vendored. `pnpm
// contracts:filter-rules --check` compares it with the pinned commit's copy;
// this holds it to what was pinned, without the network.

const root = resolve(__dirname, "../..");
const vendored = readFileSync(resolve(root, "contracts/filter-rules.json"));
const source = JSON.parse(
  readFileSync(resolve(root, "contracts/filter-rules.source.json"), "utf8"),
) as { repository: string; path: string; commit: string; blob: string };

describe("the vendored filter rules", () => {
  it("are the file the pinned commit holds: its git blob id is the one recorded", () => {
    const blob = createHash("sha1")
      .update(`blob ${vendored.length}\0`)
      .update(vendored)
      .digest("hex");

    expect(blob).toBe(source.blob);
  });

  it("name the service repository, the fixture's path and a full commit", () => {
    expect(source.repository).toBe("osiris-ratings/osiris-app");
    expect(source.path).toBe(
      "crates/autocomplete/tests/fixtures/filter_rules.json",
    );
    expect(source.commit).toMatch(/^[0-9a-f]{40}$/);
  });
});
