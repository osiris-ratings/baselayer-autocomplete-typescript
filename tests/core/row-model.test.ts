import { describe, expect, it } from "vitest";

import {
  ADDRESS_ROW,
  BUSINESS_ROW,
  DEFAULT_LIST,
  DEFAULT_ENABLED_LINES,
  DEFAULT_ICON_SEGMENTS,
  DEFAULT_ROW_LAYOUT,
  PERSON_ROW,
  ROW_KINDS,
  ROW_PLACES,
  drawnLayout,
  drawnRowLayout,
  requestFor,
  resolveLayout,
  resolveRowLayout,
  type SessionScope,
} from "@baselayer-sdk/autocomplete";

/** Each line of a kind: its name, the entity it draws, the relation it lists. */
function linesOf(kind: (typeof ROW_KINDS)[keyof typeof ROW_KINDS]) {
  return kind.lines.map(({ line, entity, relation }) => ({
    line,
    entity,
    relation,
  }));
}

describe("the row a search draws", () => {
  it("is a head, then a line kind for each relation it can list", () => {
    expect(linesOf(BUSINESS_ROW)).toEqual([
      { line: "title", entity: "business", relation: null },
      { line: "subtitle", entity: "business", relation: null },
      { line: "person", entity: "person", relation: "people" },
      { line: "address", entity: "address", relation: "addresses" },
    ]);
    expect(linesOf(PERSON_ROW)).toEqual([
      { line: "head", entity: "person", relation: null },
      { line: "business", entity: "business", relation: "businesses" },
      { line: "address", entity: "address", relation: "addresses" },
    ]);
    expect(linesOf(ADDRESS_ROW)).toEqual([
      { line: "head", entity: "address", relation: null },
      { line: "business", entity: "business", relation: "businesses" },
      { line: "person", entity: "person", relation: "people" },
    ]);
    expect(ROW_KINDS).toEqual({
      businesses: BUSINESS_ROW,
      people: PERSON_ROW,
      addresses: ADDRESS_ROW,
    });
  });

  it("gives each line three places after its name, and none for an icon", () => {
    expect(BUSINESS_ROW.places).toEqual([
      ...ROW_PLACES,
      "personBadge",
      "personTrailingBadge",
      "personTrailing",
      "addressBadge",
      "addressTrailingBadge",
      "addressTrailing",
    ]);
    expect(PERSON_ROW.places.slice(0, 3)).toEqual([
      "headBadge",
      "headTrailingBadge",
      "headTrailing",
    ]);
    for (const kind of Object.values(ROW_KINDS)) {
      const places: readonly string[] = kind.places;
      const fields: readonly string[] = kind.fields;
      expect(places.filter(place => place.endsWith("Lead"))).toEqual([]);
      expect(fields.filter(field => field.endsWith("Icon"))).toEqual([]);
      for (const line of kind.lines) {
        expect(Object.keys(line), line.line).not.toContain("leading");
      }
    }
  });

  it("lists nothing under a business by default, and businesses under a person or an address", () => {
    expect(DEFAULT_LIST).toEqual({
      businesses: [],
      people: ["businesses"],
      addresses: ["businesses"],
    });
    expect(DEFAULT_ENABLED_LINES).toEqual(["business"]);
  });
});

describe("a business row's layout", () => {
  it("is today's by default, its lines' places on lines it does not list", () => {
    const layout = resolveLayout(BUSINESS_ROW);

    expect(
      Object.fromEntries(ROW_PLACES.map(place => [place, layout[place]])),
    ).toEqual(DEFAULT_ROW_LAYOUT);
    expect(layout).toMatchObject({
      personTrailing: "personRole",
      addressTrailing: "addressRole",
    });
    // The head's own layout is untouched: its places, its fields, its keys.
    expect(resolveRowLayout()).toEqual(DEFAULT_ROW_LAYOUT);
  });

  it("has no place for an icon, so a staged one is left out", () => {
    const layout = resolveLayout(BUSINESS_ROW, {
      titleLead: "titleIcon",
    } as never);

    expect(Object.keys(layout)).not.toContain("titleLead");
    expect(Object.values(layout)).not.toContain("titleIcon");
  });

  it("keeps each field to its own line", () => {
    expect(
      resolveLayout(BUSINESS_ROW, { personTrailing: "addressRole" })
        .personTrailing,
    ).toBe("personRole");
    expect(
      resolveLayout(BUSINESS_ROW, { subtitle: "personRole" }).subtitle,
    ).toBe("address");
    // The head's fields go anywhere in the head, as they always have.
    expect(resolveLayout(BUSINESS_ROW, { subtitle: "states" }).subtitle).toBe(
      "states",
    );
  });

  it("draws a business row's head exactly as it always has", () => {
    const drawn = drawnLayout(
      BUSINESS_ROW,
      resolveLayout(BUSINESS_ROW, { subtitle: null }),
    );

    expect(
      Object.fromEntries(ROW_PLACES.map(place => [place, drawn[place]])),
    ).toEqual(drawnRowLayout(resolveRowLayout({ subtitle: null })));
  });
});

describe("the segments an icon rides on", () => {
  it("are a row's names, and the segments with a glyph of their own", () => {
    expect(BUSINESS_ROW.iconSegments).toEqual([
      "name",
      "address",
      "people",
      "personName",
      "addressName",
    ]);
    expect(PERSON_ROW.iconSegments).toEqual([
      "name",
      "firstAddress",
      "businessName",
      "address",
      "addressName",
    ]);
    expect(ADDRESS_ROW.iconSegments).toEqual([
      "name",
      "businessName",
      "address",
      "personName",
    ]);
  });

  it("are the names on a person's and an address's rows by default, and none on a business row", () => {
    expect(DEFAULT_ICON_SEGMENTS).toEqual({
      businesses: [],
      people: ["name", "businessName", "addressName"],
      addresses: ["name", "businessName", "personName"],
    });
    for (const route of ["businesses", "people", "addresses"] as const) {
      const segments: readonly string[] = ROW_KINDS[route].iconSegments;
      for (const segment of DEFAULT_ICON_SEGMENTS[route]) {
        expect(segments).toContain(segment);
      }
    }
  });
});

describe("requestFor a business row", () => {
  it("asks for what the head draws, as it always has, and lists nothing", () => {
    expect(requestFor("businesses", resolveLayout(BUSINESS_ROW))).toEqual({
      list: [],
      include: ["people", "addresses"],
    });
  });

  it("asks for what it lists, though the head draws none of it", () => {
    const bare = resolveLayout(BUSINESS_ROW, {
      subtitle: null,
      subtitleTrailing: null,
    });

    expect(requestFor("businesses", bare)).toEqual({ list: [], include: [] });
    expect(requestFor("businesses", bare, ["people"])).toEqual({
      list: ["people"],
      include: ["people"],
    });
  });

  it("drops what the session's scope does not grant", () => {
    const scope: SessionScope = {
      routes: { businesses: ["addresses"] },
      maxLimit: 20,
    };

    expect(
      requestFor(
        "businesses",
        resolveLayout(BUSINESS_ROW),
        ["people", "addresses"],
        scope,
      ),
    ).toEqual({ list: ["addresses"], include: ["addresses"] });
  });
});
