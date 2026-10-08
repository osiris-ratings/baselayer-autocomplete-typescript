import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import { StylingPanel } from "../../site/demo/StylingPanel";
import { DEFAULT_STYLE } from "../../site/demo/style-state";

import "../../site/shared/brand.css";
import "../../site/demo/demo.css";

function overlap(a: DOMRect, b: DOMRect): boolean {
  return (
    a.left < b.right - 0.5 &&
    b.left < a.right - 0.5 &&
    a.top < b.bottom - 0.5 &&
    b.top < a.bottom - 0.5
  );
}

describe("the Styling panel's presets", () => {
  for (const width of [560, 400, 320]) {
    it(`names every preset whole, apart from the others, in ${width}px`, () => {
      const host = document.createElement("div");
      host.className = "demo";
      host.style.width = `${width}px`;
      document.body.append(host);
      const root = createRoot(host);
      flushSync(() =>
        root.render(<StylingPanel state={DEFAULT_STYLE} onChange={() => {}} />),
      );
      try {
        const names = [...host.querySelectorAll<HTMLElement>(".preset-name")];
        expect(names.length).toBeGreaterThan(1);
        const range = document.createRange();
        const texts = names.map(name => {
          range.selectNodeContents(name);
          return range.getBoundingClientRect();
        });
        names.forEach((name, at) => {
          const own = name.closest(".preset")!.getBoundingClientRect();
          // The whole name, inside its own preset.
          expect(texts[at]!.left, name.textContent!).toBeGreaterThanOrEqual(
            own.left - 0.5,
          );
          expect(texts[at]!.right, name.textContent!).toBeLessThanOrEqual(
            own.right + 0.5,
          );
          texts.forEach((other, next) => {
            if (next !== at) {
              expect(
                overlap(texts[at]!, other),
                `${name.textContent} over ${names[next]!.textContent}`,
              ).toBe(false);
            }
          });
        });
        // The row scrolls; the page never does.
        expect(host.scrollWidth).toBeLessThanOrEqual(host.clientWidth);
      } finally {
        root.unmount();
        host.remove();
      }
    });
  }
});
