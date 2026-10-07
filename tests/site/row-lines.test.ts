import { describe, expect, it } from "vitest";

import {
  DEFAULT_STYLE,
  lineKinds,
  lineState,
  shownEntities,
  withEnabled,
  withLineState,
  withListed,
  type LineKind,
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

  it("disables it when it leaves the row: a line not drawn cannot be enabled", () => {
    const listed = withEnabled(
      withListed(DEFAULT_STYLE, "people", "addresses", true),
      "people",
      "address",
      true,
    );
    expect(listed.rows.people.enabled).toEqual(["business", "address"]);

    const hidden = withListed(listed, "people", "addresses", false);
    expect(hidden.rows.people.list).toEqual(["businesses"]);
    expect(hidden.rows.people.enabled).toEqual(["business"]);
  });

  it("brings a line back disabled, whatever it was before", () => {
    const back = withListed(
      withListed(DEFAULT_STYLE, "addresses", "businesses", false),
      "addresses",
      "businesses",
      true,
    );
    expect(back.rows.addresses.list).toEqual(["businesses"]);
    expect(back.rows.addresses.enabled).toEqual([]);
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

describe("a line's switch: off, visible or enabled", () => {
  const kind = (
    route: Parameters<typeof lineKinds>[0],
    relation: string | null,
  ): LineKind => lineKinds(route).find(each => each.relation === relation)!;

  it("reads off a line the row does not list, visible one it lists and does not enable, and enabled one it does", () => {
    const people = (relation: string | null) =>
      lineState(DEFAULT_STYLE, "people", kind("people", relation));
    expect([people(null), people("businesses"), people("addresses")]).toEqual([
      "visible",
      "enabled",
      "off",
    ]);
    expect(
      lineState(DEFAULT_STYLE, "businesses", kind("businesses", null)),
    ).toBe("enabled");
  });

  it("lists and enables a line through the row's own writers, in one step", () => {
    const addresses = kind("people", "addresses");
    const enabled = withLineState(
      DEFAULT_STYLE,
      "people",
      addresses,
      "enabled",
    );
    expect(enabled).toEqual(
      withEnabled(
        withListed(DEFAULT_STYLE, "people", "addresses", true),
        "people",
        "address",
        true,
      ),
    );
    expect(lineState(enabled, "people", addresses)).toBe("enabled");

    const visible = withLineState(enabled, "people", addresses, "visible");
    expect(visible.rows.people.list).toEqual(["businesses", "addresses"]);
    expect(visible.rows.people.enabled).toEqual(["business"]);

    const off = withLineState(enabled, "people", addresses, "off");
    expect(off.rows.people.list).toEqual(["businesses"]);
    expect(off.rows.people.enabled).toEqual(["business"]);
    expect(withLineState(off, "people", addresses, "off")).toBe(off);
  });

  it("never takes a row's head off, only from visible to enabled and back", () => {
    const head = kind("people", null);
    expect(withLineState(DEFAULT_STYLE, "people", head, "off")).toBe(
      DEFAULT_STYLE,
    );
    const enabled = withLineState(DEFAULT_STYLE, "people", head, "enabled");
    expect(enabled.rows.people.enabled).toEqual(["person", "business"]);
    expect(lineState(enabled, "people", head)).toBe("enabled");
    expect(
      withLineState(enabled, "people", head, "visible").rows.people.enabled,
    ).toEqual(["business"]);
  });
});
