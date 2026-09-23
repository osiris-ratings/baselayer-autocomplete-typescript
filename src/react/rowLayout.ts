import type { RowPart, RowParts } from "@baselayer/autocomplete";

/** A place in a row: the title, which always shows, or a part a host may leave out. */
export type RowPlace = "title" | RowPart;

export interface RowLine {
  left: RowPlace;
  right: RowPlace | null;
}

/**
 * Where a row's parts go. A row has four places, each named for the part it
 * holds: the title and the flags on the first line, the subtitle and the
 * secondary subtitle on the second. With the subtitle left out, the secondary
 * subtitle is promoted to its place, so no line starts with a gap.
 *
 * It follows the parts asked for, not what a row holds, so every row of a
 * menu shares one layout and its columns line up; a row without a part (no
 * officers) leaves that part's place empty.
 */
export function rowLayout(parts: RowParts): RowLine[] {
  const flags = parts.flags ? "flags" : null;
  let subtitle: RowPart | null = parts.subtitle ? "subtitle" : null;
  let secondary: RowPart | null = parts.secondarySubtitle
    ? "secondarySubtitle"
    : null;
  if (subtitle === null) {
    [subtitle, secondary] = [secondary, null];
  }
  const title: RowLine = { left: "title", right: flags };
  return subtitle === null
    ? [title]
    : [title, { left: subtitle, right: secondary }];
}
