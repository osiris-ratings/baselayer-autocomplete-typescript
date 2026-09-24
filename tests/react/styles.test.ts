import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const css = readFileSync(join(__dirname, "../../src/react/styles.css"), "utf8");

/** The declarations of the rule whose selector is exactly `selector`. */
function rule(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start, selector).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf("}", start));
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

describe("the people on the right of a row", () => {
  it("give way to the address before they run out of the row", () => {
    const people = rule('.bl-ac-people[data-slot="right"]');

    expect(people).toContain("max-width: calc(100% - 6rem);");
    expect(people).toContain("overflow: hidden;");
    expect(people).toContain("text-overflow: ellipsis;");
  });
});
