import { describe, expect, it } from "vitest";

import { ROW_PARTS, type RowParts } from "@baselayer/autocomplete";

import { rowLayout } from "../../src/react/rowLayout";

const T = "title";
const F = "flags";
const S = "subtitle";
const X = "secondarySubtitle";

function parts(...on: (typeof ROW_PARTS)[number][]): RowParts {
  return Object.fromEntries(
    ROW_PARTS.map(part => [part, on.includes(part)]),
  ) as RowParts;
}

/** A layout as `left|right` per line, `-` for an empty right. */
function drawn(layout: ReturnType<typeof rowLayout>): string[] {
  return layout.map(line => `${line.left}|${line.right ?? "-"}`);
}

describe("rowLayout", () => {
  it("names the parts a host may leave out: every part but the title", () => {
    expect(ROW_PARTS).toEqual([F, S, X]);
  });

  it.each([
    // Every part: the title line and the subtitle line, as ever.
    [
      [F, S, X],
      [`${T}|${F}`, `${S}|${X}`],
    ],
    [
      [F, S],
      [`${T}|${F}`, `${S}|-`],
    ],
    // No subtitle: the secondary subtitle is promoted to subtitle.
    [
      [F, X],
      [`${T}|${F}`, `${X}|-`],
    ],
    [[F], [`${T}|${F}`]],
    // No flags: every other part keeps its place.
    [
      [S, X],
      [`${T}|-`, `${S}|${X}`],
    ],
    [[S], [`${T}|-`, `${S}|-`]],
    [[X], [`${T}|-`, `${X}|-`]],
    // Nothing else: the title is the row.
    [[], [`${T}|-`]],
  ] as const)("lays out %j as %j", (on, lines) => {
    expect(drawn(rowLayout(parts(...on)))).toEqual(lines);
  });
});
