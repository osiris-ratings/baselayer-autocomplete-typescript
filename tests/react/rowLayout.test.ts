import { describe, expect, it } from "vitest";

import {
  DEFAULT_ROW_LAYOUT,
  resolveRowLayout,
  type RowLayoutInput,
} from "@baselayer-sdk/autocomplete";

import { rowLines, type RowLines } from "../../src/react/rowLayout";

/**
 * The lines as drawn, a place per slot: `name+badge|trailing` for the first,
 * `lead|trailing` for the second, `-` for an empty place.
 */
function drawn(lines: RowLines): string[] {
  const title = `name+${lines.title.badge ?? "-"}|${lines.title.trailing ?? "-"}`;
  return lines.subtitle === null
    ? [title]
    : [title, `${lines.subtitle.lead}|${lines.subtitle.trailing ?? "-"}`];
}

const lay = (staged: RowLayoutInput) =>
  drawn(rowLines(resolveRowLayout(staged)));

describe("rowLines", () => {
  it("draws the default layout on two lines", () => {
    expect(drawn(rowLines(DEFAULT_ROW_LAYOUT))).toEqual([
      "name+structure|states",
      "address|people",
    ]);
  });

  it.each([
    // A field in every place.
    [
      { titleBadge: "people", subtitle: "states", subtitleTrailing: "address" },
      ["name+people|-", "states|address"],
    ],
    // No subtitle: its trailing field is drawn in its place.
    [{ subtitle: null }, ["name+structure|states", "people|-"]],
    [
      { subtitle: null, subtitleTrailing: "states", titleTrailing: null },
      ["name+structure|-", "states|-"],
    ],
    // Nothing placed on the second line: the first line is the row.
    [{ subtitle: null, subtitleTrailing: null }, ["name+structure|states"]],
    // Only the title: a row is the entity it names.
    [
      {
        titleBadge: null,
        titleTrailing: null,
        subtitle: null,
        subtitleTrailing: null,
      },
      ["name+-|-"],
    ],
    // An empty trailing place leaves its lead where it is.
    [{ subtitleTrailing: null }, ["name+structure|states", "address|-"]],
    [{ titleBadge: null }, ["name+-|states", "address|people"]],
  ] satisfies [RowLayoutInput, string[]][])(
    "lays out %j as %j",
    (staged, lines) => {
      expect(lay(staged)).toEqual(lines);
    },
  );
});
