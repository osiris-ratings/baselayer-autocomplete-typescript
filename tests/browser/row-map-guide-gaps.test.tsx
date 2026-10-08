import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { page } from "vitest/browser";

import type { Route } from "@baselayer-sdk/autocomplete";

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

function parse(hex: string): Rgb {
  return [1, 3, 5].map(at => parseInt(hex.slice(at, at + 2), 16)) as Rgb;
}

/** A drawer as the screen has it, in its own pixels. */
async function capture(element: HTMLElement) {
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
  const box = element.getBoundingClientRect();
  const scale = image.width / box.width;
  const pixel = (x: number, y: number): Rgb => {
    const at = (y * image.width + x) * 4;
    return [data[at]!, data[at + 1]!, data[at + 2]!];
  };
  return {
    pixel,
    width: image.width,
    height: image.height,
    scale,
    // A page box's pixels in the shot: the shot starts at the box's corner.
    x: (pageX: number) => Math.round((pageX - box.left) * scale),
    y: (pageY: number) => Math.round((pageY - box.top) * scale),
  };
}

const looks: [string, StyleState][] = [
  ["Light", DEFAULT_STYLE],
  [
    "Midnight",
    applyPreset(
      DEFAULT_STYLE,
      PRESETS.find(each => each.name === "Midnight")!,
    ),
  ],
  [
    "Light, a business",
    withListed(DEFAULT_STYLE, "businesses", "people", true),
  ],
];

/**
 * The Disabled column's gaps down the shown drawer, in screen pixels: label to
 * line, line to box, box to line and so on, and the ink under the last box.
 */
async function gapsIn(
  state: StyleState,
  route: Route,
  width: number,
  mono?: string,
) {
  const host = document.createElement("div");
  host.className = "demo";
  host.style.width = `${width}px`;
  if (mono !== undefined) host.style.setProperty("--mono", mono);
  document.body.append(host);
  const root = createRoot(host);
  flushSync(() =>
    root.render(<RowMap state={state} onChange={() => {}} route={route} />),
  );
  try {
    const shown = host.querySelector<HTMLElement>('[data-drawer="shown"]')!;
    const ground = parse(state.look.backgroundColor);
    const shot = await capture(shown);
    expect(shot.scale).toBe(1);
    const inked = (x: number, y: number, least: number) =>
      ratio(shot.pixel(x, y), ground) > least;

    // The rows the label's ink covers, and each box's.
    const label = shown
      .querySelector(".row-map-check-head")!
      .getBoundingClientRect();
    let labelBottom = -1;
    for (let y = shot.y(label.top); y < shot.y(label.bottom); y++) {
      for (let x = shot.x(label.left); x < shot.x(label.right); x++) {
        if (inked(x, y, 2)) labelBottom = Math.max(labelBottom, y + 1);
      }
    }
    const boxes = [
      ...shown.querySelectorAll<HTMLElement>(".row-map-kind .row-map-check"),
    ].map(box => {
      const rect = box.getBoundingClientRect();
      let [top, bottom] = [Infinity, -Infinity];
      for (let y = shot.y(rect.top) - 2; y < shot.y(rect.bottom) + 2; y++) {
        for (let x = shot.x(rect.left); x < shot.x(rect.right); x++) {
          if (inked(x, y, 1.6)) {
            top = Math.min(top, y);
            bottom = Math.max(bottom, y + 1);
          }
        }
      }
      return { top, bottom, middle: (rect.left + rect.right) / 2 };
    });

    // Each found where it is drawn.
    expect(labelBottom).toBeGreaterThan(0);
    for (const box of boxes) {
      expect(
        Number.isFinite(box.top) && Number.isFinite(box.bottom),
        JSON.stringify(boxes),
      ).toBe(true);
    }

    // The line: the runs of faint ink down the boxes' centre, clear of the
    // label and the boxes.
    const x = shot.x(boxes[0]!.middle);
    const runs: { top: number; bottom: number }[] = [];
    let open: number | null = null;
    const end = Math.min(boxes.at(-1)!.top, shot.height);
    for (let y = labelBottom; y < end; y++) {
      const inBox = boxes.some(box => y >= box.top && y < box.bottom);
      const faint = !inBox && inked(x, y, 1.15);
      if (faint && open === null) open = y;
      if (!faint && open !== null) {
        runs.push({ top: open, bottom: y });
        open = null;
      }
    }
    if (open !== null) runs.push({ top: open, bottom: end });

    // One run before each box: label (or the box above) to the box.
    expect(runs.length, JSON.stringify({ runs, boxes, labelBottom })).toBe(
      boxes.length,
    );
    const gaps: number[] = [];
    runs.forEach((run, at) => {
      const above = at === 0 ? labelBottom : boxes[at - 1]!.bottom;
      gaps.push(run.top - above, boxes[at]!.top - run.bottom);
    });
    let tail = 0;
    for (let y = boxes.at(-1)!.bottom + 1; y < boxes.at(-1)!.bottom + 20; y++) {
      if (y < shot.height && inked(x, y, 1.15)) tail++;
    }
    return { gaps, tail };
  } finally {
    root.unmount();
    host.remove();
  }
}

