import type { RowField, RowLayout } from "@baselayer-sdk/autocomplete";

export interface RowLines {
  /** The first line, led by the title: the badge after the name, and the trailing field. */
  title: { badge: RowField | null; trailing: RowField | null };
  /** The second line's lead and trailing fields, or null when nothing is placed on it. */
  subtitle: { lead: RowField; trailing: RowField | null } | null;
}

/**
 * What a row draws on each line. With `subtitle` empty, the field in
 * `subtitleTrailing` is drawn in its place, so the second line never starts
 * with a gap; with neither, there is no second line.
 *
 * It follows the layout, not what a row holds, so every row of a menu shares
 * one and its columns line up; a row without a field (no officers) leaves
 * that field's place empty.
 */
export function rowLines(layout: RowLayout): RowLines {
  const lead = layout.subtitle ?? layout.subtitleTrailing;
  return {
    title: { badge: layout.titleBadge, trailing: layout.titleTrailing },
    subtitle:
      lead === null
        ? null
        : {
            lead,
            trailing: layout.subtitle === null ? null : layout.subtitleTrailing,
          },
  };
}
