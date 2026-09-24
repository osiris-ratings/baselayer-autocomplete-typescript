import { StrictMode, useLayoutEffect, type ReactNode } from "react";
import { createRoot } from "react-dom/client";

import { headerFontsReady } from "./fonts";
import { landOnHash } from "./landing";

/** The page, and once it is drawn, the section its URL names in view. */
function Landed({ children }: { children: ReactNode }) {
  useLayoutEffect(landOnHash, []);
  return children;
}

/**
 * Renders a page once its header's fonts are in (from cache, at once), so the
 * header is drawn once, where it stays, on every page; then scrolls to the
 * section the URL names, which the browser could not do before the page was
 * drawn.
 */
export function mount(page: ReactNode): void {
  void headerFontsReady().then(() => {
    createRoot(document.getElementById("root")!).render(
      <StrictMode>
        <Landed>{page}</Landed>
      </StrictMode>,
    );
  });
}
