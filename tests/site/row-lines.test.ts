import { describe, expect, it } from "vitest";

import {
  DEFAULT_STYLE,
  lineKinds,
  shownEntities,
  withListed,
  withPickable,
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

  it("takes it out of what can be picked when it leaves the row: a line not drawn cannot be picked", () => {
    const listed = withPickable(
      withListed(DEFAULT_STYLE, "people", "addresses", true),
      "people",
      "address",
      true,
    );
    expect(listed.rows.people.pickable).toEqual(["business", "address"]);

    const hidden = withListed(listed, "people", "addresses", false);
    expect(hidden.rows.people.list).toEqual(["businesses"]);
    expect(hidden.rows.people.pickable).toEqual(["business"]);
  });

  it("brings a line back unpickable, whatever it was before", () => {
    const back = withListed(
      withListed(DEFAULT_STYLE, "addresses", "businesses", false),
      "addresses",
      "businesses",
      true,
    );
    expect(back.rows.addresses.list).toEqual(["businesses"]);
    expect(back.rows.addresses.pickable).toEqual([]);
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

describe("a line's pick toggle", () => {
  it("picks the head, on or off, on every row", () => {
    const person = withPickable(DEFAULT_STYLE, "people", "person", true);
    expect(person.rows.people.pickable).toEqual(["person", "business"]);
    const business = withPickable(
      DEFAULT_STYLE,
      "businesses",
      "business",
      false,
    );
    expect(business.rows.businesses.pickable).toEqual([]);
  });

  it("does nothing for a line the row does not draw", () => {
    expect(withPickable(DEFAULT_STYLE, "businesses", "person", true)).toBe(
      DEFAULT_STYLE,
    );
    expect(withPickable(DEFAULT_STYLE, "people", "address", true)).toBe(
      DEFAULT_STYLE,
    );
  });

  it("keeps what can be picked in the order the row draws its lines", () => {
    const listed = withListed(
      withListed(DEFAULT_STYLE, "businesses", "addresses", true),
      "businesses",
      "people",
      true,
    );
    const picked = withPickable(
      withPickable(listed, "businesses", "address", true),
      "businesses",
      "person",
      true,
    );
    expect(picked.rows.businesses.pickable).toEqual([
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
