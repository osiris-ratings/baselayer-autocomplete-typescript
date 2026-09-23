import type { RowPart, RowParts } from "@baselayer/autocomplete";

export interface RowLine {
  left: RowPart;
  right: RowPart | null;
}

/**
 * Where a row's parts go. A row has four places, each named for the part it
 * holds: the title and the flags on the first line, the subtitle and the
 * secondary subtitle on the second. A place whose part is left out takes the
 * part below it, so no line starts with a gap: the secondary subtitle is
 * promoted to subtitle, the subtitle to title, and flags left alone lead
 * their line. With nothing asked for, the title still shows.
 *
 * It follows the parts asked for, not what a row holds, so every row of a
 * menu shares one layout and its columns line up; a row without a part (no
 * officers) leaves that part's place empty.
 */
export function rowLayout(parts: RowParts): RowLine[] {
  const shown = (part: RowPart) => (parts[part] ? part : null);
  let title = shown("title");
  let flags = shown("flags");
  let subtitle = shown("subtitle");
  let secondary = shown("secondarySubtitle");
  if (subtitle === null) {
    [subtitle, secondary] = [secondary, null];
  }
  if (title === null) {
    [title, subtitle, secondary] = [subtitle, secondary, null];
  }
  if (title === null) {
    [title, flags] = [flags ?? "title", null];
  }
  return subtitle === null
    ? [{ left: title, right: flags }]
    : [
        { left: title, right: flags },
        { left: subtitle, right: secondary },
      ];
}
