// Self-hosted, so the pages load nothing from a third party.
import "@fontsource/uncut-sans/400.css";
import "@fontsource/uncut-sans/500.css";
import "@fontsource/uncut-sans/600.css";
import "@fontsource-variable/newsreader/opsz.css";
import "@fontsource/geist-mono/400.css";
import "@fontsource/geist-mono/500.css";

// The header is set in these two. Drawn before they load, the first frame
// uses the fallback fonts and the header shifts sideways as they swap in, on
// every page load.
const HEADER_FONTS = ['400 12px "Geist Mono"', '400 15px "Uncut Sans"'];

/** Resolves once the header's fonts have loaded, or after `timeoutMs`. */
export function headerFontsReady(timeoutMs = 400): Promise<void> {
  return Promise.race([
    Promise.all(HEADER_FONTS.map(font => document.fonts.load(font))).then(
      () => undefined,
      () => undefined,
    ),
    new Promise<void>(resolve => setTimeout(resolve, timeoutMs)),
  ]);
}
