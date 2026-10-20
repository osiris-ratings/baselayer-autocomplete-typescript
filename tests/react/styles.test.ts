import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { DEFAULT_LOOK, type Look } from "@baselayer-sdk/autocomplete";

import { disabledInks } from "../../src/react/disabled";

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

describe("the letters the search corrected", () => {
  const FIELDS = [
    ".bl-ac-name",
    ".bl-ac-line-name",
    ".bl-ac-also",
    ".bl-ac-address",
    ".bl-ac-people",
  ];

  it.each(FIELDS)(
    "%s: under the underline emphasis, are the match's own line in its own color, dotted",
    field => {
      const solid = rule(`${field}[data-emphasis="underline"] .bl-ac-mark`);
      const dotted = rule(
        `${field}[data-emphasis="underline"] .bl-ac-corrected`,
      );

      // The match's line, so the same color, thickness and offset: beside a
      // solid one the two line up...
      for (const declaration of [
        "text-decoration-color: var(--bl-ac-mark, var(--bl-ac-underline));",
        "text-decoration-thickness: 1.5px;",
        "text-underline-offset: 3px;",
      ]) {
        expect(solid).toContain(declaration);
        expect(dotted).toContain(declaration);
      }
      // ...only dotted.
      expect(solid).toContain("text-decoration: underline;");
      expect(dotted).toContain("text-decoration: underline dotted;");
    },
  );

  it.each(FIELDS)(
    "%s: under the background emphasis, are stripes of the match's fill and the menu's ground, in the solid fill's letter color",
    field => {
      const body = rule(
        `${field}[data-emphasis="background"] .bl-ac-corrected`,
      );

      expect(body).toContain("repeating-linear-gradient(");
      expect(body).toContain("-45deg");
      // Two colors the component sets from the match color, else the marker
      // and nothing at all, which lets the menu's ground through whole; the
      // first is the pill's own, never clear.
      expect(body).toContain(
        "var(--bl-ac-stripe, var(--bl-ac-mark, var(--bl-ac-marker)))",
      );
      expect(body).toContain("var(--bl-ac-stripe-alt, transparent)");
      expect(body).not.toMatch(/\)\s*0 2px,\s*transparent/);
      // The reach and the corners of a mark, so that a run's two ends are
      // pill ends; where two spans touch the join rules below take both away.
      expect(body).toContain("margin: 0 -0.125rem;");
      expect(body).toContain("padding: 0 0.125rem;");
      expect(body).toContain("border-radius: 0.25rem;");
      expect(body).not.toContain("position");
      // The letters are the solid fill's, as they are on the pill.
      expect(body).toContain("color: var(--bl-ac-mark-fg);");
      expect(body).not.toContain("background-clip");
      expect(
        rule(`${field}[data-emphasis="background"] .bl-ac-mark`),
      ).toContain("color: var(--bl-ac-mark-fg);");
    },
  );

  it("make a run of marks and corrected letters one continuous shape: where two touch, no reach and no rounded corner", () => {
    for (const side of ["left", "right"]) {
      expect(css).toMatch(
        new RegExp(
          `\\[data-join~="${side}"\\]\\s*\\{\\s*margin-${side}: 0;\\s*padding-${side}: 0;\\s*border-top-${side}-radius: 0;\\s*border-bottom-${side}-radius: 0;`,
        ),
      );
    }
    // Under the background emphasis only, on the marks and the corrected ones.
    expect(css).toMatch(
      /\)\[data-emphasis="background"\]\s*:is\(\.bl-ac-mark, \.bl-ac-corrected\)\[data-join~="left"\]/,
    );
  });

  it("fade with the fill and the underline beside them on a disabled line", () => {
    for (const [emphasis, fade] of [
      ["underline", "text-decoration-color: color-mix("],
      ["background", "background: repeating-linear-gradient("],
    ]) {
      const body = rule(
        `.bl-ac-group > .bl-ac-row:not([data-enabled]) [data-emphasis="${emphasis}"] .bl-ac-corrected`,
      );
      expect(body).toContain(fade);
      expect(body).toContain("var(--bl-ac-disabled-mark, 67%)");
    }
  });

  it("have no color of their own to set, and no rule under weight or ink, which draw them as matches", () => {
    expect(css).not.toContain("--bl-ac-corrected");
    expect(css).not.toMatch(
      /\[data-emphasis="(weight|ink|plain)"\][^{}]*\.bl-ac-corrected/,
    );
  });
});

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

  it("marks a matched state's square as a square can, and rings it under none", () => {
    // The domicile keeps the only border; nothing moves the square.
    expect(css.replace(/\s+/g, " ")).not.toMatch(
      /\.bl-ac-state\[data-matched\][^{]*\{[^}]*pill-primary-border/,
    );
    expect(
      rule(
        '.bl-ac[data-emphasis="underline"] .bl-ac-state[data-matched]::after',
      ),
    ).toContain("bottom: -5px;");
    // A title shows one line: there, the line sits closer.
    expect(
      rule(
        '.bl-ac[data-emphasis="underline"] .bl-ac-title .bl-ac-state[data-matched]::after',
      ),
    ).toContain("bottom: -3px;");
    expect(
      rule('.bl-ac[data-emphasis="background"] .bl-ac-state[data-matched]'),
    ).toContain(
      "box-shadow: 0 0 0 0.125rem var(--bl-ac-mark, var(--bl-ac-marker));",
    );
    expect(
      rule('.bl-ac[data-emphasis="weight"] .bl-ac-state[data-matched]'),
    ).toContain("font-weight: var(--bl-ac-weight-mark);");
    expect(
      rule('.bl-ac[data-emphasis="ink"] .bl-ac-state[data-matched]'),
    ).toContain(
      "color: var(--bl-ac-mark, var(--bl-ac-ink-mark, var(--bl-ac-title)));",
    );
    // Plain is no treatment at all.
    expect(css).not.toContain('data-emphasis="plain"');
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

describe("a related line's name", () => {
  it("takes each emphasis's mark as a row's name does", () => {
    expect(
      rule('.bl-ac-line-name[data-emphasis="underline"] .bl-ac-mark'),
    ).toContain("text-decoration: underline;");
    expect(
      rule('.bl-ac-line-name[data-emphasis="background"] .bl-ac-mark'),
    ).toContain("background: var(--bl-ac-mark, var(--bl-ac-marker));");
    expect(
      rule('.bl-ac-line-name[data-emphasis="weight"] > .bl-ac-mark'),
    ).toContain("font-weight: var(--bl-ac-weight-mark);");
    expect(
      rule('.bl-ac-line-name[data-emphasis="ink"] > .bl-ac-mark'),
    ).toContain(
      "color: var(--bl-ac-mark, var(--bl-ac-ink-mark, var(--bl-ac-title)));",
    );
  });
});

describe("a disabled line", () => {
  it("is drawn by the default look's inks when the component sets none", () => {
    // The component sets the variables only for another look, so each
    // fallback must be the default's: the filter, the squares' opacity, and
    // the share of the title's and the subtitle's colour each text keeps.
    const inks = disabledInks(DEFAULT_LOOK);
    expect(css).toContain(
      `filter: var(--bl-ac-disabled-filter, ${inks.filter});`,
    );
    const flat = css.replace(/\s+/g, " ");
    expect(flat).toContain(
      `color: var( --bl-ac-disabled-name, color-mix(in srgb, var(--bl-ac-title) ${inks.nameShare}%, var(--bl-ac-bg)) );`,
    );
    expect(flat).toContain(
      `color: var( --bl-ac-disabled-role, color-mix(in srgb, var(--bl-ac-subtitle) ${inks.roleShare}%, var(--bl-ac-bg)) );`,
    );
    expect(flat).toContain(
      `color: var( --bl-ac-disabled-text, color-mix(in srgb, var(--bl-ac-subtitle) ${inks.textShare}%, var(--bl-ac-bg)) );`,
    );
    expect(flat).toContain(
      `opacity: var(--bl-ac-disabled-opacity, ${inks.opacity});`,
    );
    expect(flat).toContain(`var(--bl-ac-disabled-mark, ${inks.markShare}%)`);
  });

  it("fades a business line's other name with its address", () => {
    // `rule` splits selectors at every comma, those inside `:is()` too.
    expect(css.replace(/\s+/g, " ")).toMatch(
      /\.bl-ac-group-line:not\(\[data-enabled\]\) :is\(\.bl-ac-address, \.bl-ac-also, \.bl-ac-icon\),[^{]*\{ color: var\( --bl-ac-disabled-text,/,
    );
  });

  it("fades nothing at 0, and the default far enough to read as inactive", () => {
    expect(disabledInks({ ...DEFAULT_LOOK, disabledDim: 0 })).toMatchObject({
      filter: "none",
      opacity: "1",
      name: DEFAULT_LOOK.titleColor.toLowerCase(),
      text: DEFAULT_LOOK.subtitleColor.toLowerCase(),
      role: DEFAULT_LOOK.subtitleColor.toLowerCase(),
      nameShare: 100,
      textShare: 100,
      roleShare: 100,
    });
    expect(disabledInks(DEFAULT_LOOK)).toMatchObject({
      filter: "saturate(0)",
      opacity: "0.52",
    });
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
