import { describe, expect, it } from "vitest";

import {
  ADDRESS_ROW,
  BUSINESS_ROW,
  DEFAULT_LIST,
  DEFAULT_ENABLED_LINES,
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

  it("gives each line a place before its name, then its three", () => {
    expect(BUSINESS_ROW.places).toEqual([
      "titleLead",
      "titleBadge",
      "titleTrailingBadge",
      "titleTrailing",
      "subtitle",
      "subtitleBadge",
      "subtitleTrailingBadge",
      "subtitleTrailing",
      "personLead",
      "personBadge",
      "personTrailingBadge",
      "personTrailing",
      "addressLead",
      "addressBadge",
      "addressTrailingBadge",
      "addressTrailing",
    ]);
    expect(PERSON_ROW.places.slice(0, 4)).toEqual([
      "headLead",
      "headBadge",
      "headTrailingBadge",
      "headTrailing",
    ]);
    for (const kind of Object.values(ROW_KINDS)) {
      for (const { line, leading } of kind.lines) {
        expect(leading, line).toBe(
          line === "subtitle" ? undefined : `${line}Lead`,
        );
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
  it("is today's by default, its new places empty or on lines it does not list", () => {
    const layout = resolveLayout(BUSINESS_ROW);

    expect(
      Object.fromEntries(ROW_PLACES.map(place => [place, layout[place]])),
    ).toEqual(DEFAULT_ROW_LAYOUT);
    expect(layout.titleLead).toBeNull();
    expect(layout).toMatchObject({
      personLead: "personIcon",
      personTrailing: "personRole",
      addressLead: "addressIcon",
      addressTrailing: "addressRole",
    });
    // The head's own layout is untouched: its places, its fields, its keys.
    expect(resolveRowLayout()).toEqual(DEFAULT_ROW_LAYOUT);
  });

  it("puts an icon only before a line's name, and nothing else there", () => {
    expect(
      resolveLayout(BUSINESS_ROW, { titleLead: "titleIcon" }).titleLead,
    ).toBe("titleIcon");
    expect(
      resolveLayout(BUSINESS_ROW, { titleTrailing: "titleIcon" }).titleTrailing,
    ).toBe("states");
    expect(
      resolveLayout(BUSINESS_ROW, { titleLead: "structure" }).titleLead,
    ).toBeNull();
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

describe("a person's or an address's row, with icons", () => {
  it("draws each line's icon before its name by default", () => {
    expect(resolveLayout(PERSON_ROW)).toMatchObject({
      headLead: "headIcon",
      businessLead: "businessIcon",
      addressLead: "addressIcon",
    });
    expect(resolveLayout(ADDRESS_ROW)).toMatchObject({
      headLead: "headIcon",
      businessLead: "businessIcon",
      personLead: "personIcon",
    });
  });

  it("puts a line's icon nowhere but before its name", () => {
    expect(
      resolveLayout(PERSON_ROW, { businessTrailing: "businessIcon" })
        .businessTrailing,
    ).toBe("role");
    expect(
      resolveLayout(PERSON_ROW, { headLead: "businessIcon" }).headLead,
    ).toBe("headIcon");
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
