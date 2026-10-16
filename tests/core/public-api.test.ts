import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import baseline070 from "./fixtures/public-api-0.7.0.json";
import baseline080 from "./fixtures/public-api-0.8.0.json";
import { ENTRY_POINTS, surfaceOf, type Surface } from "./support/api-surface";

// The package's public surface may grow; it may not lose or rename anything a
// consumer imports. Each baseline is every export of the three entry points at
// a release, as the compiler reads it, written with the same helper from the
// tag's sources (`git archive v0.8.0 src tsconfig.json`).

const current = surfaceOf(resolve(__dirname, "../.."));

describe.each([
  ["0.7.0", baseline070 as Surface],
  ["0.8.0", baseline080 as Surface],
])("the surface of %s", (release, before) => {
  describe.each(Object.keys(ENTRY_POINTS) as (keyof Surface)[])(
    "the %s entry point",
    entry => {
      it(`still exports every name ${release} did`, () => {
        const missing = Object.keys(before[entry]).filter(
          name => !(name in current[entry]),
        );
        expect(missing).toEqual([]);
      });

      it(`still exports each as a value or a type, as ${release} did`, () => {
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
});
