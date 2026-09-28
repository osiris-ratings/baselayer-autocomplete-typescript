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

/** How readily an element gives way: the last `flex-shrink` its rules set, else 1. */
function shrink(selector: string): number {
  let value = 1;
  for (const [, property, text] of rule(selector).matchAll(
    /(flex|flex-shrink): ([^;]+);/g,
  )) {
    const [first, second] = text!.trim().split(/\s+/);
    value =
      property === "flex-shrink"
        ? Number(first)
        : first === "none"
          ? 0
          : Number(second ?? 1);
  }
  return value;
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

describe("what gives way when a line runs out of room", () => {
  it("is the title before the first line's trailing place, and the second line's lead before its trailing place", () => {
    const trailing = shrink(
      '.bl-ac-line > .bl-ac-people[data-place="subtitleTrailing"]',
    );

    expect(shrink(".bl-ac-title")).toBeGreaterThan(trailing);
    expect(shrink(".bl-ac-people")).toBeGreaterThan(trailing);
    expect(rule(".bl-ac-title")).toContain("min-width: 0;");
  });

  it("never spreads a line's fields apart: only a trailing corner keeps to the right", () => {
    // A lead and its badge sit together, even with nothing trailing.
    expect(rule(".bl-ac-line")).not.toMatch(/justify-content/);
    expect(rule('.bl-ac-line > [data-place="subtitleTrailing"]')).toMatch(
      /margin-left: auto/,
    );
  });

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

  it("is never text at the right while its lead can give way, which a flag cannot", () => {
    // A trailing field that shrinks at all, by a fraction of a pixel, is
    // ellipsised though it had room.
    for (const place of ["titleTrailing", "subtitleTrailing"]) {
      expect(shrink(`.bl-ac-line > .bl-ac-people[data-place="${place}"]`)).toBe(
        0,
      );
    }
    expect(
      shrink(
        '.bl-ac-line > .bl-ac-states[data-place="subtitle"] ~ [data-place="subtitleTrailing"]',
      ),
    ).toBe(1);
  });

  it("is the name next, then text in the badge", () => {
    expect(shrink(".bl-ac-name")).toBeGreaterThan(
      shrink(".bl-ac-name-group > .bl-ac-people"),
    );
  });

  it("ellipsises text where it runs out, so the box ends where the text does", () => {
    for (const text of [".bl-ac-name", ".bl-ac-address", ".bl-ac-people"]) {
      expect(rule(text), text).toContain("white-space: nowrap;");
      expect(rule(text), text).toContain("text-overflow: ellipsis;");
      expect(rule(text), text).not.toContain("-webkit-line-clamp");
    }
  });

  it("is never a flag: the states and the structure keep their width in any place", () => {
    expect(shrink(".bl-ac-states")).toBe(0);
    expect(shrink(".bl-ac-structure")).toBe(0);
    expect(rule(".bl-ac-structure")).toContain("white-space: nowrap;");
  });

  it("keeps text at the right of the second line to all but about 5rem, so its lead keeps some room", () => {
    expect(
      rule('.bl-ac-line > .bl-ac-people[data-place="subtitleTrailing"]'),
    ).toContain("max-width: calc(100% - 6rem);");
  });

  it("lets text at the right take the room a flag or an empty lead leaves it", () => {
    // A flag keeps its own width and no more, so the text beside it needs no
    // cap; nor does text with no lead at all (a row with no structure where
    // only the structure leads).
    for (const selector of [
      '.bl-ac-line > .bl-ac-states[data-place="subtitle"] ~ [data-place="subtitleTrailing"]',
      '.bl-ac-line > .bl-ac-structure[data-place="subtitle"] ~ [data-place="subtitleTrailing"]',
      '.bl-ac-line > [data-place="subtitleTrailing"]:first-child',
    ]) {
      expect(rule(selector), selector).toContain("max-width: none;");
      expect(shrink(selector), selector).toBe(1);
    }
  });

  it("keeps text at the right of the first line to half of it, so the name keeps the rest", () => {
    expect(
      rule('.bl-ac-line > .bl-ac-address[data-place="titleTrailing"]'),
    ).toContain("max-width: 50%;");
  });

  it("keeps text in the badge to half the name's piece", () => {
    expect(rule(".bl-ac-name-group > .bl-ac-people")).toContain(
      "max-width: 50%;",
    );
  });
});

describe("the first line's alignment", () => {
  it("sits text on the name's baseline: the title, its pieces and text in any place", () => {
    for (const container of [
      ".bl-ac-line-title",
      ".bl-ac-title",
      ".bl-ac-name-group",
    ]) {
      expect(rule(container), container).toMatch(/align-items: baseline/);
    }
  });

  it("keeps a flag centred on the line, wherever it sits", () => {
    for (const flag of [
      ".bl-ac-line-title .bl-ac-states",
      ".bl-ac-line-title .bl-ac-structure",
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

describe("the stylesheet's colors", () => {
  // Each color knob of `look`, and the variable it sets.
  const VARIABLES: Record<
    Exclude<keyof Look, `match${string}` | "showDebugInfo">,
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
