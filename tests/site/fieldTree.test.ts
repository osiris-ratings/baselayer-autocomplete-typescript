import { describe, expect, it } from "vitest";

import { fieldTree, visibleRows } from "../../site/api/fieldTree";

// The response's field rows, flat and depth-marked, as fieldRows emits them.
const rows = [
  { path: "query", depth: 0 },
  { path: "sources", depth: 0 },
  { path: "sources.people", depth: 1 },
  { path: "sources.people.status", depth: 2 },
  { path: "sources.addresses", depth: 1 },
  { path: "suggestions", depth: 0 },
  { path: "suggestions[].label", depth: 1 },
  { path: "suggestions[].related", depth: 1 },
  { path: "suggestions[].related.people", depth: 2 },
  { path: "found", depth: 0 },
];

describe("fieldTree", () => {
  const tree = fieldTree(rows);

  it("names each row's ancestors, nearest last", () => {
    expect(tree[3]!.ancestors).toEqual(["sources", "sources.people"]);
    expect(tree[8]!.ancestors).toEqual([
      "suggestions",
      "suggestions[].related",
    ]);
    expect(tree[9]!.ancestors).toEqual([]);
  });

  it("counts direct children only", () => {
    expect(tree[1]!.childCount).toBe(2);
    expect(tree[2]!.childCount).toBe(1);
    expect(tree[5]!.childCount).toBe(2);
    expect(tree[0]!.childCount).toBe(0);
    expect(tree[4]!.childCount).toBe(0);
  });
});

describe("visibleRows", () => {
  it("shows the top level only, collapsed", () => {
    expect(visibleRows(rows, new Set()).map(r => r.path)).toEqual([
      "query",
      "sources",
      "suggestions",
      "found",
    ]);
  });

  it("opens one level at a time", () => {
    expect(
      visibleRows(rows, new Set(["suggestions"])).map(r => r.path),
    ).toEqual([
      "query",
      "sources",
      "suggestions",
      "suggestions[].label",
      "suggestions[].related",
      "found",
    ]);
  });

  it("keeps a row hidden while any ancestor is closed", () => {
    const open = new Set(["suggestions[].related"]);
    expect(visibleRows(rows, open).map(r => r.path)).not.toContain(
      "suggestions[].related.people",
    );
  });
});
