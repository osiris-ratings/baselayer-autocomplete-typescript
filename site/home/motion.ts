// What the overview's moving parts share: whether to move at all (reduced
// motion, on screen, a tab that is showing), and waits a cancelled run can
// abandon. Safe to render on the server, where the diagrams are exported:
// there nothing moves.

import { useEffect, useState, type RefObject } from "react";

const REDUCE = "(prefers-reduced-motion: reduce)";

/** Whether the reader asked for less motion; true where there is no window. */
export function usePrefersStill(): boolean {
  const [still, setStill] = useState(() =>
    typeof matchMedia === "function" ? matchMedia(REDUCE).matches : true,
  );
  useEffect(() => {
    const query = matchMedia(REDUCE);
    const change = () => setStill(query.matches);
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);
  return still;
}

/** Whether `target` is on screen, enough of it, in a tab that is showing. */
export function useInView(
  target: RefObject<Element | null>,
  threshold = 0.35,
): boolean {
  const [seen, setSeen] = useState(false);
  const [shown, setShown] = useState(() =>
    typeof document === "undefined" ? false : !document.hidden,
  );
  useEffect(() => {
    const element = target.current;
    if (element === null) return;
    const observer = new IntersectionObserver(
      ([entry]) => setSeen(entry?.isIntersecting ?? false),
      { threshold },
    );
    observer.observe(element);
    const visibility = () => setShown(!document.hidden);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [target, threshold]);
  return seen && shown;
}

/**
 * A wait of `ms` that rejects, its timer cleared, when `signal` aborts; one
 * that ends leaves no listener behind.
 */
export function waiter(signal: AbortSignal): (ms: number) => Promise<void> {
  return ms =>
    new Promise<void>((resolve, reject) => {
      const abort = () => {
        window.clearTimeout(timer);
        reject(signal.reason);
      };
      const timer = window.setTimeout(() => {
        signal.removeEventListener("abort", abort);
        resolve();
      }, ms);
      signal.addEventListener("abort", abort, { once: true });
    });
}
