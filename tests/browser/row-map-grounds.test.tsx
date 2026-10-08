import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { page } from "vitest/browser";

import { RowMap } from "../../site/demo/RowMap";
import {
  DEFAULT_STYLE,
  PRESETS,
  applyPreset,
  withListed,
  type StyleState,
} from "../../site/demo/style-state";

import "../../site/shared/brand.css";
import "../../site/demo/demo.css";

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

/** Where text stands out from its ground in an element, from its pixels. */
async function ink(element: HTMLElement, ground: Rgb) {
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
  let [left, right] = [Infinity, -Infinity];
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const at = (y * image.width + x) * 4;
      if (ratio([data[at]!, data[at + 1]!, data[at + 2]!], ground) > 2) {
        left = Math.min(left, x);
        right = Math.max(right, x + 1);
      }
    }
  }
  return { left, right, width: image.width };
}

const MIDNIGHT = applyPreset(
  DEFAULT_STYLE,
  PRESETS.find(each => each.name === "Midnight")!,
);

describe("the Hidden drawer's heading and note", () => {
  beforeAll(async () => {
    await page.viewport(1280, 700);
  });
  afterAll(async () => {
    await page.viewport(1280, 900);
  });

  for (const [look, base] of [
    ["Light", DEFAULT_STYLE],
    ["Midnight", MIDNIGHT],
  ] as const) {
    for (const width of [560, 320]) {
      it(`sit on grounds that hug their text, the same room each side, in ${look} at ${width}px`, async () => {
        // Every line shown: the drawer says how to hide one.
        const state: StyleState = withListed(base, "people", "addresses", true);
        const host = document.createElement("div");
        host.className = "demo";
        host.style.width = `${width}px`;
        document.body.append(host);
        const root = createRoot(host);
        flushSync(() =>
          root.render(
            <RowMap state={state} onChange={() => {}} route="people" />,
          ),
        );
        try {
          const hidden = host.querySelector('[data-drawer="hidden"]')!;
          const ground = [1, 3, 5].map(at =>
            parseInt(state.look.backgroundColor.slice(at, at + 2), 16),
          ) as Rgb;
          for (const element of hidden.querySelectorAll<HTMLElement>(
            ".row-map-drawer-label, .row-map-drawer-hint",
          )) {
            const text = await ink(element, ground);
            expect(text.width).toBeGreaterThan(0);
            const before = text.left;
            const after = text.width - text.right;
            expect(
              Math.abs(before - after),
              `${element.className}: ${before} before, ${after} after`,
            ).toBeLessThanOrEqual(1);
            expect(before).toBeGreaterThanOrEqual(3);
            expect(before).toBeLessThanOrEqual(7);
          }
        } finally {
          root.unmount();
          host.remove();
        }
      });
    }
  }
});
