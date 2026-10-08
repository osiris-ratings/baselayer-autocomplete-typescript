import { describe, expect, expectTypeOf, it } from "vitest";

import {
  DEFAULT_ROW_LAYOUT,
  ROW_FIELDS,
  ROW_LINES,
  ROW_PLACES,
  drawnRowLayout,
  includeForLayout,
  resolveRowLayout,
  type RowField,
  type RowLayout,
  type RowLayoutInput,
  type RowLine,
  type RowPlace,
} from "@baselayer-sdk/autocomplete";

/** The corners' badges, which a layout leaves empty unless it places them. */
const NO_BADGES = {
  titleTrailingBadge: null,
  subtitleBadge: null,
  subtitleTrailingBadge: null,
} as const;

describe("a row's places and fields", () => {
  it("names the places a host fills in reading order, each for where it sits", () => {
    // Left to right, line by line: each corner's badge sits on its inner
    // side, after a lead and before a trailing place.
    expect(ROW_PLACES).toEqual([
      "titleBadge",
      "titleTrailingBadge",
      "titleTrailing",
      "subtitle",
      "subtitleBadge",
      "subtitleTrailingBadge",
      "subtitleTrailing",
    ]);
  });

  it("names the fields a business row can show", () => {
    expect(ROW_FIELDS).toEqual(["states", "structure", "address", "people"]);
  });

  it("puts the structure after the name, the states at the right, the address and the people below", () => {
    expect(DEFAULT_ROW_LAYOUT).toEqual({
      ...NO_BADGES,
      titleBadge: "structure",
      titleTrailingBadge: null,
      titleTrailing: "states",
      subtitle: "address",
      subtitleBadge: null,
      subtitleTrailingBadge: null,
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
      ...NO_BADGES,
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
      ...NO_BADGES,
      titleBadge: "structure",
      titleTrailing: null,
      subtitle: "states",
      subtitleTrailing: "people",
    });
  });

  it("gives up a default field the host placed later in reading order too", () => {
    expect(resolveRowLayout({ subtitleTrailing: "structure" })).toEqual({
      ...NO_BADGES,
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
      ...NO_BADGES,
      titleBadge: "structure",
      titleTrailing: "states",
      subtitle: null,
      subtitleTrailing: "people",
    });
    expect(
      resolveRowLayout({ titleBadge: "people", subtitleTrailing: "people" }),
    ).toEqual({
      ...NO_BADGES,
      titleBadge: "people",
      titleTrailing: "states",
      subtitle: "address",
      subtitleTrailing: null,
    });
  });

  it("counts a value this build cannot use as left out", () => {
    // Staged from an untyped config, or for a field a later build adds.
    const staged = {
      titleBadge: "nickname",
      subtitle: 3,
      subtitleTrailing: undefined,
    } as unknown as RowLayoutInput;

    expect(resolveRowLayout(staged)).toEqual(DEFAULT_ROW_LAYOUT);
  });

  it("never draws a field twice, keeps every place the host set, and every place left out its default, whatever the layout", () => {
    const values: (RowField | null | undefined)[] = [
      undefined,
      null,
      ...ROW_FIELDS,
    ];
    // Every layout a host could stage, 6 values in each of the 7 places.
    const stagings: RowLayoutInput[] = ROW_PLACES.reduce<RowLayoutInput[]>(
      (partial, place) =>
        partial.flatMap(staged =>
          values.map(value => ({ ...staged, [place]: value })),
        ),
      [{}],
    );
    const wrong: string[] = [];
    for (const staged of stagings) {
      const layout = resolveRowLayout(staged);
      const drawn = ROW_PLACES.map(place => layout[place]).filter(
        field => field !== null,
      );
      if (new Set(drawn).size !== drawn.length)
        wrong.push(JSON.stringify(staged));
      const placed = new Set(ROW_PLACES.map(place => staged[place]));
      // A field the host placed is drawn where it was placed first.
      const first = new Set<RowField>();
      for (const place of ROW_PLACES) {
        const field = staged[place];
        if (field === null && layout[place] !== null)
          wrong.push(JSON.stringify(staged));
        if (field !== null && field !== undefined && !first.has(field)) {
          first.add(field);
          if (layout[place] !== field) wrong.push(JSON.stringify(staged));
        }
        // A place left out keeps its default, unless that field is placed
        // somewhere else.
        const fallback = DEFAULT_ROW_LAYOUT[place];
        if (
          field === undefined &&
          layout[place] !==
            (fallback !== null && placed.has(fallback) ? null : fallback)
        )
          wrong.push(JSON.stringify(staged));
      }
    }
    expect(wrong.slice(0, 5)).toEqual([]);
    expect(stagings).toHaveLength(6 ** 7);
    // Every one of 6^7 stagings: slow on a loaded machine, so it has the time.
  }, 30_000);

  it("pins a flag to any corner's field, on its inner side", () => {
    expect(
      resolveRowLayout({
        titleBadge: null,
        subtitleTrailingBadge: "structure",
      }),
    ).toEqual({
      ...DEFAULT_ROW_LAYOUT,
      titleBadge: null,
      subtitleTrailingBadge: "structure",
    });
    // Its default is placed elsewhere, so the name's badge gives it up.
    expect(resolveRowLayout({ subtitleBadge: "structure" }).titleBadge).toBe(
      null,
    );
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
      ...NO_BADGES,
      subtitleTrailingBadge: "structure",
      titleBadge: null,
      titleTrailing: "people",
      subtitle: "states",
      subtitleTrailing: null,
    };

    expect(resolveRowLayout(layout)).toEqual(layout);
  });
});

