import type { CSSProperties } from "react";

/**
 * The menu's width by name, from 48em up (below that it is the input's):
 * - `"input"`: the input's width, the default;
 * - `"wide"`: the input's width and 3.5rem more, never narrower;
 * - `"fixed"`: `--bl-ac-menu-width`, 560px unless you set it.
 */
export type MenuWidthPreset = "input" | "wide" | "fixed";

/**
 * A preset, or a width of your own: a number of pixels, or a CSS length such
 * as `"40rem"` or `"calc(100% + 56px)"`, where `100%` is the input's width.
 * `clamp()`, `min()` and `max()` bound it. It is never wider than the screen
 * allows (`100vw - 2rem`).
 */
export type MenuWidth = MenuWidthPreset | number | (string & {});

/** What the menu element carries for its width. */
export interface MenuWidthAttributes {
  /** The menu's `data-width`: none when it follows the input's width. */
  dataWidth: "fixed" | "wide" | undefined;
  /** `--bl-ac-menu-width`, set on the menu when the width is the host's own. */
  style: CSSProperties | undefined;
}

const INPUT: MenuWidthAttributes = { dataWidth: undefined, style: undefined };
const WIDE: MenuWidthAttributes = { dataWidth: "wide", style: undefined };
const FIXED: MenuWidthAttributes = { dataWidth: "fixed", style: undefined };

const PRESETS: Record<MenuWidthPreset, MenuWidthAttributes> = {
  input: INPUT,
  wide: WIDE,
  fixed: FIXED,
};

const isPreset = (value: string): value is MenuWidthPreset =>
  Object.hasOwn(PRESETS, value);

/**
 * What a width is written with: digits, letters (units, words, `var(--gap)`),
 * `.`, `%`, the four operators, brackets, commas and spaces. Nothing that ends
 * a declaration, opens a string, a comment, an escape or an at-rule, or marks
 * a value `!important` is among it, so a string of it can only be a value.
 */
const LENGTH_CHARACTERS = /^[\w\s.%+\-*/(),]+$/;

/**
 * A length the stylesheet can take as a width, or null. A width the browser
 * would drop leaves the menu with none at all, so it is turned away here; and
 * what is not written in the characters of a length never reaches the style
 * attribute, on a server too, where there is no CSS to ask.
 */
function lengthOf(value: number | string): string | null {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? `${value}px` : null;
  }
  const text = value.trim();
  if (!LENGTH_CHARACTERS.test(text)) return null;
  // Where there is no CSS to ask (a server, jsdom), the host is trusted.
  const css = (globalThis as { CSS?: Partial<typeof CSS> }).CSS;
  if (css?.supports && !css.supports("width", text)) return null;
  return text;
}

/**
 * The width the menu is given: `menuWidth` when it is usable, else the older
 * `menuFollowsInputWidth` (`false` is `"fixed"`, anything else `"input"`). A
 * `menuWidth` that is neither a preset nor a usable length is left out, as
 * though it had not been given.
 */
export function menuWidthAttributes(
  menuWidth: MenuWidth | undefined,
  menuFollowsInputWidth: boolean | undefined,
): MenuWidthAttributes {
  const name = typeof menuWidth === "string" ? menuWidth.trim() : null;
  if (name !== null && isPreset(name)) return PRESETS[name];
  const length = menuWidth === undefined ? null : lengthOf(menuWidth);
  if (length !== null) {
    return {
      dataWidth: "fixed",
      style: { "--bl-ac-menu-width": length } as CSSProperties,
    };
  }
  return menuFollowsInputWidth === false ? FIXED : INPUT;
}
