import { afterEach, describe, expect, it, vi } from "vitest";

import { isCssWidth } from "../../src/react/cssWidth";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("what is a width", () => {
  it("is a length or a percentage", () => {
    for (const width of [
      "40rem",
      "372.5px",
      "50%",
      "100cqw",
      "0.5em",
      ".5em",
      "1e2px",
      "0px",
      "+40rem",
    ]) {
      expect(isCssWidth(width), width).toBe(true);
    }
  });

  it("is a sizing keyword", () => {
    for (const width of ["max-content", "min-content", "fit-content"]) {
      expect(isCssWidth(width), width).toBe(true);
    }
  });

  it("is a math function that adds up to a length", () => {
    for (const width of [
      "calc(100% + 56px)",
      "calc(200% + var(--gap, 24px))",
      "calc(100% - 2 * 1.5rem)",
      "calc(100% / 3)",
      "calc(3 * 1rem)",
      "calc((100% + 4px) / 2)",
      "calc(2 * (1rem + 4px))",
      "calc(100% + env(safe-area-inset-left, 0px))",
      "min(100%, 40rem)",
      "max(20rem, 50%)",
      "clamp(22rem, calc(100% + 3.5rem), 40rem)",
      "fit-content(30rem)",
      "calc( 100% + 56px )",
    ]) {
      expect(isCssWidth(width), width).toBe(true);
    }
  });

  it("is a variable or an environment value, whose value is not known here", () => {
    for (const width of [
      "var(--menu-width)",
      "var(--menu-width, 40rem)",
      "env(safe-area-inset-left)",
    ]) {
      expect(isCssWidth(width), width).toBe(true);
    }
  });

  it("is written with spaces inside its brackets, as CSS allows", () => {
    for (const width of [
      "fit-content( 30rem )",
      "fit-content(  calc(100% + 1rem)  )",
      "calc( 100% + 56px )",
      "min( 100% , 40rem )",
      "clamp( 22rem , 50% , 40rem )",
      "var( --menu-width )",
      "var( --menu-width , 40rem )",
      "env( safe-area-inset-left )",
    ]) {
      expect(isCssWidth(width), width).toBe(true);
    }
  });

  it("is a variable whose name starts with a digit, as a custom property's may", () => {
    for (const width of [
      "var(--2xl)",
      "var(--123)",
      "var(--2xl, 40rem)",
      "calc(100% + var(--1x))",
      "var(--a-b_c)",
    ]) {
      expect(isCssWidth(width), width).toBe(true);
    }
    // A custom property starts with two dashes; `env()` takes a plain name.
    for (const width of ["var(menu-width)", "var(-menu)", "var(--)", "var()"]) {
      expect(isCssWidth(width), width).toBe(false);
    }
  });

  it("is written in any case", () => {
    expect(isCssWidth("CALC(100% + 1PX)")).toBe(true);
    expect(isCssWidth("Max-Content")).toBe(true);
  });

  it("is not a keyword every property takes, nor one width does not", () => {
    for (const width of [
      "inherit",
      "initial",
      "unset",
      "revert",
      "revert-layer",
      "auto",
      "none",
      "stretch",
      "wide-ish",
      "wide",
    ]) {
      expect(isCssWidth(width), width).toBe(false);
    }
  });

  it("is not a number with no unit, nor a negative length", () => {
    for (const width of ["40", "0", "-2.5em", "-1px", "1.5", "calc(1 + 2)"]) {
      expect(isCssWidth(width), width).toBe(false);
    }
  });

  it("is not an expression CSS would drop", () => {
    for (const width of [
      // a number added to a length
      "calc(100% + 56)",
      // + and - take a space on each side
      "calc(100%+56px)",
      "calc(100% -56px)",
      // two lengths multiplied, or divided by one
      "calc(100% * 2px)",
      "calc(1px / 2px)",
      // not enough or too many arguments
      "calc()",
      "calc(100% +)",
      "min()",
      "min(100%,)",
      "clamp(1px, 2px)",
      "clamp(1px, 2px, 3px, 4px)",
      "calc(1px, 2px)",
      // a number among lengths
      "min(100%, 5)",
      "fit-content(5)",
      // not closed, closed twice, or not a function
      "calc(100% + 56px",
      "calc(100% + 56px))",
      "foo(1px)",
      "url(x)",
      // a sum or a group with no function, or a nested fit-content
      "100% + 56px",
      "(100% + 4px)",
      "calc(fit-content(1px) + 1px)",
      // two values
      "10px 20px",
      "",
    ]) {
      expect(isCssWidth(width), JSON.stringify(width)).toBe(false);
    }
  });

  it("does not ask the browser, so a server and a page say the same", () => {
    const supports = vi.fn(() => false);
    vi.stubGlobal("CSS", { supports });

    expect(isCssWidth("calc(100% + 56px)")).toBe(true);
    expect(isCssWidth("calc(100% + 56)")).toBe(false);
    expect(supports).not.toHaveBeenCalled();
  });
});
