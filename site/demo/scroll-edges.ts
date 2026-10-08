/**
 * Marks a scroller's frame with the edges there is more beyond, which its
 * shades follow, and says which they are.
 */
export function markEdges(scroller: HTMLElement): {
  before: boolean;
  after: boolean;
} {
  const frame = scroller.parentElement!;
  const before = scroller.scrollLeft > 0.5;
  const after =
    scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 0.5;
  frame.toggleAttribute("data-more-before", before);
  frame.toggleAttribute("data-more-after", after);
  return { before, after };
}
