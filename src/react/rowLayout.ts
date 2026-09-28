import type { RowField, RowLayout } from "@baselayer-sdk/autocomplete";

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

const EMPTY: Corner = { field: null, badge: null };
const isEmpty = (corner: Corner) =>
  corner.field === null && corner.badge === null;

/**
 * What a row draws on each line. With the second line's lead corner empty,
 * its trailing corner is drawn in the lead's place, badge and all, so the
 * line never starts with a gap; with both empty, there is no second line.
 *
 * It follows the layout, not what a row holds, so every row of a menu shares
 * one and its columns line up; a row without a field (no officers) leaves
 * that field's place empty.
 */
export function rowLines(layout: RowLayout): RowLines {
  const lead: Corner = { field: layout.subtitle, badge: layout.subtitleBadge };
  const trailing: Corner = {
    field: layout.subtitleTrailing,
    badge: layout.subtitleTrailingBadge,
  };
  return {
    title: {
      badge: layout.titleBadge,
      trailing: {
        field: layout.titleTrailing,
        badge: layout.titleTrailingBadge,
      },
    },
    subtitle: isEmpty(lead)
      ? isEmpty(trailing)
        ? null
        : { lead: trailing, trailing: EMPTY }
      : { lead, trailing },
  };
}