describe("drawnRowLayout", () => {
  it("leaves a layout with every badge beside a field as it is", () => {
    const layout: RowLayout = {
      titleBadge: null,
      titleTrailingBadge: "structure",
      titleTrailing: "states",
      subtitle: "address",
      subtitleBadge: null,
      subtitleTrailingBadge: null,
      subtitleTrailing: "people",
    };
    expect(drawnRowLayout(DEFAULT_ROW_LAYOUT)).toEqual(DEFAULT_ROW_LAYOUT);
    expect(drawnRowLayout(layout)).toEqual(layout);
  });

  it("draws a badge beside an empty field as that field", () => {
    expect(
      drawnRowLayout({
        ...DEFAULT_ROW_LAYOUT,
        titleTrailingBadge: "states",
        titleTrailing: null,
      }),
    ).toEqual(DEFAULT_ROW_LAYOUT);
    expect(
      drawnRowLayout({
        ...DEFAULT_ROW_LAYOUT,
        subtitle: null,
        subtitleBadge: "address",
      }),
    ).toEqual(DEFAULT_ROW_LAYOUT);
  });

  it("draws the second line's right corner, badge and all, in an empty lead", () => {
    expect(
      drawnRowLayout({
        ...DEFAULT_ROW_LAYOUT,
        subtitle: null,
        subtitleTrailingBadge: "address",
      }),
    ).toEqual({
      ...DEFAULT_ROW_LAYOUT,
      subtitle: "people",
      subtitleBadge: "address",
      subtitleTrailing: null,
    });
    // A lone badge on the right is the field it would be beside.
    expect(
      drawnRowLayout({
        ...DEFAULT_ROW_LAYOUT,
        subtitle: null,
        subtitleTrailingBadge: "address",
        subtitleTrailing: null,
      }),
    ).toEqual({ ...DEFAULT_ROW_LAYOUT, subtitleTrailing: null });
  });

  it("draws every layout with no badge beside an empty field and no second line led by a gap, as one it leaves as it is", () => {
    const choices = [null, ...ROW_FIELDS];
    let layouts: RowLayout[] = [{} as RowLayout];
    for (const place of ROW_PLACES) {
      layouts = layouts.flatMap(layout =>
        choices.map(field => ({ ...layout, [place]: field })),
      );
    }
    // Each corner with a field of its own, as its badge and its field.
    const corners = [
      { badge: "titleTrailingBadge", field: "titleTrailing" },
      { badge: "subtitleBadge", field: "subtitle" },
      { badge: "subtitleTrailingBadge", field: "subtitleTrailing" },
    ] as const;
    const wrong: string[] = [];
    for (const layout of layouts) {
      const drawn = drawnRowLayout(layout);
      expect(drawnRowLayout(drawn)).toEqual(drawn);
      // Nothing is lost or doubled: the same fields, in the drawn places.
      const fields = (l: RowLayout) =>
        ROW_PLACES.map(place => l[place])
          .filter(field => field !== null)
          .sort();
      expect(fields(drawn)).toEqual(fields(layout));
      const badgeBesideNothing = corners.some(
        ({ badge, field }) => drawn[field] === null && drawn[badge] !== null,
      );
      const ledByAGap =
        drawn.subtitle === null &&
        (drawn.subtitleTrailing !== null ||
          drawn.subtitleTrailingBadge !== null);
      if (
        badgeBesideNothing ||
        ledByAGap ||
        drawn.titleBadge !== layout.titleBadge
      )
        wrong.push(JSON.stringify(layout));
    }
    expect(wrong.slice(0, 5)).toEqual([]);
    expect(layouts).toHaveLength(5 ** 7);
    // Every one of 5^7 layouts: slow on a loaded machine, so it has the time.
  }, 30_000);
});

