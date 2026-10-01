import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// The cascade of the report's stylesheet, where what a rule says depends on
// where it stands. jsdom lays nothing out, so these read the source.

const read = (path: string) =>
  readFileSync(
    fileURLToPath(new URL(`../../site/${path}`, import.meta.url)),
    "utf8",
  );

const css = read("demo/search.css");
const demoCss = read("demo/demo.css");
const brandCss = read("shared/brand.css");

describe("search.css", () => {
  it("stills the gauge after the rule that animates it", () => {
    // At equal specificity the later rule wins: a reduced-motion override that
    // comes first is dead.
    const draws = css.indexOf("animation: sr-draw");
    expect(draws).toBeGreaterThan(-1);
    const stills = [
      ...css.matchAll(
        /@media \(prefers-reduced-motion: reduce\) \{[^@]*?\.sr-gauge-value[^}]*animation: none/g,
      ),
    ];
    expect(stills.length).toBeGreaterThan(0);
    for (const still of stills) {
      expect(still.index).toBeGreaterThan(draws);
    }
  });

  it("positions the step, so its visually hidden nodes stay inside it", () => {
    // `.visually-hidden` is absolute with no offsets; without a positioned
    // ancestor each sits at its static position outside the pane's clip and
    // stretches the page beyond the window.
    expect(css).toMatch(/\.demo-search\s*\{[^}]*position:\s*relative/);
  });

  it("scrolls the report to its head, which holds the label and the verdict", () => {
    expect(css).toMatch(/\.sr-head\s*\{[^}]*scroll-margin-top/);
    expect(css).not.toMatch(/\.sr-title\s*\{[^}]*scroll-margin-top/);
  });

  it("lets the open raw response shrink to the card", () => {
    // `.sr-foot` is a grid; its item would otherwise be as wide as the
    // longest line of the JSON, which does not wrap.
    expect(css).toMatch(/\.sr-raw\s*\{[^}]*min-width:\s*0/);
  });

  it("lets the Network detail's request body shrink to the panel", () => {
    expect(demoCss).toMatch(/\.net-detail dl > div\s*\{[^}]*min-width:\s*0/);
  });
});

/** WCAG contrast ratio of two `#rrggbb` colours. */
function contrast(a: string, b: string): number {
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map(at => {
      const channel = parseInt(hex.slice(at, at + 2), 16) / 255;
      return channel <= 0.03928
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter! + 0.05) / (darker! + 0.05);
}

/** The `#rrggbb` a custom property is given in a stylesheet. */
function colour(sheet: string, property: string): string {
  const found = new RegExp(`${property}:\\s*(#[0-9a-fA-F]{6})`).exec(sheet);
  expect(found, property).not.toBeNull();
  return found![1]!;
}

describe("the report's text colours", () => {
  const faded = colour(brandCss, "--faded");

  it("read on the card they are drawn on: 4.5:1 for small text", () => {
    // The gauge's arc keeps the console's grade colours; the words and the
    // letter beside it take these.
    for (const token of ["--sr-grade-b-text", "--sr-grade-c-text"]) {
      expect(contrast(colour(css, token), faded), token).toBeGreaterThanOrEqual(
        4.5,
      );
    }
    expect(
      contrast(colour(css, "--sr-warn-fg"), colour(css, "--sr-warn-bg")),
    ).toBeGreaterThanOrEqual(4.5);
  });
});
