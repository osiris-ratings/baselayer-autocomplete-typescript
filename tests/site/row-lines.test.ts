import { describe, expect, it } from "vitest";

import {
  DEFAULT_STYLE,
  componentChanges,
  componentProps,
  exportCode,
  lineKinds,
  shownEntities,
  withEnabled,
  withListOrder,
  withListed,
} from "../../site/demo/style-state";

describe("a row's line kinds", () => {
  it("are the head, then each relation the row can list, named by the entity a pick names", () => {
    const summary = (route: Parameters<typeof lineKinds>[0]) =>
      lineKinds(route).map(({ relation, entity, lines }) => ({
        relation,
        entity,
        lines: lines.map(line => line.line),
      }));

    expect(summary("businesses")).toEqual([
      { relation: null, entity: "business", lines: ["title", "subtitle"] },
      { relation: "people", entity: "person", lines: ["person"] },
      { relation: "addresses", entity: "address", lines: ["address"] },
    ]);
    expect(summary("people")).toEqual([
      { relation: null, entity: "person", lines: ["head"] },
      { relation: "businesses", entity: "business", lines: ["business"] },
      { relation: "addresses", entity: "address", lines: ["address"] },
    ]);
    expect(summary("addresses")).toEqual([
      { relation: null, entity: "address", lines: ["head"] },
      { relation: "businesses", entity: "business", lines: ["business"] },
      { relation: "people", entity: "person", lines: ["person"] },
    ]);
  });
});

describe("listing a line kind", () => {
  it("adds it at the end of the row's list, or where it is put", () => {
    const addresses = withListed(
      DEFAULT_STYLE,
      "businesses",
      "addresses",
      true,
    );
    expect(addresses.rows.businesses.list).toEqual(["addresses"]);
    const both = withListed(addresses, "businesses", "people", true);
    expect(both.rows.businesses.list).toEqual(["addresses", "people"]);
    expect(both.rows.people).toBe(DEFAULT_STYLE.rows.people);
    const first = withListed(addresses, "businesses", "people", true, 0);
    expect(first.rows.businesses.list).toEqual(["people", "addresses"]);
  });

  it("takes it out of the list wherever it is", () => {
    const both = withListed(
      withListed(DEFAULT_STYLE, "businesses", "addresses", true),
      "businesses",
      "people",
      true,
    );
    expect(
      withListed(both, "businesses", "addresses", false).rows.businesses.list,
    ).toEqual(["people"]);
  });

  it("hands the components no hidden line as enabled: a line not drawn cannot be chosen", () => {
    const listed = withEnabled(
      withListed(DEFAULT_STYLE, "people", "addresses", true),
      "people",
      "address",
      true,
    );
    expect(componentProps(listed, "people").enabledLines).toEqual([
      "business",
      "address",
    ]);

    const hidden = withListed(listed, "people", "addresses", false);
    expect(hidden.rows.people.list).toEqual(["businesses"]);
    expect(componentProps(hidden, "people").enabledLines).toEqual(["business"]);
  });

  it("brings a hidden line back as it was, enabled or not", () => {
    const hidden = withListed(DEFAULT_STYLE, "people", "businesses", false);
    expect(componentProps(hidden, "people").enabledLines).toEqual([]);
    expect(componentChanges(hidden)).toBe(2);

    const back = withListed(hidden, "people", "businesses", true);
    expect(back.rows.people.list).toEqual(["businesses"]);
    expect(componentProps(back, "people").enabledLines).toEqual(["business"]);
    expect(componentChanges(back)).toBe(0);
    expect(exportCode(back, "people").tsx).not.toContain("enabledLines");
  });

  it("changes nothing when the line is already where it is asked to be", () => {
    expect(withListed(DEFAULT_STYLE, "people", "businesses", true)).toBe(
      DEFAULT_STYLE,
    );
    expect(withListed(DEFAULT_STYLE, "businesses", "people", false)).toBe(
      DEFAULT_STYLE,
    );
  });
});

describe("a line's toggle", () => {
  it("enables or disables the head, on every row", () => {
    const person = withEnabled(DEFAULT_STYLE, "people", "person", true);
    expect(person.rows.people.enabled).toEqual(["person", "business"]);
    const business = withEnabled(
      DEFAULT_STYLE,
      "businesses",
      "business",
      false,
    );
    expect(business.rows.businesses.enabled).toEqual([]);
  });

  it("does nothing for a line the row does not draw", () => {
    expect(withEnabled(DEFAULT_STYLE, "businesses", "person", true)).toBe(
      DEFAULT_STYLE,
    );
    expect(withEnabled(DEFAULT_STYLE, "people", "address", true)).toBe(
      DEFAULT_STYLE,
    );
  });

  it("keeps the enabled lines in the order the row draws them", () => {
    const listed = withListed(
      withListed(DEFAULT_STYLE, "businesses", "addresses", true),
      "businesses",
      "people",
      true,
    );
    const enabled = withEnabled(
      withEnabled(listed, "businesses", "address", true),
      "businesses",
      "person",
      true,
    );
    expect(enabled.rows.businesses.enabled).toEqual([
      "business",
      "person",
      "address",
    ]);
  });
});

describe("the entities a row shows", () => {
  it("are its head's and each listed line's", () => {
    expect(shownEntities("businesses", DEFAULT_STYLE)).toEqual(["business"]);
    expect(shownEntities("people", DEFAULT_STYLE)).toEqual([
      "person",
      "business",
    ]);
    const listed = withListed(DEFAULT_STYLE, "addresses", "people", true);
    expect(shownEntities("addresses", listed)).toEqual([
      "address",
      "business",
      "person",
    ]);
  });
});

describe("ordering a row's lines", () => {
  const both = withListed(DEFAULT_STYLE, "people", "addresses", true);

  it("moves a shown line to a place in the list, the others keeping their order", () => {
    expect(both.rows.people.list).toEqual(["businesses", "addresses"]);
    const moved = withListOrder(both, "people", "addresses", 0);
    expect(moved.rows.people.list).toEqual(["addresses", "businesses"]);
    expect(
      withListOrder(moved, "people", "addresses", 1).rows.people.list,
    ).toEqual(["businesses", "addresses"]);
    // Past either end: as far as it goes.
    expect(
      withListOrder(both, "people", "businesses", 9).rows.people.list,
    ).toEqual(["addresses", "businesses"]);
    expect(
      withListOrder(both, "people", "addresses", -3).rows.people.list,
    ).toEqual(["addresses", "businesses"]);
  });

  it("changes nothing for a line already there, or one the row does not show", () => {
    expect(withListOrder(both, "people", "businesses", 0)).toBe(both);
    expect(withListOrder(DEFAULT_STYLE, "people", "addresses", 0)).toBe(
      DEFAULT_STYLE,
    );
  });

  it("is what the components are handed, and what the export writes", () => {
    const moved = withListOrder(both, "people", "addresses", 0);
    expect(componentProps(moved, "people").list).toEqual([
      "addresses",
      "businesses",
    ]);
    expect(exportCode(moved, "people").tsx).toContain(
      'list={["addresses", "businesses"]}',
    );
  });
});
