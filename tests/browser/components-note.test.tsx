import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import { StylingPanel } from "../../site/demo/StylingPanel";
import { INITIAL_STYLE } from "../../site/demo/style-state";

import "../../site/shared/brand.css";
import "../../site/shared/fonts";
import "../../site/demo/demo.css";

const NOTE =
  "Drag a line by its grip between Shown and Hidden drawers below, untick " +
  "Enabled to keep it from being chosen, and drag a field into place, or " +
  "into Hidden to leave it out.";

function mount(width: number) {
  const host = document.createElement("div");
  host.className = "demo";
  host.style.width = `${width}px`;
  document.body.append(host);
  const root = createRoot(host);
  flushSync(() =>
    root.render(<StylingPanel state={INITIAL_STYLE} onChange={() => {}} />),
  );
  // Open, so the note is laid out.
  host
    .querySelector<HTMLButtonElement>('.fold-toggle[aria-expanded="false"]')!
    .click();
  const note = [...host.querySelectorAll<HTMLElement>(".fold-note")].find(
    each => each.textContent?.includes("grip"),
  )!;
  return {
    note,
    done() {
      root.unmount();
      host.remove();
    },
  };
}

const frame = () =>
  new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));

/** The y of the text's baseline where `before` sits: an empty inline-block's bottom. */
function baselineAt(before: Element): number {
  const probe = document.createElement("span");
  probe.style.cssText =
    "display:inline-block;width:0;height:0;vertical-align:baseline";
  before.before(probe);
  const y = probe.getBoundingClientRect().bottom;
  probe.remove();
  return y;
}

describe("the Components fold's note", () => {
  for (const width of [560, 320]) {
    it(`says how to drag, a hand at each drag, the drawers' and column's names underlined, in ${width}px`, async () => {
      await document.fonts.ready;
      const { note, done } = mount(width);
      try {
        await frame();
        expect(note.textContent!.replace(/\s+/g, " ").trim()).toBe(NOTE);

        const hands = [...note.querySelectorAll("svg")];
        expect(hands).toHaveLength(2);
        const size = parseFloat(getComputedStyle(note).fontSize);
        for (const hand of hands) {
          expect(hand.getAttribute("aria-hidden")).toBe("true");
          const box = hand.getBoundingClientRect();
          // About the capitals' height, sitting on the line's baseline.
          expect(box.height).toBeGreaterThanOrEqual(size * 0.5);
          expect(box.height).toBeLessThanOrEqual(size * 0.85);
          expect(Math.abs(box.bottom - baselineAt(hand))).toBeLessThanOrEqual(
            1,
          );
          expect(getComputedStyle(hand).color).toBe(
            getComputedStyle(note).color,
          );
          // Kept on one line with the words either side of it.
          const held = hand.parentElement!;
          expect(getComputedStyle(held).whiteSpace).toBe("nowrap");
          expect(held.textContent!.replace(/\s+/g, " ").trim()).toMatch(
            /^[Dd]rag a$/,
          );
          const words = held.getClientRects();
          expect(words).toHaveLength(1);
        }

        const underlined = [...note.querySelectorAll<HTMLElement>("*")].filter(
          element =>
            getComputedStyle(element).textDecorationLine.includes("underline"),
        );
        expect(underlined.map(word => word.textContent)).toEqual([
          "Shown",
          "Hidden",
          "Enabled",
          "Hidden",
        ]);
        for (const word of underlined) {
          const style = getComputedStyle(word);
          // The note's ink, not a link's.
          expect(style.color).toBe(getComputedStyle(note).color);
          expect(style.textDecorationColor).toBe(style.color);
          expect(style.cursor).not.toBe("pointer");
          expect(word.closest("a")).toBeNull();
          expect(parseFloat(style.textUnderlineOffset)).toBeGreaterThan(0);
        }
      } finally {
        done();
      }
    });
  }
});
