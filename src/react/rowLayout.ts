import {
  drawnRowLayout,
  type RowField,
  type RowLayout,
} from "@baselayer-sdk/autocomplete";

/** A corner: its field, and the badge pinned to its inner side. */
export interface Corner {
  field: RowField | null;
  badge: RowField | null;
}

export interface RowLines {
  /** The first line: the badge after the name, and the trailing corner. */
  title: { badge: RowField | null; trailing: Corner };
  /** The second line's lead and trailing corners, or null when nothing is placed on it. */
  subtitle: { lead: Corner; trailing: Corner } | null;
}

/**
 * What a row draws on each line: the layout as drawn (`drawnRowLayout`), so
 * no badge sits beside nothing and the second line never starts with a gap;
 * with nothing placed on it, there is no second line.
 *
 * It follows the layout, not what a row holds, so every row of a menu shares
 * one and its columns line up; a row without a field (no officers) leaves
 * that field's place empty.
 */
export function rowLines(layout: RowLayout): RowLines {
  const drawn = drawnRowLayout(layout);
  return {
    title: {
      badge: drawn.titleBadge,
      trailing: {
        field: drawn.titleTrailing,
        badge: drawn.titleTrailingBadge,
      },
    },
    subtitle:
      drawn.subtitle === null
        ? null
        : {
            lead: { field: drawn.subtitle, badge: drawn.subtitleBadge },
            trailing: {
              field: drawn.subtitleTrailing,
              badge: drawn.subtitleTrailingBadge,
            },
          },
  };
}
