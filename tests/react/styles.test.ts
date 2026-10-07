import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { DEFAULT_LOOK, type Look } from "@baselayer-sdk/autocomplete";

const css = readFileSync(join(__dirname, "../../src/react/styles.css"), "utf8");

/** Every rule, as its selectors and its declarations, comments left out. */
const RULES = css
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("}")
  .flatMap(block => {
    const open = block.lastIndexOf("{");
    if (open < 0) {
      return [];
    }
    // Inside an at-rule, the selectors are what follows its own brace; a
    // selector the formatter broke over lines reads as it would on one.
    const head = block.slice(0, open);
    const selectors = head
      .slice(head.lastIndexOf("{") + 1)
      .split(",")
      .map(selector => selector.replace(/\s+/g, " ").trim());
    return [{ selectors, body: block.slice(open + 1) }];
  });

/** The declarations of every rule that names `selector`, alone or in a group. */
function rule(selector: string): string {
  const bodies = RULES.filter(({ selectors }) => selectors.includes(selector));
  expect(bodies.length, selector).toBeGreaterThan(0);
  return bodies.map(({ body }) => body).join("\n");
}

describe("ink emphasis", () => {
  it("inks a matched word in --bl-ac-ink-mark, else the title's color", () => {
    expect(rule('.bl-ac-name[data-emphasis="ink"] > .bl-ac-mark')).toContain(
      "color: var(--bl-ac-mark, var(--bl-ac-ink-mark, var(--bl-ac-title)));",
    );
  });

  it("leaves --bl-ac-ink-mark unset, so a host's title color carries over", () => {
    expect(rule(".bl-ac")).not.toContain("--bl-ac-ink-mark");
  });
});

describe("the emphasis of what a filter matched", () => {
  const EMPHASES = ["underline", "background", "weight", "ink"] as const;

  it("marks a matched officer and address as it marks the alternative name", () => {
    for (const emphasis of EMPHASES) {
      for (const field of [".bl-ac-address", ".bl-ac-people"]) {
        const marked = `${field}[data-emphasis="${emphasis}"] .bl-ac-mark`;
        const alias = `.bl-ac-also[data-emphasis="${emphasis}"] .bl-ac-mark`;
        expect(rule(marked), marked).toBe(rule(alias));
      }
    }
  });

  it("rings a matched state's square under each emphasis, as a fill and a weight it already has would not show", () => {
    for (const emphasis of EMPHASES) {
      const square = `.bl-ac[data-emphasis="${emphasis}"] .bl-ac-state[data-matched]`;
      expect(rule(square), square).toContain("box-shadow: 0 0 0 1.5px");
    }
    // Plain is no treatment at all.
    expect(css).not.toContain('data-emphasis="plain"');
  });

  it("underlines a matched state's text under the underline emphasis, and sets it bolder under weight", () => {
    expect(
      rule('.bl-ac[data-emphasis="underline"] .bl-ac-state[data-matched]'),
    ).toContain("text-decoration: underline;");
    expect(
      rule('.bl-ac[data-emphasis="weight"] .bl-ac-state[data-matched]'),
    ).toContain("font-weight: var(--bl-ac-weight-mark);");
  });
});

