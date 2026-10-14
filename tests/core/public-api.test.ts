import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import baseline from "./fixtures/public-api-0.7.0.json";
import { ENTRY_POINTS, surfaceOf, type Surface } from "./support/api-surface";

// The package's public surface may grow; it may not lose or rename anything a
// consumer imports. The baseline is every export of the three entry points at
// v0.7.0, as the compiler reads it, written with the same helper from the tag's
// sources (`git archive v0.7.0 src tsconfig.json`).

const current = surfaceOf(resolve(__dirname, "../.."));
const before = baseline as Surface;

describe.each(Object.keys(ENTRY_POINTS) as (keyof Surface)[])(
  "the %s entry point",
  entry => {
    it("still exports every name 0.7.0 did", () => {
      const missing = Object.keys(before[entry]).filter(
        name => !(name in current[entry]),
      );
      expect(missing).toEqual([]);
    });

    it("still exports each as a value or a type, as 0.7.0 did", () => {
      const lost = Object.entries(before[entry]).filter(([name, kind]) => {
        const now = current[entry][name];
        if (now === undefined) return false;
        return (
          (kind.includes("value") && !now.includes("value")) ||
          (kind.includes("type") && !now.includes("type"))
        );
      });
      expect(lost).toEqual([]);
    });
  },
);
