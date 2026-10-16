import {
  parseBusinessesResponse as parse060,
  partsFor as partsFor060,
} from "autocomplete-sdk-0-6-0";
import {
  parseBusinessesResponse as parse070,
  partsFor as partsFor070,
} from "autocomplete-sdk-0-7-0";
import {
  parseBusinessesResponse as parse080,
  parseSuggestResponse as parseSuggest080,
  partsFor as partsFor080,
} from "autocomplete-sdk-0-8-0";
import { describe, expect, it } from "vitest";

import {
  parseBusinessesResponse,
  parseSuggestResponse,
  partsFor,
} from "@baselayer-sdk/autocomplete";

import { golden } from "./fixtures/golden";

// Backward compatible in both directions. An API that corrects typos sends
// `corrected` on the letters it changed; the builds already released read the
// answer without an error and draw those letters as plain text, since the part
// is `matched: false` and the flag is a key they do not look at. And this
// build, against the API as it is today, where `corrected` is never sent, reads
// and draws exactly what the last release does. The released builds are the
// published packages themselves, installed under their own names.

interface Part {
  text: string;
  matched: boolean;
}
interface Row {
  label: string;
  highlight: Part[] | null;
}
type Parse = (body: unknown) => { suggestions: Row[] };
type PartsFor = (
  text: string,
  parts: Part[],
  region: "token" | "substring",
  tokens: string[],
) => Part[] | null;

const RELEASED: [string, Parse, PartsFor][] = [
  ["0.6.0", parse060 as Parse, partsFor060 as PartsFor],
  ["0.7.0", parse070 as Parse, partsFor070 as PartsFor],
  ["0.8.0", parse080 as Parse, partsFor080 as PartsFor],
];

describe.each(RELEASED)(
  "released %s, against an API that corrects typos",
  (_version, parse, partsOf) => {
    const answer = golden("businesses_corrected");

    it("decodes the answer, and keeps the letters the correction changed as unmatched text", () => {
      const [row] = parse(answer).suggestions;

      expect(row?.highlight).toEqual([
        { text: "HALCY", matched: true },
        { text: "O", matched: false },
        { text: "N", matched: true },
        { text: " FERRY WORKS LLC", matched: false },
      ]);
      expect(row?.highlight?.map(part => part.text).join("")).toBe(row?.label);
    });

    it("marks only the letters that answer what was typed, whichever region it draws", () => {
      const [row] = parse(answer).suggestions;

      for (const region of ["token", "substring"] as const) {
        const drawn = partsOf(row!.label, row!.highlight!, region, ["halcyin"]);
        expect(
          drawn?.filter(part => part.matched).map(part => part.text),
        ).toEqual(["HALCY", "N"]);
        expect(drawn?.map(part => part.text).join("")).toBe(row?.label);
      }
    });
  },
);

describe("this build, against an API that has no corrected letter to send", () => {
  const BODIES = [
    ["businesses", golden("businesses")],
    ["businesses", golden("businesses_filtered")],
    ["people", golden("people")],
    ["addresses", golden("addresses")],
  ] as const;

  it.each(BODIES)(
    "reads a %s answer as 0.8.0 does, key for key",
    (route, body) => {
      const now =
        route === "businesses"
          ? parseBusinessesResponse(body)
          : parseSuggestResponse(route, body);
      const before =
        route === "businesses" ? parse080(body) : parseSuggest080(route, body);

      expect(now).toEqual(before);
      expect(JSON.stringify(now)).toBe(JSON.stringify(before));
    },
  );

  it.each(["token", "substring"] as const)(
    "draws the parts as 0.8.0 does under the %s region, whatever is typed",
    region => {
      const [row] = parseBusinessesResponse(golden("businesses")).suggestions;
      for (const tokens of [
        [],
        ["h"],
        ["halc"],
        ["halcyon"],
        ["halcyon", "fer"],
      ]) {
        expect(partsFor(row!.label, row!.highlight!, region, tokens)).toEqual(
          partsFor080(row!.label, row!.highlight!, region, tokens),
        );
      }
    },
  );
});
