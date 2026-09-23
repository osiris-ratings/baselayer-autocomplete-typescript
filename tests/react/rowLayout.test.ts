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
  it.each([
    // Every part: the title line and the subtitle line, as ever.
    [
      [T, F, S, X],
      [`${T}|${F}`, `${S}|${X}`],
    ],
    [
      [T, F, S],
      [`${T}|${F}`, `${S}|-`],
    ],
    // No flags: every other part keeps its place.
    [
      [T, S, X],
      [`${T}|-`, `${S}|${X}`],
    ],
    // No subtitle: the secondary subtitle is promoted to subtitle.
    [
      [T, F, X],
      [`${T}|${F}`, `${X}|-`],
    ],
    [
      [T, S],
      [`${T}|-`, `${S}|-`],
    ],
    [[T, F], [`${T}|${F}`]],
    [
      [T, X],
      [`${T}|-`, `${X}|-`],
    ],
    [[T], [`${T}|-`]],
    // No title: the subtitle is promoted to title, the secondary to subtitle.
    [
      [F, S, X],
      [`${S}|${F}`, `${X}|-`],
    ],
    [[F, S], [`${S}|${F}`]],
    [
      [S, X],
      [`${S}|-`, `${X}|-`],
    ],
    [[S], [`${S}|-`]],
    // No title and no subtitle: the secondary subtitle, promoted twice, leads.
    [[F, X], [`${X}|${F}`]],
    [[X], [`${X}|-`]],
    // A part alone sits at the left.
    [[F], [`${F}|-`]],
  ] as const)("lays out %j as %j", (on, lines) => {
    expect(drawn(rowLayout(parts(...on)))).toEqual(lines);
  });

  it("still shows the title when no part is asked for", () => {
    expect(drawn(rowLayout(parts()))).toEqual([`${T}|-`]);
  });
});