describe("ROW_LINES", () => {
  it("types a bare RowLine's line as a business row's, so a switch over it stays exhaustive", () => {
    expectTypeOf<RowLine["line"]>().toEqualTypeOf<"title" | "subtitle">();
  });

  it("groups every place into its line's two corners, in reading order", () => {
    expect(
      ROW_LINES.flatMap(({ lead, trailing }) => [
        lead.field,
        lead.badge,
        trailing.badge,
        trailing.field,
      ]).filter(place => place !== null),
    ).toEqual(ROW_PLACES);
  });

  it("leads the first line with the name, which no place holds", () => {
    expect(ROW_LINES.map(({ line }) => line)).toEqual(["title", "subtitle"]);
    expect(ROW_LINES[0].lead.field).toBeNull();
    expect(ROW_LINES[1].lead.field).toBe("subtitle");
  });
});

describe("a layout drawn line by line", () => {
  /**
   * Each line a row draws for a staged layout, as `field+badge|badge+field`,
   * `-` for an empty place and `name` for the title's lead; a line with
   * nothing in its lead draws nothing.
   */
  function linesOf(staged: RowLayoutInput): string[] {
    const drawn = drawnRowLayout(resolveRowLayout(staged));
    const f = (place: RowPlace) => drawn[place] ?? "-";
    return ROW_LINES.flatMap(({ lead, trailing }) => {
      const leadField = lead.field === null ? "name" : f(lead.field);
      return leadField === "-"
        ? []
        : [
            `${leadField}+${f(lead.badge)}|${f(trailing.badge)}+${f(trailing.field)}`,
          ];
    });
  }

  it("draws the default layout on two lines", () => {
    expect(linesOf({})).toEqual([
      "name+structure|-+states",
      "address+-|-+people",
    ]);
  });

  it.each([
    [
      { titleBadge: "people", subtitle: "states", subtitleTrailing: "address" },
      ["name+people|-+-", "states+-|-+address"],
    ],
    // A flag pinned to a corner's field, on its inner side.
    [
      { titleBadge: null, subtitleTrailingBadge: "structure" },
      ["name+-|-+states", "address+-|structure+people"],
    ],
    [
      { titleBadge: null, subtitleBadge: "structure" },
      ["name+-|-+states", "address+structure|-+people"],
    ],
    [
      { titleBadge: null, titleTrailingBadge: "structure" },
      ["name+-|structure+states", "address+-|-+people"],
    ],
    // No subtitle: the trailing corner is drawn in the lead's, badge and all.
    [{ subtitle: null }, ["name+structure|-+states", "people+-|-+-"]],
    [
      { subtitle: null, titleBadge: null, subtitleTrailingBadge: "structure" },
      ["name+-|-+states", "people+structure|-+-"],
    ],
    // A badge beside nothing is drawn as its corner's field.
    [
      { subtitle: null, titleBadge: null, subtitleBadge: "structure" },
      ["name+-|-+states", "structure+-|-+people"],
    ],
    [
      {
        titleTrailing: null,
        titleTrailingBadge: "people",
        subtitleTrailing: null,
      },
      ["name+structure|-+people", "address+-|-+-"],
    ],
    // Nothing placed on the second line: the first line is the row.
    [{ subtitle: null, subtitleTrailing: null }, ["name+structure|-+states"]],
    [
      {
        titleBadge: null,
        titleTrailing: null,
        subtitle: null,
        subtitleTrailing: null,
      },
      ["name+-|-+-"],
    ],
  ] satisfies [RowLayoutInput, string[]][])(
    "lays out %j as %j",
    (staged, lines) => {
      expect(linesOf(staged)).toEqual(lines);
    },
  );
});

describe("includeForLayout", () => {
  it("asks for the people and the addresses by default, in the autocomplete service's order", () => {
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
