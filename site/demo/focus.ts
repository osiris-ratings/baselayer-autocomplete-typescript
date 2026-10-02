// Whether focus is anywhere inside an element, which `:focus-within` knows for
// a stylesheet and a component cannot ask: the demo's filter fields hold the
// menu open as they are typed in, and let it close when focus leaves them all.

import { useState, type FocusEvent } from "react";

/**
 * True while focus is in the element `bind` is spread on, or any element in
 * it: a move between two of its fields is not leaving.
 */
export function useFocusWithin(): readonly [
  boolean,
  {
    onFocus: () => void;
    onBlur: (event: FocusEvent<HTMLElement>) => void;
  },
] {
  const [within, setWithin] = useState(false);
  return [
    within,
    {
      onFocus: () => setWithin(true),
      onBlur: event => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setWithin(false);
        }
      },
    },
  ] as const;
}
