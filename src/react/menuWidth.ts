import type { CSSProperties } from "react";

import { isCssWidth } from "./cssWidth";

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

/** The props that size the menu, on the components and on their views. */
export interface MenuWidthProps {
  /**
   * The menu's width: `"input"` (the default) is the input's, `"wide"` the
   * input's and 3.5rem more, `"fixed"` is `--bl-ac-menu-width`; or a width of
   * your own, a number of pixels or a CSS length such as `"calc(100% + 56px)"`,
   * where `100%` is the input's. From 48em up, and never wider than the screen:
   * below that the menu is the input's. When given, it wins over
   * `menuFollowsInputWidth`.
   */
  menuWidth?: MenuWidth | undefined;
  /**
   * The boolean form of `menuWidth`: the menu as wide as the input (the
   * default), or, `false`, as wide as `--bl-ac-menu-width` from 48em up. Read
   * only when `menuWidth` is not given.
   */
  menuFollowsInputWidth?: boolean | undefined;
}

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
 * a value `!important` is among it, so a string of it can only be a value, even
 * in the fallback of a `var()`, which is not read any further.
 */
const LENGTH_CHARACTERS = /^[\w\s.%+\-*/(),]+$/;

/**
 * A length the stylesheet can take as a width, or null. A width the browser
 * would drop leaves the menu with none at all, so it is turned away here, by
 * what CSS says a width is (`isCssWidth`) and not by asking a browser, which a
 * server has not got: both sides of a render say the same. And what is not
 * written in the characters of a length never reaches the style attribute.
 */
function lengthOf(value: number | string): string | null {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? `${value}px` : null;
  }
  const text = value.trim();
  return LENGTH_CHARACTERS.test(text) && isCssWidth(text) ? text : null;
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
