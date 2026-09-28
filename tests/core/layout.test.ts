import { describe, expect, it } from "vitest";

import {
  DEFAULT_ROW_LAYOUT,
  ROW_FIELDS,
  ROW_PLACES,
  includeForLayout,
  resolveRowLayout,
  type RowField,
  type RowLayout,
  type RowLayoutInput,
  type RowPlace,
} from "@baselayer-sdk/autocomplete";

describe("a row's places and fields", () => {
  it("names the places a host fills in reading order, each for where it sits", () => {
    expect(ROW_PLACES).toEqual([
      "titleBadge",
      "titleTrailing",
      "subtitle",
      "subtitleTrailing",
    ]);
  });

  it("names the fields a business row can show", () => {
    expect(ROW_FIELDS).toEqual(["states", "structure", "address", "people"]);
  });

  it("puts the structure after the name, the states at the right, the address and the people below", () => {
    expect(DEFAULT_ROW_LAYOUT).toEqual({
      titleBadge: "structure",
      titleTrailing: "states",
      subtitle: "address",
      subtitleTrailing: "people",
    });
    expect(Object.isFrozen(DEFAULT_ROW_LAYOUT)).toBe(true);
  });
});

describe("resolveRowLayout", () => {
  it("is the default layout when nothing is staged", () => {
    expect(resolveRowLayout()).toEqual(DEFAULT_ROW_LAYOUT);
    expect(resolveRowLayout({})).toEqual(DEFAULT_ROW_LAYOUT);
    expect(resolveRowLayout()).not.toBe(DEFAULT_ROW_LAYOUT);
  });

  it("puts a field where the host places it, and empties a place set to null", () => {
    expect(
      resolveRowLayout({
        titleBadge: null,
        subtitle: "people",
        subtitleTrailing: "states",
      }),
    ).toEqual({
      titleBadge: null,
      // Its default, the states, is placed elsewhere.
      titleTrailing: null,
      subtitle: "people",
      subtitleTrailing: "states",
    });
  });

  it("keeps a place's default field when the host leaves the place out", () => {
    expect(resolveRowLayout({ titleBadge: null })).toEqual({
      ...DEFAULT_ROW_LAYOUT,
      titleBadge: null,
    });
  });

  it("moves a field, and leaves the place it left empty", () => {
    expect(resolveRowLayout({ subtitle: "states" })).toEqual({
      titleBadge: "structure",
      titleTrailing: null,
      subtitle: "states",
      subtitleTrailing: "people",
    });
  });

  it("gives up a default field the host placed later in reading order too", () => {
    expect(resolveRowLayout({ subtitleTrailing: "structure" })).toEqual({
      titleBadge: null,
      titleTrailing: "states",
      subtitle: "address",
      subtitleTrailing: "structure",
    });
  });

  it("keeps a field placed twice in the first place in reading order, and leaves the later one empty", () => {
    expect(
      resolveRowLayout({ subtitle: "states", titleTrailing: "states" }),
    ).toEqual({
      titleBadge: "structure",
      titleTrailing: "states",
      subtitle: null,
      subtitleTrailing: "people",
    });
    expect(
      resolveRowLayout({ titleBadge: "people", subtitleTrailing: "people" }),
    ).toEqual({
      titleBadge: "people",
      titleTrailing: "states",
      subtitle: "address",
      subtitleTrailing: null,
    });
  });

  it("counts a value this build cannot use as left out", () => {
    // Staged from an untyped config, or for a field a later build adds.
    const staged = {
      titleBadge: "liens",
      subtitle: 3,
      subtitleTrailing: undefined,
    } as unknown as RowLayoutInput;

    expect(resolveRowLayout(staged)).toEqual(DEFAULT_ROW_LAYOUT);
  });

  it("never draws a field twice, and keeps every place the host set, whatever the layout", () => {
    const values: (RowField | null | undefined)[] = [
      undefined,
      null,
      ...ROW_FIELDS,
    ];
    let layouts = 0;
    for (const titleBadge of values) {
      for (const titleTrailing of values) {
        for (const subtitle of values) {
          for (const subtitleTrailing of values) {
            const staged: RowLayoutInput = {
              titleBadge,
              titleTrailing,
              subtitle,
              subtitleTrailing,
            };
            const layout = resolveRowLayout(staged);
            const drawn = ROW_PLACES.map(place => layout[place]).filter(
              field => field !== null,
            );
            expect(new Set(drawn).size, JSON.stringify(staged)).toBe(
              drawn.length,
            );
            // A field the host placed is drawn where it was placed first.
            const first = new Map<RowField, RowPlace>();
            for (const place of ROW_PLACES) {
              const field = staged[place];
              if (field === null) {
                expect(layout[place]).toBeNull();
              } else if (field !== undefined && !first.has(field)) {
                first.set(field, place);
                expect(layout[place], JSON.stringify(staged)).toBe(field);
              }
            }
            layouts += 1;
          }
        }
      }
    }
    expect(layouts).toBe(6 ** 4);
  });

  it("reads a layout staged as null, from plain JavaScript, as none", () => {
    expect(resolveRowLayout(null as unknown as RowLayoutInput)).toEqual(
      DEFAULT_ROW_LAYOUT,
    );
    expect(includeForLayout(null as unknown as RowLayoutInput)).toEqual([
      "people",
      "addresses",
    ]);
  });

  it("hands a resolved layout back as it is", () => {
    const layout: RowLayout = {
      titleBadge: null,
      titleTrailing: "people",
      subtitle: "states",
      subtitleTrailing: null,
    };

    expect(resolveRowLayout(layout)).toEqual(layout);
  });
});

describe("includeForLayout", () => {
  it("asks for the people and the addresses by default, in the tier's order", () => {
    expect(includeForLayout()).toEqual(["people", "addresses"]);
    expect(includeForLayout(DEFAULT_ROW_LAYOUT)).toEqual([
      "people",
      "addresses",
    ]);
  });

  it("asks for the addresses only while the address is placed, and the people likewise", () => {
    expect(includeForLayout({ subtitle: null })).toEqual(["people"]);
    expect(includeForLayout({ subtitleTrailing: null })).toEqual(["addresses"]);
  });

  it("asks for a field wherever it is placed", () => {
    expect(
      includeForLayout({
        titleBadge: "address",
        titleTrailing: "people",
        subtitle: "states",
        subtitleTrailing: null,
      }),
    ).toEqual(["people", "addresses"]);
  });

  it("asks for nothing related when only the states and the structure are placed", () => {
    // Both come on the row itself.
    expect(
      includeForLayout({ subtitle: null, subtitleTrailing: null }),
    ).toEqual([]);
    expect(
      includeForLayout({
        titleBadge: "states",
        titleTrailing: "structure",
        subtitle: null,
        subtitleTrailing: null,
      }),
    ).toEqual([]);
  });

  it("stops asking for a field the layout moved another field over", () => {
    // The states take the address's place, and the address is placed nowhere.
    expect(includeForLayout({ subtitle: "states" })).toEqual(["people"]);
  });
});
