import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";

import { contrast, mapInks } from "../../site/demo/map-ink";
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
      // On: the solid glyph, in the segment's ink, in a filled tile. Off: an
      // empty, dashed slot, its glyph in the soft ink and struck through.
      const inks = mapInks(DEFAULT_STYLE);
      const on = getComputedStyle(toggle("businessName"));
      const off = getComputedStyle(toggle("firstAddress"));
      expect(on.color).toBe(rgb(inks.ink));
      expect(on.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
      expect(on.borderTopStyle).toBe("solid");
      expect(getComputedStyle(toggle("businessName"), "::after").content).toBe(
        "none",
      );
      expect(off.color).toBe(rgb(inks.soft));
      expect(off.backgroundColor).toBe("rgba(0, 0, 0, 0)");
      expect(off.borderTopStyle).toBe("dashed");
      const slash = getComputedStyle(toggle("firstAddress"), "::after");
      expect(slash.content).not.toBe("none");
      expect(slash.transform).not.toBe("none");
      expect(contrast(inks.ink, "#ffffff")).toBeGreaterThan(
        contrast(inks.soft, "#ffffff"),
      );
      expect([on.opacity, off.opacity]).toEqual(["1", "1"]);
      // Each says which it is, and is pressed with a pointer.
      expect(toggle("businessName").title).toBe("Icon: on");
      expect(toggle("firstAddress").title).toBe("Icon: off");
      expect(on.cursor).toBe("pointer");

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

  it("draws a frozen toggle dimmed and inert, on a hidden line", () => {
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
      const frozen = host.querySelector<HTMLButtonElement>(
        '.row-map-icon[data-segment="addressName"]',
      )!;
      const live = host.querySelector<HTMLButtonElement>(
        '.row-map-icon[data-segment="businessName"]',
      )!;
      expect(frozen.disabled).toBe(true);
      // No slot and no tile: nothing to press, though the glyph still reads
      // (the presets' contrast test holds it to its floor).
      const style = getComputedStyle(frozen);
      expect(style.cursor).toBe("not-allowed");
      expect(style.borderTopStyle).toBe("none");
      expect(style.backgroundColor).toBe("rgba(0, 0, 0, 0)");
      expect(getComputedStyle(live).borderTopStyle).toBe("solid");
      expect(frozen.title).toBe("Icon: on, on a hidden line");
    } finally {
      root.unmount();
      host.remove();
    }
  });

  it("rings a live toggle in a faint blue under the pointer, and a frozen one never", async () => {
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
      const live = host.querySelector<HTMLButtonElement>(
        '.row-map-icon[data-segment="businessName"]',
      )!;
      const frozen = host.querySelector<HTMLButtonElement>(
        '.row-map-icon[data-segment="addressName"]',
      )!;
      expect(getComputedStyle(live).boxShadow).toBe("none");

      await userEvent.hover(live);
      // A 2px ring, the demo's blue at a little under half strength.
      const ring = getComputedStyle(live).boxShadow;
      expect(ring).toMatch(/ 0px 0px 0px 2px$/);
      const alpha = /\/ ([\d.]+)\)|rgba\([^)]*, ([\d.]+)\)/.exec(ring);
      expect(alpha, ring).not.toBeNull();
      expect(Number(alpha![1] ?? alpha![2])).toBeCloseTo(0.45, 2);

      await userEvent.hover(frozen);
      expect(getComputedStyle(frozen).boxShadow).toBe("none");
      expect(getComputedStyle(live).boxShadow).toBe("none");
    } finally {
      root.unmount();
      host.remove();
    }
  });
});
