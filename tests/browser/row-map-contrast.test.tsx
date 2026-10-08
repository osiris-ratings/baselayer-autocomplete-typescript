import type { Route } from "@baselayer-sdk/autocomplete";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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

/** The colour most of `pixels` are. */
function commonest(pixels: Rgb[]): Rgb {
  const counts = new Map<string, { rgb: Rgb; count: number }>();
  for (const rgb of pixels) {
    const key = rgb.join();
    const entry = counts.get(key) ?? { rgb, count: 0 };
    entry.count++;
    counts.set(key, entry);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count)[0]!.rgb;
}

/**
 * How what is drawn in a box reads on its ground: the box's commonest colour
 * is its ground, and its ink the pixel that stands out from it most.
 */
function measured(shot: Shot, box: DOMRect, text?: Element): number {
  const pixels = pixelsIn(shot, box);
  const ground = commonest(pixels);
  if (text === undefined) {
    return Math.max(...pixels.map(rgb => ratio(rgb, ground)));
  }
  // Text's own ink only: the pixels between its ground and its colour as
  // drawn, its line's dim included, so no border or square nearby counts.
  const expected = drawnColour(text, ground);
  const own = pixels.filter(rgb => distance(rgb, ground, expected) <= 30);
  return Math.max(1, ...own.map(rgb => ratio(rgb, ground)));
}

/** An element's text colour as drawn over `ground`, through its dims. */
function drawnColour(element: Element, ground: Rgb): Rgb {
  const [r, g, b] = getComputedStyle(element)
    .color.match(/\d+(\.\d+)?/g)!
    .map(Number);
  let opacity = 1;
  for (let at: Element | null = element; at !== null; at = at.parentElement) {
    opacity *= Number(getComputedStyle(at).opacity);
  }
  return [r!, g!, b!].map(
    (channel, at) => ground[at]! + (channel - ground[at]!) * opacity,
  ) as Rgb;
}

/** How far a colour lies from the line between two others. */
function distance(rgb: Rgb, from: Rgb, to: Rgb): number {
  const along = to.map((channel, at) => channel - from[at]!);
  const length = along.reduce((sum, d) => sum + d * d, 0);
  const t =
    length === 0
      ? 0
      : Math.min(
          1,
          Math.max(
            0,
            along.reduce((sum, d, at) => sum + d * (rgb[at]! - from[at]!), 0) /
              length,
          ),
        );
  return Math.hypot(
    ...rgb.map((channel, at) => channel - (from[at]! + along[at]! * t)),
  );
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
  // A viewport the runner draws whole, so a pixel of the shot is a pixel of
  // the page: a scaled shot blurs a 1px edge into its ground.
  beforeAll(async () => {
    await page.viewport(1280, 700);
  });
  afterAll(async () => {
    await page.viewport(1280, 900);
  });

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
          expect(shot.scale).toBe(1);
          const low: string[] = [];
          const check = (
            what: string,
            box: DOMRect,
            least: number,
            text?: Element,
          ) => {
            const got = measured(shot, box, text);
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
              check(`${face.textContent} of ${at}`, textBox(face), label, face);
            }
            for (const name of kind.querySelectorAll<HTMLElement>(
              ".row-map-name-long",
            )) {
              check(`${name.textContent} of ${at}`, textBox(name), label, name);
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
          // The Enabled column's boxes: an empty one's faint edge on the
          // card, never under 1.8:1, and a checked one's white mark on its
          // fill at a control's 3:1.
          for (const box of wrap.querySelectorAll<HTMLInputElement>(
            ".row-map-check",
          )) {
            const at =
              box.closest<HTMLElement>(".row-map-kind")!.dataset.relation;
            check(
              `${box.checked ? "checked" : "empty"} box of ${at}`,
              box.getBoundingClientRect(),
              box.checked ? 3 : 1.8,
            );
            if (box.checked) {
              // The mark is white: the lightest of its pixels reads on the
              // fill, the box's commonest colour.
              const pixels = pixelsIn(shot, box.getBoundingClientRect());
              const fill = commonest(pixels);
              const lightest = pixels.reduce((most, rgb) =>
                luminance(rgb) > luminance(most) ? rgb : most,
              );
              if (ratio(lightest, fill) < 3) {
                low.push(
                  `white mark of ${at}: ${ratio(lightest, fill).toFixed(2)} < 3`,
                );
              }
            }
          }
          for (const chip of wrap.querySelectorAll<HTMLElement>(
            ".row-map-tray .row-map-chip",
          )) {
            check(`${chip.textContent} in Hidden`, textBox(chip), 3, chip);
          }
          expect(
            wrap.querySelectorAll(".row-map-tray .row-map-chip").length,
          ).toBeGreaterThan(0);
          for (const heading of wrap.querySelectorAll<HTMLElement>(
            ".row-map-drawer-label, .row-map-check-head",
          )) {
            check(
              `heading ${heading.textContent}`,
              textBox(heading),
              4.5,
              heading,
            );
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