describe("the menu's width", () => {
  it("is the input's, whatever the screen", () => {
    expect(rule(".bl-ac-menu")).toContain("width: 100%;");
    expect(css).not.toMatch(
      /\.bl-ac-menu \{\s*width: var\(--bl-ac-menu-width\)/,
    );
  });

  it("is --bl-ac-menu-width from 48em up, on a menu that keeps its own", () => {
    const wide = css.slice(css.indexOf("@media (min-width: 48em)"));

    expect(wide).toMatch(
      /\.bl-ac-menu\[data-width="fixed"\] \{\s*width: var\(--bl-ac-menu-width\);/,
    );
  });
});

// What gives way when a line runs out of room is measured in a browser, in
// tests/browser/rows.test.tsx: jsdom lays nothing out.
describe("the title's pieces", () => {
  it("is the alternative name first, and whole: it wraps onto a line the title never shows", () => {
    const title = rule(".bl-ac-title");

    expect(title).toContain("flex-wrap: wrap;");
    expect(title).toContain("overflow: hidden;");
    // It stays on the line only with 6em to spare, and the name and its badge
    // are one piece that never wraps apart.
    expect(rule(".bl-ac-also")).toContain("flex: 1 1 6em;");
    expect(rule(".bl-ac-name-group")).toContain("max-width: 100%;");
  });

  it("keeps the title one line tall, but never shorter than a flag or a text badge, whatever the menu's type", () => {
    // A flag is 0.75rem of text on a line-height of 1, 0.125rem of padding
    // and a 1px border above and below: 1rem and 2px. The address and the
    // people are 14px on the menu's line-height, whatever its font size.
    const flag = rule(".bl-ac-structure");
    expect(flag).toContain("font-size: 0.75rem;");
    expect(flag).toContain("line-height: 1;");
    expect(rule(".bl-ac-address")).toContain("font-size: 14px;");
    expect(rule(".bl-ac-title")).toContain(
      "max-height: max(1lh, calc(1rem + 2px), calc(14px * var(--bl-ac-line-height)));",
    );
  });

  it("ellipsises text where it runs out, so the box ends where the text does", () => {
    for (const text of [".bl-ac-name", ".bl-ac-address", ".bl-ac-people"]) {
      expect(rule(text), text).toContain("white-space: nowrap;");
      expect(rule(text), text).toContain("text-overflow: ellipsis;");
      expect(rule(text), text).not.toContain("-webkit-line-clamp");
    }
  });
});

describe("a line's alignment", () => {
  it("sits text on the line's baseline, in the title, its pieces and every corner", () => {
    for (const container of [
      ".bl-ac-line",
      ".bl-ac-title",
      ".bl-ac-name-group",
      ".bl-ac-corner",
    ]) {
      expect(rule(container), container).toMatch(/align-items: baseline/);
    }
  });

  it("keeps a flag, and a corner of flags, centred on the first line", () => {
    for (const flag of [
      ".bl-ac-line-title .bl-ac-states",
      ".bl-ac-line-title .bl-ac-structure",
      ".bl-ac-line-title > .bl-ac-corner:not([data-text])",
    ]) {
      expect(rule(flag), flag).toMatch(/align-self: center/);
    }
  });
});

describe("the type", () => {
  it("is the host's font, unless --bl-ac-font names one", () => {
    expect(rule(".bl-ac")).toMatch(/font-family: var\(--bl-ac-font\);/);
    // Unset, the declaration falls back to inheriting the page's font.
    expect(css).not.toMatch(/--bl-ac-font:/);
  });

  it("draws every weight from a variable, with the weights it always had", () => {
    const root = rule(".bl-ac");
    expect(root).toMatch(/--bl-ac-name-weight: 600;/);
    expect(root).toMatch(/--bl-ac-weight-base: 500;/);
    expect(root).toMatch(/--bl-ac-weight-mark: 700;/);
    expect(rule(".bl-ac-name")).toMatch(
      /font-weight: var\(--bl-ac-name-weight\);/,
    );
    expect(rule('.bl-ac-name[data-emphasis="weight"]')).toMatch(
      /font-weight: var\(--bl-ac-weight-base\);/,
    );
    // The matched words, on the name and on the alternative name alike.
    for (const mark of [
      '.bl-ac-name[data-emphasis="weight"] > .bl-ac-mark',
      '.bl-ac-also[data-emphasis="weight"] .bl-ac-mark',
    ]) {
      expect(rule(mark), mark).toMatch(
        /font-weight: var\(--bl-ac-weight-mark\);/,
      );
    }
  });
});

describe("a disabled line", () => {
  it("fades by the look's default when the component sets nothing", () => {
    // The component sets the variables only for another `disabledDim`, so the
    // fallbacks must be the default's: its colour by 1 - d, its name, icon
    // and squares by 0.15 d.
    const d = DEFAULT_LOOK.disabledDim;
    expect(rule(".bl-ac-group-line:not([data-enabled])")).toContain(
      `filter: var(--bl-ac-disabled-filter, saturate(${1 - d}));`,
    );
    expect(css).toContain(
      `opacity: var(--bl-ac-disabled-opacity, ${Math.round((1 - d * 0.15) * 1000) / 1000});`,
    );
  });
});

describe("the stylesheet's colors", () => {
  // Each color knob of `look`, and the variable it sets.
  const VARIABLES: Record<
    Exclude<keyof Look, `match${string}` | "showDebugInfo" | "disabledDim">,
    string
  > = {
    backgroundColor: "--bl-ac-bg",
    titleColor: "--bl-ac-title",
    subtitleColor: "--bl-ac-subtitle",
    pillBackgroundColor: "--bl-ac-pill-bg",
    pillForegroundColor: "--bl-ac-pill-fg",
    primaryPillBorderColor: "--bl-ac-pill-primary-border",
    secondaryPillBackgroundColor: "--bl-ac-pill-secondary-bg",
    structurePillBackgroundColor: "--bl-ac-structure-bg",
    structurePillForegroundColor: "--bl-ac-structure-fg",
  };

  it("are the look's defaults, since the component sets only a color that differs", () => {
    const root = rule(".bl-ac");
    for (const [knob, variable] of Object.entries(VARIABLES)) {
      const declared = new RegExp(`${variable}: (#[0-9a-f]+);`, "i").exec(root);
      expect(declared?.[1]?.toLowerCase(), variable).toBe(
        DEFAULT_LOOK[knob as keyof typeof VARIABLES].toLowerCase(),
      );
    }
  });

  it("paint the structure's flag in its own variables", () => {
    const flag = rule(".bl-ac-structure");

    expect(flag).toContain("color: var(--bl-ac-structure-fg);");
    expect(flag).toContain("background: var(--bl-ac-structure-bg);");
  });
});
