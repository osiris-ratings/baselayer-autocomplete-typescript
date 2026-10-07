import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import { RowMap } from "../../site/demo/RowMap";
import { DEFAULT_STYLE } from "../../site/demo/style-state";

import "../../site/shared/brand.css";
import "../../site/demo/demo.css";

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
      expect(getComputedStyle(toggle("businessName")).opacity).toBe("1");
      expect(
        Number(getComputedStyle(toggle("firstAddress")).opacity),
      ).toBeLessThan(0.5);

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
