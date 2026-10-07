import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import { mapInks } from "../../site/demo/map-ink";
import { RowMap } from "../../site/demo/RowMap";
import { DEFAULT_STYLE } from "../../site/demo/style-state";

import "../../site/shared/brand.css";
import "../../site/demo/demo.css";

/** `#4a5568` as the page computes it. */
function rgb(hex: string): string {
  const [r, g, b] = [1, 3, 5].map(at => parseInt(hex.slice(at, at + 2), 16));
  return `rgb(${r}, ${g}, ${b})`;
}

describe("a segment's icon toggle in the row map", () => {
  it("draws solid when the segment carries its icon, and faint when not, before the segment's name", () => {
    const host = document.createElement("div");
    host.style.width = "560px";
    document.body.append(host);
    const root = createRoot(host);
    flushSync(() =>
      root.render(
        <RowMap state={DEFAULT_STYLE} onChange={() => {}} route="people" />,
      ),
    );
    try {
      const toggle = (segment: string) =>
        host.querySelector<HTMLElement>(
          `.row-map-icon[data-segment="${segment}"]`,
        )!;
      // On: the segment's ink, on a ground of its own. Off: the soft ink,
      // still there to be seen and pressed.
      const inks = mapInks(DEFAULT_STYLE);
      const on = getComputedStyle(toggle("businessName"));
      const off = getComputedStyle(toggle("firstAddress"));
      expect(on.color).toBe(rgb(inks.ink));
      expect(on.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
      expect(off.color).toBe(rgb(inks.soft));
      expect(off.backgroundColor).toBe("rgba(0, 0, 0, 0)");
      expect([on.opacity, off.opacity]).toEqual(["1", "1"]);

      // The glyph sits before the name, which it does not cover.
      for (const segment of ["businessName", "firstAddress"]) {
        const icon = toggle(segment).getBoundingClientRect();
        const chip = toggle(segment).parentElement!;
        const text = chip.querySelector<HTMLElement>(
          ".row-map-face, .row-map-name",
        )!;
        const range = document.createRange();
        range.selectNodeContents(
          text.querySelector(".row-map-name-long") ?? text,
        );
        expect(icon.right).toBeLessThanOrEqual(
          range.getBoundingClientRect().left,
        );
      }
    } finally {
      root.unmount();
      host.remove();
    }
  });
});
