import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { page } from "vitest/browser";

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

type Rgb = [number, number, number];

function luminance([r, g, b]: Rgb): number {
  const [lr, lg, lb] = [r, g, b].map(channel => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lr! + 0.7152 * lg! + 0.0722 * lb!;
}

function ratio(a: Rgb, b: Rgb): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light! + 0.05) / (dark! + 0.05);
}

/**
 * The lowest drawn row of what stands out from `ground` in each of `boxes`,
 * read off a screenshot of `element`; boxes and rows are in CSS pixels from
 * its corner, which a screenshot scrolling the page leaves where it was.
 */
async function lowestInk(
  element: HTMLElement,
  ground: Rgb,
  boxes: readonly {
    left: number;
    right: number;
    top: number;
    bottom: number;
  }[],
): Promise<number[]> {
  const base64 = await page.screenshot({ element, save: false });
  const image = new Image();
  image.src = `data:image/png;base64,${base64}`;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d")!;
  context.drawImage(image, 0, 0);
  const data = context.getImageData(0, 0, image.width, image.height).data;
  const scale = image.width / element.getBoundingClientRect().width;
  return boxes.map(box => {
    let lowest = -1;
    const [top, bottom, left, right] = [
      box.top,
      box.bottom,
      box.left,
      box.right,
    ].map(edge => Math.round(edge * scale));
    for (let y = Math.max(0, top!); y < Math.min(image.height, bottom!); y++) {
      for (let x = left!; x < right!; x++) {
        const at = (y * image.width + x) * 4;
        if (ratio([data[at]!, data[at + 1]!, data[at + 2]!], ground) > 2) {
          lowest = y;
        }
      }
    }
    return (lowest + 1) / scale;
  });
}

/** A computed colour as numbers. */
const parsed = (color: string): Rgb =>
  [...color.matchAll(/[\d.]+/g)]
    .slice(0, 3)
    .map(each => Number(each[0])) as Rgb;

describe("the Components fold's note", () => {
  // A viewport the runner draws whole, so a pixel of the shot is a pixel of
  // the page: a scaled shot moves a row by more than the tolerance.
  beforeAll(async () => {
    await page.viewport(1280, 700);
  });
  afterAll(async () => {
    await page.viewport(1280, 900);
  });

  for (const width of [560, 320]) {
    it(`says how to drag, a hand at each drag, the drawers' and column's names underlined, in ${width}px`, async () => {
      await document.fonts.ready;
      const { note, done } = mount(width);
      try {
        await frame();
        // The fold opened: its ink is read once it has finished fading in.
        await Promise.all(
          document.getAnimations().map(animation => animation.finished),
        );
        expect(note.textContent!.replace(/\s+/g, " ").trim()).toBe(NOTE);

        const hands = [...note.querySelectorAll("svg")];
        expect(hands).toHaveLength(2);
        const size = parseFloat(getComputedStyle(note).fontSize);
        for (const hand of hands) {
          expect(hand.getAttribute("aria-hidden")).toBe("true");
          const box = hand.getBoundingClientRect();
          // About the capitals' height.
          expect(box.height).toBeGreaterThanOrEqual(size * 0.5);
          expect(box.height).toBeLessThanOrEqual(size * 0.85);
          // Standing on the line a touch low, as a round letter does: the
          // palm's lowest drawn row about a pixel below the foot of the "a"
          // after it, both within the line's own rows. Drawn four times over,
          // so a quarter pixel shows.
          const holding = hand.parentElement!;
          holding.style.zoom = "4";
          await frame();
          const drawn = hand.getBoundingClientRect();
          const word = document.createRange();
          word.selectNodeContents(holding.lastChild!);
          const a = word.getBoundingClientRect();
          const corner = note.getBoundingClientRect();
          const rows = {
            top: a.top - corner.top,
            bottom: a.bottom - corner.top,
          };
          const [palm, foot] = await lowestInk(
            note,
            parsed(
              getComputedStyle(note.closest(".fold-nested")!).backgroundColor,
            ),
            [
              {
                left: drawn.left - corner.left,
                right: drawn.right - corner.left,
                ...rows,
              },
              {
                left: a.left - corner.left + a.width / 2,
                right: a.right - corner.left,
                ...rows,
              },
            ],
          );
          holding.style.zoom = "";
          await frame();
          const below = (palm! - foot!) / (drawn.height / box.height);
          expect(below, "pixels below the a's foot").toBeGreaterThanOrEqual(
            0.5,
          );
          expect(below, "pixels below the a's foot").toBeLessThanOrEqual(1.5);
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
