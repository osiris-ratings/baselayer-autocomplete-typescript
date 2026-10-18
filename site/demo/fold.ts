import { useEffect, useRef, useState, type RefObject } from "react";

/** A panel folded: nothing of it left, margin and padding too. */
const FOLDED = {
  height: "0px",
  marginBottom: "0px",
  paddingBlock: "0px",
  opacity: 0,
  overflow: "hidden",
};

const FOLD_ANIMATION = {
  duration: 280,
  easing: "cubic-bezier(0.2, 0.7, 0.2, 1)",
};

/** Whether a panel can be animated: not under a reduced-motion setting. */
function canAnimate(): boolean {
  return (
    typeof Element !== "undefined" &&
    typeof Element.prototype.animate === "function" &&
    !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * A panel under a toggle (the filters', the key step's session settings):
 * opening it unfolds the panel downwards, and closing it folds it up. Its
 * height runs between nothing and what it is, the page below making room as
 * it does. The panel stays on the page until it has folded, which is `shown`.
 * Not under a reduced-motion setting, nor where there is nothing to animate
 * with: there it is shown and hidden at once.
 */
export function useFoldPanel(open: boolean): {
  panel: RefObject<HTMLDivElement | null>;
  shown: boolean;
} {
  const panel = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  if (open && !shown) setShown(true);
  if (!open && shown && !canAnimate()) setShown(false);
  useEffect(() => {
    const element = panel.current;
    if (element === null || !canAnimate() || (!open && !shown)) {
      return;
    }
    const full = {
      height: `${element.getBoundingClientRect().height}px`,
      overflow: "hidden",
    };
    if (open) {
      const unfold = element.animate([FOLDED, full], FOLD_ANIMATION);
      return () => unfold.cancel();
    }
    const fold = element.animate([full, FOLDED], {
      ...FOLD_ANIMATION,
      fill: "forwards",
    });
    // Held at nothing until the panel is hidden: cancelling it here would
    // show the panel whole for a frame. The cleanup cancels it, the render
    // after this having hidden the panel by then.
    fold.onfinish = () => setShown(false);
    return () => fold.cancel();
  }, [open, shown]);
  return { panel, shown };
}
