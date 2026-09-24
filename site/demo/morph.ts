// The demo's panes change as view transitions, so each morphs from where it
// was instead of jumping: a pane grows out of its tab, its label turning from
// the tab's spine into the pane's head, and folds back into it the same way.

import { flushSync } from "react-dom";

/** Which way a pane's label turns, when the pane opens or closes. */
export interface MorphTurns {
  side?: "open" | "close";
  intro?: "open" | "close";
}

// Folding a pane away is two steps, not one: it collapses into its tab where
// it stands, and only then does the page close up around it. demo.css's
// collapse-first rules keep the same times.
const FOLD_STARTS_MS = 160;
const FOLDED_MS = 560;
const MOVED_MS = 980;
const EASE = "cubic-bezier(0.2, 0, 0, 1)";

let latest = 0;

/**
 * Runs `update` (state setters) as a view transition. Instant where the
 * browser has no view transitions, or motion is reduced.
 */
export function morph(update: () => void, turns: MorphTurns = {}): void {
  if (
    typeof document.startViewTransition !== "function" ||
    matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    update();
    return;
  }
  const root = document.documentElement;
  const id = ++latest;
  const folding = [
    ...(turns.side === "close" ? ["side-head"] : []),
    ...(turns.intro === "close" ? ["intro-head"] : []),
  ];
  // Opening one pane folds the introduction along with it, all at once.
  const foldFirst =
    folding.length > 0 && turns.side !== "open" && turns.intro !== "open";
  root.dataset.morphSide = turns.side ?? "none";
  root.dataset.morphIntro = turns.intro ?? "none";
  root.dataset.morphOrder = foldFirst ? "collapse-first" : "together";
  const done = () => {
    // A newer morph may have started, with turns of its own.
    if (id === latest) {
      delete root.dataset.morphSide;
      delete root.dataset.morphIntro;
      delete root.dataset.morphOrder;
    }
  };
  const transition = document.startViewTransition(() => flushSync(update));
  if (foldFirst) {
    transition.ready.then(() => folding.forEach(foldInPlace), done);
  }
  transition.finished.then(done, done);
}

/**
 * Holds a folding head where it stands while it draws in to its tab's size,
 * and only then moves it to where the tab goes. The browser's own keyframes
 * carry the two boxes; this re-times them.
 */
function foldInPlace(name: string): void {
  const group = document
    .getAnimations()
    .find(
      animation =>
        animation.effect instanceof KeyframeEffect &&
        animation.effect.pseudoElement === `::view-transition-group(${name})`,
    );
  if (group === undefined || !(group.effect instanceof KeyframeEffect)) return;
  const frames = group.effect.getKeyframes();
  const from = frames[0];
  const to = frames[frames.length - 1];
  if (from === undefined || to === undefined) return;
  const at = (box: ComputedKeyframe, size: ComputedKeyframe) => ({
    transform: box.transform,
    width: size.width,
    height: size.height,
  });
  group.effect.setKeyframes([
    { offset: 0, ...at(from, from) },
    { offset: FOLD_STARTS_MS / MOVED_MS, ...at(from, from), easing: EASE },
    { offset: FOLDED_MS / MOVED_MS, ...at(from, to), easing: EASE },
    { offset: 1, ...at(to, to) },
  ]);
  group.effect.updateTiming({ delay: 0, duration: MOVED_MS, easing: "linear" });
}
