import { describe, expect, it } from "vitest";

import {
  BUSINESS_ROW,
  BUSINESS_ROW_PLACES,
  DEFAULT_ROW_LAYOUT,
  ROW_FIELDS,
  ROW_PLACES,
  includeForLayout,
  requestFor,
  resolveLayout,
  type BusinessRowPlace,
  type SessionScope,
} from "@baselayer-sdk/autocomplete";

/** Counts alone in the head: no address and no people placed beside them. */
const COUNTS_ALONE = {
  subtitle: null,
  subtitleTrailing: "counts",
} as const;

describe("a business head's counts", () => {
  it("is a field any of the head's places takes, and no listed line's", () => {
    expect(ROW_FIELDS).toContain("counts");
    const head: readonly string[] = ROW_PLACES;
    for (const place of BUSINESS_ROW_PLACES) {
      expect(BUSINESS_ROW.accepts!(place as BusinessRowPlace, "counts")).toBe(
        head.includes(place),
      );
    }
  });

  it("is placed nowhere by default, so the default row is as it was", () => {
    expect(DEFAULT_ROW_LAYOUT).toEqual({
      titleBadge: "structure",
      titleTrailingBadge: null,
      titleTrailing: "states",
      subtitle: "address",
      subtitleBadge: null,
      subtitleTrailingBadge: null,
      subtitleTrailing: "people",
    });
    expect(Object.values(BUSINESS_ROW.defaults)).not.toContain("counts");
    expect(includeForLayout()).toEqual(["people", "addresses"]);
  });

  it("asks for every relation it counts, in the route's order, placed alone", () => {
    expect(
      includeForLayout({ ...COUNTS_ALONE, subtitleTrailing: null }),
    ).toEqual([]);
    expect(includeForLayout(COUNTS_ALONE)).toEqual(["people", "addresses"]);
    expect(
      requestFor("businesses", resolveLayout(BUSINESS_ROW, COUNTS_ALONE), []),
    ).toEqual({ list: [], include: ["people", "addresses"] });
  });

  it("asks only for the relations a session's scope grants", () => {
    const layout = resolveLayout(BUSINESS_ROW, COUNTS_ALONE);
    const people: SessionScope = {
      routes: { businesses: ["people"] },
      maxLimit: 20,
    };
    const neither: SessionScope = { routes: { businesses: [] }, maxLimit: 20 };

    expect(requestFor("businesses", layout, [], people).include).toEqual([
      "people",
    ]);
    expect(requestFor("businesses", layout, [], neither).include).toEqual([]);
  });
});