/** A look's state with a line listed under its row's head. */
function listedIn(look: string, base: StyleState): [StyleState, Route] {
  return look.includes("business")
    ? [base, "businesses"]
    : [withListed(base, "people", "addresses", true), "people"];
}

describe("the Disabled column's guide, spaced", () => {
  // A viewport the runner draws whole, so a pixel of the shot is a pixel of
  // the page: a scaled shot blurs a 1px line.
  beforeAll(async () => {
    await page.viewport(1280, 700);
  });
  afterAll(async () => {
    await page.viewport(1280, 900);
  });

  for (const [look, base] of looks) {
    for (const width of [560, 400, 320]) {
      it(`runs label, gap, line, gap, box down the column, every gap one size, in ${look} at ${width}px`, async () => {
        const { gaps, tail } = await gapsIn(...listedIn(look, base), width);
        // No tail under the last box.
        expect(tail).toBe(0);
        const first = gaps[0]!;
        for (const gap of gaps) {
          expect(
            Math.abs(gap - first),
            `gaps ${gaps.join(",")}`,
          ).toBeLessThanOrEqual(1);
        }
        expect(first).toBeGreaterThanOrEqual(5);
        expect(first).toBeLessThanOrEqual(7);
      });
    }
  }

  describe("on a page with no canvas to measure the heading's font on", () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    for (const [look, base] of looks) {
      it(`starts the line about one gap under the label, from a typical face's metrics, in ${look}`, async () => {
        vi.stubGlobal("OffscreenCanvas", undefined);
        const { gaps } = await gapsIn(...listedIn(look, base), 560);
        const [first, ...rest] = gaps;
        // The rest are spaced from the boxes, as measured.
        expect(
          Math.abs(first! - rest[0]!),
          `gaps ${gaps.join(",")}`,
        ).toBeLessThanOrEqual(2);
      });
    }
  });

  describe("on a heading face far from a typical one", () => {
    // A face the page's own fonts stand in for, drawn much taller above its
    // baseline than a typical one: only a measurement finds where its ink ends.
    const tall = document.createElement("style");
    tall.textContent = `@font-face {
      font-family: "Row Map Tall";
      src: local("Liberation Mono"), local("DejaVu Sans Mono"),
        local("Courier New"), local("Menlo"), local("Courier");
      ascent-override: 170%;
      descent-override: 15%;
    }`;
    beforeAll(async () => {
      document.head.append(tall);
      await document.fonts.load('10px "Row Map Tall"');
    });
    afterAll(() => {
      tall.remove();
    });

    it("measures it, and keeps every gap one size", async () => {
      expect(document.fonts.check('10px "Row Map Tall"')).toBe(true);
      const { gaps } = await gapsIn(
        ...listedIn("Light", DEFAULT_STYLE),
        560,
        '"Row Map Tall", monospace',
      );
      const first = gaps[0]!;
      for (const gap of gaps) {
        expect(
          Math.abs(gap - first),
          `gaps ${gaps.join(",")}`,
        ).toBeLessThanOrEqual(1);
      }
      expect(first).toBeGreaterThanOrEqual(5);
      expect(first).toBeLessThanOrEqual(7);
    });
  });
});
