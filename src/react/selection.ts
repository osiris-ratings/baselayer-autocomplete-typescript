// What the typeaheads share about a pick from a line under a row: where a
// person or an address picked goes, and the line under the field naming it.

import { useState } from "react";

import type { EntityPick, EntityType } from "@baselayer-sdk/autocomplete";

/** What the line under the field names: the picked line's label and type. */
export interface GroupedSelection {
  type: EntityType;
  label: string;
}

/**
 * Where a pick goes. A business goes to `onPick`; a person or an address can
 * be picked only where `pickable` names it, and goes to `onPickEntity`, which
 * is then required.
 */
export type PickTargets =
  | {
      /** Which lines can be picked, by type. Default: businesses. */
      pickable?: readonly "business"[] | undefined;
      onPickEntity?: ((pick: EntityPick) => void) | undefined;
    }
  | {
      pickable: readonly EntityType[];
      /** A person or an address picked: the row itself, or one it lists. */
      onPickEntity(pick: EntityPick): void;
    };

/**
 * A pick's hold on the field, and the line under it. A pick puts a name in
 * the field; a host may take it a render or more later, and until then the
 * field still holds what was typed and the pick waits. Anything else, before
 * the name or after it, lets the pick go for good, so a name typed or put
 * back later is not the pick again. The line names what was picked while the
 * field holds the pick's name, and never when the pick named none.
 */
export function usePickedSelection(value: string, showSelection: boolean) {
  const [picked, setPicked] = useState<{
    field: string;
    before: string;
    held: boolean;
    selection: GroupedSelection | null;
  } | null>(null);
  if (picked !== null) {
    if (value === picked.field) {
      if (!picked.held) setPicked({ ...picked, held: true });
    } else if (picked.held || value !== picked.before) {
      setPicked(null);
    }
  }
  return {
    selection:
      showSelection && picked !== null && value === picked.field
        ? picked.selection
        : null,
    /** A pick that puts `field` in the field, the line naming `selection`. */
    pick(field: string, selection: GroupedSelection | null) {
      setPicked({ field, before: value, held: field === value, selection });
    },
  };
}
