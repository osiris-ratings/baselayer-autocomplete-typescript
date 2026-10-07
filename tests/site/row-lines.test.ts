import { describe, expect, it } from "vitest";

import {
  DEFAULT_STYLE,
  componentChanges,
  componentProps,
  exportCode,
  lineKinds,
  shownEntities,
  withEnabled,
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
  it("adds it to the row's list, in the row's own order", () => {
    const people = withListed(DEFAULT_STYLE, "businesses", "addresses", true);
    expect(people.rows.businesses.list).toEqual(["addresses"]);
    const both = withListed(people, "businesses", "people", true);
    expect(both.rows.businesses.list).toEqual(["people", "addresses"]);
    expect(both.rows.people).toBe(DEFAULT_STYLE.rows.people);
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
