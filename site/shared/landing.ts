// A link into another page's section (`/#quick-start` from the demo,
// `/api/#errors` from the overview) lands the browser on a page that is not
// drawn yet: mount() renders once the header's fonts are in, so the browser's
// own jump to the fragment finds nothing to jump to and the page opens at its
// top. landOnHash() makes that jump once the page is drawn.

/** The reader moving the page themselves, after which it is theirs. */
const READER_SCROLLS = ["wheel", "touchstart", "keydown", "pointerdown"];

/**
 * Scrolls a just-drawn page to the section its URL's fragment names, and
 * again once its fonts are in and the text above it has reflowed, unless the
 * reader has scrolled by then. It jumps: the page's smooth scrolling is for
 * a click within the page, not for arriving.
 */
export function landOnHash(): void {
  const id = decodeURIComponent(window.location.hash.slice(1));
  if (id === "") return;
  let theirs = false;
  const release = () => {
    theirs = true;
  };
  for (const type of READER_SCROLLS) {
    window.addEventListener(type, release, { once: true, passive: true });
  }
  const land = () => {
    const target = document.getElementById(id);
    if (theirs || target === null) return;
    const root = document.documentElement;
    const behavior = root.style.scrollBehavior;
    root.style.scrollBehavior = "auto";
    target.scrollIntoView({ block: "start" });
    root.style.scrollBehavior = behavior;
  };
  land();
  void document.fonts.ready.then(land);
}
