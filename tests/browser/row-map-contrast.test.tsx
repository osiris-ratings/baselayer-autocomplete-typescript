import type { Route } from "@baselayer-sdk/autocomplete";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { page } from "vitest/browser";

import { RowMap } from "../../site/demo/RowMap";
import {
  DEFAULT_STYLE,
  PRESETS,
  applyPreset,
  lineKinds,
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

/** The row map as the screen has it, pixel by pixel. */
interface Shot {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  left: number;
  top: number;
  scale: number;
}

async function capture(element: HTMLElement): Promise<Shot> {
  const base64 = await page.screenshot({ element, save: false });
  const image = new Image();
  image.src = `data:image/png;base64,${base64}`;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d")!;
  context.drawImage(image, 0, 0);
  const box = element.getBoundingClientRect();
  return {
    data: context.getImageData(0, 0, image.width, image.height).data,
    width: image.width,
    height: image.height,
    left: box.left,
    top: box.top,
    scale: image.width / box.width,
  };
}

/** The pixels a box covers. */
function pixelsIn(shot: Shot, box: DOMRect): Rgb[] {
  const pixels: Rgb[] = [];
  const x0 = Math.max(0, Math.floor((box.left - shot.left) * shot.scale));
  const x1 = Math.min(
    shot.width,
    Math.ceil((box.right - shot.left) * shot.scale),
  );
  const y0 = Math.max(0, Math.floor((box.top - shot.top) * shot.scale));
  const y1 = Math.min(
    shot.height,
    Math.ceil((box.bottom - shot.top) * shot.scale),
  );
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const at = (y * shot.width + x) * 4;
      pixels.push([shot.data[at]!, shot.data[at + 1]!, shot.data[at + 2]!]);
    }
  }
  return pixels;
}

/**
 * How what is drawn in a box reads on its ground: the box's commonest colour
 * is its ground, and its ink the pixel that stands out from it most.
 */
function measured(shot: Shot, box: DOMRect): number {
  const pixels = pixelsIn(shot, box);
  const counts = new Map<string, { rgb: Rgb; count: number }>();
  for (const rgb of pixels) {
    const key = rgb.join();
    const entry = counts.get(key) ?? { rgb, count: 0 };
    entry.count++;
    counts.set(key, entry);
  }
  const ground = [...counts.values()].sort((a, b) => b.count - a.count)[0]!.rgb;
  return Math.max(...pixels.map(rgb => ratio(rgb, ground)));
}

/** Where an element's text is drawn. */
function textBox(element: Element): DOMRect {
  const range = document.createRange();
  range.selectNodeContents(element);
  return range.getBoundingClientRect();
}

/**
 * Every line shown but the row's last, which is hidden, and the head's last
 * field left out, so the Hidden drawer holds a line and a field.
 */
function oneHidden(state: StyleState, route: Route): StyleState {
  const [head, ...lines] = lineKinds(route);
  const relations = lines.map(kind => kind.relation!);
  const left = head!.lines.at(-1)!.trailing.field;
  const row = state.rows[route];
  return {
    ...state,
    rows: {
      ...state.rows,
      [route]: {
        ...row,
        list: relations.slice(0, -1),
        layout: { ...row.layout, [left]: null },
      },
    },
  };
}

describe("the row map in every preset", () => {
  for (const preset of PRESETS) {
    for (const route of ["businesses", "people", "addresses"] as const) {
      it(`reads in ${preset.name}, on a ${route} row`, async () => {
        const host = document.createElement("div");
        host.className = "demo";
        host.style.width = "560px";
        document.body.append(host);
        const root = createRoot(host);
        const state = oneHidden(applyPreset(DEFAULT_STYLE, preset), route);
        flushSync(() =>
          root.render(
            <RowMap state={state} onChange={() => {}} route={route} />,
          ),
        );
        try {
          const wrap = host.querySelector<HTMLElement>(".row-map-wrap")!;
          const shot = await capture(wrap);
          const low: string[] = [];
          const check = (what: string, box: DOMRect, least: number) => {
            const got = measured(shot, box);
            if (got < least) low.push(`${what}: ${got.toFixed(2)} < ${least}`);
          };
          for (const kind of wrap.querySelectorAll<HTMLElement>(
            ".row-map-kind",
          )) {
            const state = kind.dataset.state!;
            // A dimmed line is drawn at its state's dim, held only to what keeps
            // it visible: an enabled one reads as text.
            const label = state === "enabled" ? 4.5 : 1.6;
            const at = `${kind.dataset.relation} (${state})`;
            for (const face of kind.querySelectorAll<HTMLElement>(
              '.row-map-place:not([data-closed]):not([data-field="empty"]) .row-map-face',
            )) {
              check(`${face.textContent} of ${at}`, textBox(face), label);
            }
            for (const name of kind.querySelectorAll<HTMLElement>(
              ".row-map-name-long",
            )) {
              check(`${name.textContent} of ${at}`, textBox(name), label);
            }
            for (const glyph of kind.querySelectorAll<HTMLElement>(
              ".row-map-icon svg",
            )) {
              check(
                `icon of ${at}`,
                glyph.getBoundingClientRect(),
                state === "enabled" ? 3 : 1.6,
              );
            }
            const grip = kind.querySelector<HTMLElement>(
              ".row-map-grip:not([data-spacer])",
            );
            if (grip !== null) {
              check(`grip of ${at}`, grip.getBoundingClientRect(), 3);
            }
          }
          for (const chip of wrap.querySelectorAll<HTMLElement>(
            ".row-map-tray .row-map-chip",
          )) {
            check(`${chip.textContent} in Hidden`, textBox(chip), 3);
          }
          expect(
            wrap.querySelectorAll(".row-map-tray .row-map-chip").length,
          ).toBeGreaterThan(0);
          for (const heading of wrap.querySelectorAll<HTMLElement>(
            ".row-map-drawer-label, .row-map-check-head",
          )) {
            check(`heading ${heading.textContent}`, textBox(heading), 4.5);
          }
          // No band shows inside anything the Hidden drawer holds: a row of
          // pixels just inside each one's top is all one ground.
          const banded: string[] = [];
          for (const segment of wrap.querySelectorAll<HTMLElement>(
            '[data-drawer="hidden"] :is(.row-map-place:not([data-closed]) .row-map-face, .row-map-name, .row-map-chip)',
          )) {
            const box = segment.getBoundingClientRect();
            // Clear of the corners, however round the look draws them.
            const inset = Math.max(4, box.height / 2);
            const row = pixelsIn(
              shot,
              new DOMRect(
                box.left + inset,
                box.top + 3,
                box.width - 2 * inset,
                1,
              ),
            );
            if (new Set(row.map(rgb => rgb.join())).size > 1) {
              banded.push(segment.textContent || segment.className);
            }
          }
          expect(banded).toEqual([]);
          expect(low).toEqual([]);
        } finally {
          root.unmount();
          host.remove();
        }
      });
    }
  }
});
