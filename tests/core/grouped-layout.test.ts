import { describe, expect, it } from "vitest";

import {
  ADDRESS_ROW,
  PERSON_ROW,
  drawnLayout,
  requestFor,
  resolveLayout,
} from "@baselayer-sdk/autocomplete";

describe("a person's row", () => {
  it("draws, by default, the head, the business lines and the address lines", () => {
    // Jane Q Doe   12 Oak Ln, Dover, DE  +2 ......... 3 businesses · 3 addresses
    //   ACME HOLDINGS LLC   1200 River Rd, Wilm… ..... [DE][FL] +1   officer
    //   12 Oak Ln, Dover, DE 19901 ................................. officer
    expect(resolveLayout(PERSON_ROW)).toEqual({
      headBadge: "firstAddress",
      headTrailingBadge: null,
      headTrailing: "counts",
      businessBadge: "address",
      businessTrailingBadge: "states",
      businessTrailing: "role",
      addressBadge: null,
      addressTrailingBadge: null,
      addressTrailing: "addressRole",
    });
  });

  it("keeps each field to its own line", () => {
    // The counts belong to the head; a business line cannot take them.
    expect(
      resolveLayout(PERSON_ROW, { businessTrailing: "counts" })
        .businessTrailing,
    ).toBe("role");
  });

  it("moves a field within its line, and leaves the field it displaced out", () => {
    const layout = resolveLayout(PERSON_ROW, { businessTrailing: "states" });

    expect(layout.businessTrailing).toBe("states");
    expect(layout.businessTrailingBadge).toBeNull();
    expect(Object.values(layout)).not.toContain("role");
  });

  it("draws a badge beside an empty field in that field's place", () => {
    const drawn = drawnLayout(
      PERSON_ROW,
      resolveLayout(PERSON_ROW, { businessTrailing: null }),
    );

    expect(drawn.businessTrailing).toBe("states");
    expect(drawn.businessTrailingBadge).toBeNull();
  });
});

describe("an address's row", () => {
  it("draws, by default, the head with its counts, the business lines and the people lines", () => {
    expect(resolveLayout(ADDRESS_ROW)).toEqual({
      headBadge: null,
      headTrailingBadge: null,
      headTrailing: "counts",
      businessBadge: "address",
      businessTrailingBadge: "states",
      businessTrailing: "role",
      personBadge: null,
      personTrailingBadge: null,
      personTrailing: "personRole",
    });
  });

  it("has no first address to draw in its head: it is the address", () => {
    expect(
      resolveLayout(ADDRESS_ROW, {
        headBadge: "firstAddress" as never,
      }).headBadge,
    ).toBeNull();
  });
});

describe("requestFor", () => {
  it("lists a person's businesses, and asks for their addresses too for the head's first address", () => {
    expect(requestFor("people", resolveLayout(PERSON_ROW))).toEqual({
      listed: ["businesses"],
      include: ["businesses", "addresses"],
    });
  });

  it("asks for only what it lists when the layout draws nothing more", () => {
    expect(
      requestFor("people", resolveLayout(PERSON_ROW, { headBadge: null })),
    ).toEqual({ listed: ["businesses"], include: ["businesses"] });
  });

  it("lists what the host asks for, in the route's order", () => {
    expect(
      requestFor("people", resolveLayout(PERSON_ROW), [
        "addresses",
        "businesses",
      ]),
    ).toEqual({
      listed: ["businesses", "addresses"],
      include: ["businesses", "addresses"],
    });
    expect(
      requestFor("addresses", resolveLayout(ADDRESS_ROW), ["people"]),
    ).toEqual({ listed: ["people"], include: ["people"] });
  });

  it("lists an address's businesses by default, and asks for nothing more", () => {
    expect(requestFor("addresses", resolveLayout(ADDRESS_ROW))).toEqual({
      listed: ["businesses"],
      include: ["businesses"],
    });
  });
});
