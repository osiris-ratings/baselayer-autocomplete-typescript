import { describe, expect, it } from "vitest";

import {
  DEFAULT_ROW_LAYOUT,
  resolveRowLayout,
  type RowLayoutInput,
} from "@baselayer-sdk/autocomplete";

import {
  rowLines,
  type Corner,
  type RowLines,
} from "../../src/react/rowLayout";

const f = (field: string | null) => field ?? "-";
/** A lead corner as `field+badge`, a trailing one as `badge+field`. */
const lead = (corner: Corner) => `${f(corner.field)}+${f(corner.badge)}`;
const trailing = (corner: Corner) => `${f(corner.badge)}+${f(corner.field)}`;

function drawn(lines: RowLines): string[] {
  const title = `name+${f(lines.title.badge)}|${trailing(lines.title.trailing)}`;
  return lines.subtitle === null
    ? [title]
    : [
        title,
        `${lead(lines.subtitle.lead)}|${trailing(lines.subtitle.trailing)}`,
      ];
}

const lay = (staged: RowLayoutInput) =>
  drawn(rowLines(resolveRowLayout(staged)));

describe("rowLines", () => {
  it("draws the default layout on two lines", () => {
    expect(drawn(rowLines(DEFAULT_ROW_LAYOUT))).toEqual([
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
    // A badge alone keeps its corner.
    [
      { subtitle: null, titleBadge: null, subtitleBadge: "structure" },
      ["name+-|-+states", "-+structure|-+people"],
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
      expect(lay(staged)).toEqual(lines);
    },
  );
});
