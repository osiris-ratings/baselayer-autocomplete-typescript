import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";

import { headerFontsReady } from "./fonts";

/**
 * Renders a page once its header's fonts are in (from cache, at once), so the
 * header is drawn once, where it stays, on every page.
 */
export function mount(page: ReactNode): void {
  void headerFontsReady().then(() => {
    createRoot(document.getElementById("root")!).render(
      <StrictMode>{page}</StrictMode>,
    );
  });
}
