// Something that goes from the page closes up first and is taken away after:
// it is kept, as it was, while it plays its exit.

import { useEffect, useState } from "react";

/**
 * `value` while there is one, and for `ms` after it goes: the last one, with
 * `leaving` set, so what draws it can close up around the content it had
 * rather than around nothing. A new value during the exit replaces the old at
 * once and cancels the removal.
 */
export function useExit<T>(
  value: T | null,
  ms: number,
): { shown: T | null; leaving: boolean } {
  const [kept, setKept] = useState<T | null>(value);
  // Follows the live value while there is one. Set during the render, so that
  // no frame draws the old value beside the new.
  if (value !== null && value !== kept) {
    setKept(value);
  }
  useEffect(() => {
    if (value !== null || kept === null) {
      return;
    }
    const timer = window.setTimeout(() => setKept(null), ms);
    return () => window.clearTimeout(timer);
  }, [value, kept, ms]);
  return { shown: value ?? kept, leaving: value === null && kept !== null };
}
