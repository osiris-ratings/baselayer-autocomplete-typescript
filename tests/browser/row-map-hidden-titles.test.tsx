import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import { RowMap } from "../../site/demo/RowMap";
import {
  DEFAULT_STYLE,
  withListed,
  type StyleState,
} from "../../site/demo/style-state";

import "../../site/shared/brand.css";
import "../../site/demo/demo.css";

function mount(state: StyleState, width: number) {
  const host = document.createElement("div");
  host.className = "demo";
  host.style.width = `${width}px`;
  document.body.append(host);
  const root = createRoot(host);
  flushSync(() =>
    root.render(<RowMap state={state} onChange={() => {}} route="people" />),
  );
  const hidden = host.querySelector<HTMLElement>('[data-drawer="hidden"]')!;
  const titles = () =>
    [...hidden.querySelectorAll<HTMLElement>(".row-map-drawer-label")].map(
      title => title.textContent,
    );
  return {
    host,
    hidden,
    titles,
    done() {
      root.unmount();
      host.remove();
    },
  };
}

type Rgb = [number, number, number];

/** A color as the browser reads it back, or as a look gives it. */
function rgb(color: string): Rgb {
  const hex = /^#([0-9a-f]{6})$/i.exec(color);
  if (hex) {
    return [0, 2, 4].map(at => parseInt(hex[1]!.slice(at, at + 2), 16)) as Rgb;
  }
  const [r, g, b] = /rgba?\(([^)]*)\)/.exec(color)![1]!.split(",").map(Number);
  return [r!, g!, b!];
}

/** WCAG's contrast ratio between two colors. */
function contrast(a: Rgb, b: Rgb): number {
  const luminance = (color: Rgb) => {
    const [r, g, b] = color.map(channel => {
      const c = channel / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light! + 0.05) / (dark! + 0.05);
}

/** A person's row with its role left out: a hidden field beside the hidden line. */
const ROLE_OUT: StyleState = {
  ...DEFAULT_STYLE,
  rows: {
    ...DEFAULT_STYLE.rows,
    people: {
      ...DEFAULT_STYLE.rows.people,
      layout: { ...DEFAULT_STYLE.rows.people.layout, businessTrailing: null },
    },
  },
};

describe("the Hidden drawer's two titles", () => {
  for (const width of [560, 320]) {
    it(`title the hidden lines and, faintly ruled off under them, the hidden fields, in ${width}px`, () => {
      const { host, hidden, titles, done } = mount(ROLE_OUT, width);
      try {
        expect(titles()).toEqual(["Hidden lines", "Hidden fields"]);
        const [lines, fields] = [
          ...hidden.querySelectorAll<HTMLElement>(".row-map-drawer-label"),
        ];
        const line = hidden.querySelector(".row-map-kind")!;
        const tray = hidden.querySelector<HTMLElement>(".row-map-tray")!;
        const chip = tray.querySelector(".row-map-chip")!;
        // Each title over its own section.
        expect(lines!.getBoundingClientRect().bottom).toBeLessThanOrEqual(
          line.getBoundingClientRect().top,
        );
        expect(fields!.getBoundingClientRect().bottom).toBeLessThanOrEqual(
          chip.getBoundingClientRect().top,
        );
        // The rule: under the lines, over the second title; 2px of the
        // drawer's faintest stroke, on a rounded outline of its ground.
        const rule = getComputedStyle(tray, "::before");
        const thick = parseFloat(rule.height);
        expect(thick).toBeGreaterThanOrEqual(2);
        expect(tray.getBoundingClientRect().top).toBeGreaterThanOrEqual(
          line.getBoundingClientRect().bottom,
        );
        expect(fields!.getBoundingClientRect().top).toBeGreaterThanOrEqual(
          tray.getBoundingClientRect().top + thick,
        );
        const ground = rgb(
          getComputedStyle(host.querySelector(".row-map-wrap")!)
            .getPropertyValue("--map-bg")
            .trim(),
        );
        // Faint: about the stripes' contrast, a little above, never a line
        // that reads as a border.
        const faint = contrast(rgb(rule.backgroundColor), ground);
        expect(faint).toBeGreaterThanOrEqual(1.2);
        expect(faint).toBeLessThanOrEqual(1.6);
        expect(parseFloat(rule.borderTopLeftRadius)).toBeGreaterThan(0);
        const outline = /^(rgba?\([^)]*\)) 0px 0px 0px (\d+)px$/.exec(
          rule.boxShadow,
        );
        expect(outline, rule.boxShadow).not.toBeNull();
        expect(Number(outline![2])).toBeGreaterThanOrEqual(2);
        expect(rgb(outline![1]!)).toEqual(ground);
        // Each title's text starts where its section's chips do.
        const text = (element: Element) => {
          const range = document.createRange();
          range.selectNodeContents(element);
          return range.getBoundingClientRect().left;
        };
        const lineChip = line
          .querySelector(".row-map-line > :first-child")!
          .getBoundingClientRect().left;
        expect(Math.abs(text(lines!) - lineChip)).toBeLessThanOrEqual(1);
        expect(
          Math.abs(text(fields!) - chip.getBoundingClientRect().left),
        ).toBeLessThanOrEqual(1);
        // Drawn alike: the same type and ground.
        const [a, b] = [lines!, fields!].map(title => getComputedStyle(title));
        for (const property of [
          "fontFamily",
          "fontSize",
          "letterSpacing",
          "textTransform",
          "backgroundColor",
          "boxShadow",
          "paddingLeft",
          "paddingRight",
        ] as const) {
          expect(b![property], property).toBe(a![property]);
        }
        // Still fits: the page never scrolls sideways.
        expect(host.scrollWidth).toBeLessThanOrEqual(host.clientWidth);
      } finally {
        done();
      }
    });
  }

  it("draws a section only when it holds something, the note standing for an empty drawer", () => {
    // A hidden line, no hidden field.
    let mounted = mount(DEFAULT_STYLE, 560);
    expect(mounted.titles()).toEqual(["Hidden lines"]);
    expect(mounted.hidden.querySelector(".row-map-tray")).toBeNull();
    mounted.done();

    // A hidden field, no hidden line.
    mounted = mount(withListed(ROLE_OUT, "people", "addresses", true), 560);
    expect(mounted.titles()).toEqual(["Hidden fields"]);
    expect(
      mounted.hidden.querySelector<HTMLElement>(".row-map-tray")!.dataset.ruled,
    ).toBeUndefined();
    mounted.done();

    // Nothing hidden: the first title, over the drawer's note.
    mounted = mount(
      withListed(DEFAULT_STYLE, "people", "addresses", true),
      560,
    );
    expect(mounted.titles()).toEqual(["Hidden lines"]);
    expect(
      mounted.hidden.querySelector(".row-map-drawer-hint")!.textContent,
    ).toContain("grip");
    mounted.done();
  });
});
