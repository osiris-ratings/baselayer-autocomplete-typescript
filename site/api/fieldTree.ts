// The response fields as a tree to fold: which rows sit under which, and
// which show for a given set of open parents. Pure, over the flat,
// depth-marked rows `fieldRows` emits (a row's children follow it, one level
// deeper, until a row at its own depth or shallower).

interface Row {
  path: string;
  depth: number;
}

export interface TreeInfo {
  /** The paths of the rows this one is nested under, nearest last. */
  ancestors: string[];
  /** How many rows sit directly under this one. */
  childCount: number;
}

export function fieldTree(rows: readonly Row[]): TreeInfo[] {
  const stack: string[] = [];
  const info: TreeInfo[] = rows.map(row => {
    stack.length = row.depth;
    const ancestors = [...stack];
    stack.push(row.path);
    return { ancestors, childCount: 0 };
  });
  rows.forEach((row, index) => {
    for (let next = index + 1; next < rows.length; next++) {
      const depth = rows[next]!.depth;
      if (depth <= row.depth) break;
      if (depth === row.depth + 1) info[index]!.childCount += 1;
    }
  });
  return info;
}

/** The rows on screen: every row whose ancestors are all open. */
export function visibleRows<T extends Row>(
  rows: readonly T[],
  open: ReadonlySet<string>,
): T[] {
  const tree = fieldTree(rows);
  return rows.filter((_, index) =>
    tree[index]!.ancestors.every(path => open.has(path)),
  );
}
