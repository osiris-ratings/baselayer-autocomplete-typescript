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

  it("sets a filing's title and pills, an officer's name and pills, and a watchlist's title and pill on one baseline with their first cell", () => {
    // The state in its square, the initials in the avatar, the list's code:
    // each is the first cell of its row, and the words beside it stand on its
    // baseline rather than on its top or its middle.
    for (const row of [".sr-filing", ".sr-person", ".sr-list"]) {
      const block = new RegExp(
        `${row.replace(".", "\\.")}\\s*\\{[^}]*\\}`,
      ).exec(css);
      expect(block, row).not.toBeNull();
      expect(block![0], row).toMatch(/align-items:\s*baseline/);
    }
  });

  it("pins the verdict to the title's row, centred on the title, and not to the header's corner", () => {
    // The row is the title's and the verdict's alone, and centres what is in
    // it; its text need not stand on the title's baseline.
    expect(css).toMatch(/\.sr-head-title\s*\{[^}]*align-items:\s*center/);
    // The title's margins are the row's, so that it is the title's own line
    // the verdict is centred on, not the line and the room around it.
    expect(css).toMatch(/\.sr-head-title\s*\{[^}]*margin:\s*6px 0 8px/);
    expect(css).toMatch(/\.sr-title\s*\{[^}]*margin:\s*0;/);
    // And the box is the one it always was: a label, not set from the title.
    const verdict = /\.sr-verdict\s*\{[^}]*\}/.exec(css)?.[0] ?? "";
    expect(verdict).toMatch(/font-size:\s*13px/);
    expect(verdict).not.toMatch(/font-weight/);
  });

  it("sets the letters in a state's square and in an officer's avatar at one size", () => {
    // Both read one custom property, so one cannot be changed without the
    // other, and it is given on the report's root, which holds both.
    const size = (selector: string) =>
      new RegExp(`${selector}\\s*\\{[^}]*font-size:\\s*([^;]+);`).exec(
        css,
      )?.[1];
    expect(size("\\.sr-state")).toBe("var(--sr-initials-size)");
    expect(size("\\.sr-avatar")).toBe("var(--sr-initials-size)");
    expect(css).toMatch(/\.sr\s*\{[^}]*--sr-initials-size:\s*\d+px/);
  });

  it("underlines the square of a state the filter named, in the cloud and on its filing", () => {
    // One rule for every square, not the cloud's alone.
    expect(css).toMatch(
      /\.sr-state\[data-matched="true"\]::after\s*\{[^}]*background:\s*var\(--sr-mark\)/,
    );
    expect(css).not.toMatch(/\.sr-states \.sr-state\[data-matched/);
    expect(css).toMatch(/--sr-mark:\s*#[0-9a-fA-F]{6}/);
  });

  it("closes the third step up the way a folded section closes, and only closes slowly", () => {
    // Closing is a grid row going to 0fr with a fade, as `.fold-body` does,
    // and the step is only clipped while it is closed.
    expect(demoCss).toMatch(
      /\.step-exit\[data-open="false"\]\s*\{[^}]*grid-template-rows:\s*0fr[^}]*opacity:\s*0[^}]*transition:\s*grid-template-rows 320ms/,
    );
    expect(demoCss).toMatch(
      /\.step-exit\[data-open="false"\] > \.step-exit-inner\s*\{[^}]*overflow:\s*hidden/,
    );
    expect(demoCss).toMatch(
      /prefers-reduced-motion: reduce\) \{\s*\.step-exit\[data-open="false"\]\s*\{\s*transition:\s*none/,
    );
    // Opening is at once, as it always was: only the closed state carries a
    // transition, and a transition runs by the state it goes to.
    const open = /\.step-exit\s*\{[^}]*\}/.exec(demoCss)?.[0] ?? "";
    expect(open).toMatch(/grid-template-rows:\s*1fr/);
    expect(open).not.toMatch(/transition/);
    // As long as the collapse: the hook holds the step for FOLD_MS.
    expect(read("demo/controls.tsx")).toMatch(/FOLD_MS\s*=\s*320/);
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
