import { describe, expect, it } from "vitest";

import {
  ADDRESS_ROW,
  PERSON_ROW,
  drawnLayout,
  requestFor,
  resolveLayout,
  type SessionScope,
} from "@baselayer-sdk/autocomplete";

describe("a person's row", () => {
  it("draws, by default, the head, the business lines and the address lines", () => {
    // Jane Q Doe   12 Fernhallow Ln, Dover, DE  +2 ......... 3 businesses · 3 addresses
    //   ACME HOLDINGS LLC   1200 Tallowmere Rd, Wilm… ..... [DE][FL] +1   officer
    //   12 Fernhallow Ln, Dover, DE 19901 ................................. officer
    expect(resolveLayout(PERSON_ROW)).toEqual({
      headLead: "headIcon",
      headBadge: "firstAddress",
      headTrailingBadge: null,
      headTrailing: "counts",
      businessLead: "businessIcon",
      businessBadge: "address",
      businessTrailingBadge: "states",
      businessTrailing: "role",
      addressLead: "addressIcon",
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
      headLead: "headIcon",
      headBadge: null,
      headTrailingBadge: null,
      headTrailing: "counts",
      businessLead: "businessIcon",
      businessBadge: "address",
      businessTrailingBadge: "states",
      businessTrailing: "role",
      personLead: "personIcon",
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
  it("lists a person's businesses, and asks for their addresses too, for the head's first address and count", () => {
    expect(requestFor("people", resolveLayout(PERSON_ROW))).toEqual({
      list: ["businesses"],
      include: ["businesses", "addresses"],
    });
  });

  it("asks for every relation the head counts, though only businesses are listed", () => {
    // 3 businesses · 3 addresses: no first address in the head, but its count.
    expect(
      requestFor("people", resolveLayout(PERSON_ROW, { headBadge: null })),
    ).toEqual({
      list: ["businesses"],
      include: ["businesses", "addresses"],
    });
    // 412 businesses · 2 people.
    expect(requestFor("addresses", resolveLayout(ADDRESS_ROW))).toEqual({
      list: ["businesses"],
      include: ["businesses", "people"],
    });
  });

  it("asks for a person's addresses for their first address alone, counted or not", () => {
    expect(
      requestFor("people", resolveLayout(PERSON_ROW, { headTrailing: null }), [
        "businesses",
      ]),
    ).toEqual({ list: ["businesses"], include: ["businesses", "addresses"] });
  });

  it("asks for only what it lists when the head draws nothing that needs more", () => {
    expect(
      requestFor(
        "people",
        resolveLayout(PERSON_ROW, { headBadge: null, headTrailing: null }),
      ),
    ).toEqual({ list: ["businesses"], include: ["businesses"] });
  });

  it("lists what the host asks for, in the route's order", () => {
    expect(
      requestFor("people", resolveLayout(PERSON_ROW), [
        "addresses",
        "businesses",
      ]),
    ).toEqual({
      list: ["businesses", "addresses"],
      include: ["businesses", "addresses"],
    });
    expect(
      requestFor("addresses", resolveLayout(ADDRESS_ROW), ["people"]),
    ).toEqual({ list: ["people"], include: ["businesses", "people"] });
  });

  describe("under a session's scope", () => {
    const businessesOnly: SessionScope = {
      routes: {
        businesses: ["people", "addresses"],
        people: ["businesses"],
        addresses: ["businesses"],
      },
      maxLimit: 20,
    };

    it("drops what the scope does not grant rather than asking for it", () => {
      // The head's first address and its count need addresses, which the
      // scope leaves out: they draw nothing, and the search still runs.
      expect(
        requestFor(
          "people",
          resolveLayout(PERSON_ROW),
          undefined,
          businessesOnly,
        ),
      ).toEqual({ list: ["businesses"], include: ["businesses"] });
      expect(
        requestFor(
          "addresses",
          resolveLayout(ADDRESS_ROW),
          undefined,
          businessesOnly,
        ),
      ).toEqual({ list: ["businesses"], include: ["businesses"] });
    });

    it("drops a listed relation the scope does not grant, rather than failing", () => {
      expect(
        requestFor(
          "people",
          resolveLayout(PERSON_ROW),
          ["addresses"],
          businessesOnly,
        ),
      ).toEqual({ list: [], include: ["businesses"] });
    });

    it("asks for nothing on a route the scope leaves out", () => {
      expect(
        requestFor("people", resolveLayout(PERSON_ROW), undefined, {
          routes: { businesses: ["people"] },
          maxLimit: 20,
        }),
      ).toEqual({ list: [], include: [] });
    });

    it("asks for all it would without one when the scope grants it all", () => {
      expect(
        requestFor(
          "addresses",
          resolveLayout(ADDRESS_ROW),
          ["businesses", "people"],
          {
            routes: { addresses: ["people", "businesses"] },
            maxLimit: 20,
          },
        ),
      ).toEqual({
        list: ["businesses", "people"],
        include: ["businesses", "people"],
      });
    });
  });
});
