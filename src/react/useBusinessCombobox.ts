import { useCombobox, type UseComboboxReturnValue } from "downshift";
import type { ChangeEvent, FocusEventHandler, Ref } from "react";

import type { BusinessSuggestion } from "@baselayer/autocomplete";

export interface UseBusinessComboboxOptions {
  id: string;
  items: BusinessSuggestion[];
  /** The input's value; the host owns it. */
  inputValue: string;
  /** Typing only. A pick rewrites the input without a change event. */
  onInputChange(value: string): void;
  onPick(item: BusinessSuggestion): void;
  /** Whether a footer row (count, "searching", an error) has anything to say. */
  hasFooter: boolean;
}

export interface BusinessCombobox extends Pick<
  UseComboboxReturnValue<BusinessSuggestion>,
  | "getLabelProps"
  | "getMenuProps"
  | "getItemProps"
  | "highlightedIndex"
  | "isOpen"
> {
  /** What is actually on screen, which downshift's own `isOpen` is not. */
  menuVisible: boolean;
  hasRows: boolean;
  getInputProps(extra?: {
    ref?: Ref<HTMLInputElement> | undefined;
    name?: string | undefined;
    onFocus?: FocusEventHandler<HTMLInputElement> | undefined;
    onBlur?: FocusEventHandler<HTMLInputElement> | undefined;
    [key: string]: unknown;
  }): Record<string, unknown>;
  /** A live region: the count, "searching" and every error are announced. */
  getFooterProps(): { role: "status"; "aria-live": "polite" };
}

/**
 * ARIA 1.2 combobox wiring over downshift, with the console's three decisions:
 *
 * - typing reaches the host from the input's own change event, not from
 *   downshift's `onInputValueChange`, which reports one render late and makes
 *   the caret jump to the end on a mid-word insert;
 * - a blur is not a pick: downshift commits the highlighted row on blur, and a
 *   pointer resting on the menu is what highlights one;
 * - `aria-expanded` follows what is drawn, and the footer lives outside the
 *   listbox, so a screen reader hears a list of businesses and then a note.
 */
export function useBusinessCombobox({
  id,
  items,
  inputValue,
  onInputChange,
  onPick,
  hasFooter,
}: UseBusinessComboboxOptions): BusinessCombobox {
  const combobox = useCombobox<BusinessSuggestion>({
    id,
    items,
    inputValue,
    itemToString: item => item?.label ?? "",
    onSelectedItemChange: ({ selectedItem }) => {
      if (selectedItem) {
        onPick(selectedItem);
      }
    },
    stateReducer: (state, { type, changes }) =>
      type === useCombobox.stateChangeTypes.InputBlur
        ? {
            ...changes,
            selectedItem: state.selectedItem,
            inputValue: state.inputValue,
          }
        : changes,
  });
  const hasRows = combobox.isOpen && items.length > 0;
  const menuVisible = hasRows || (combobox.isOpen && hasFooter);
  return {
    isOpen: combobox.isOpen,
    highlightedIndex: combobox.highlightedIndex,
    getLabelProps: combobox.getLabelProps,
    getMenuProps: combobox.getMenuProps,
    getItemProps: combobox.getItemProps,
    menuVisible,
    hasRows,
    getInputProps: (extra = {}) =>
      combobox.getInputProps({
        ...extra,
        // Overrides downshift's, which follows its `isOpen` rather than what
        // is rendered.
        "aria-expanded": menuVisible,
        onChange: (event: ChangeEvent<HTMLInputElement>) =>
          onInputChange(event.currentTarget.value),
      }),
    getFooterProps: () => ({ role: "status", "aria-live": "polite" }),
  };
}
