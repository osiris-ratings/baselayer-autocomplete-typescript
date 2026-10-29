import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AddressAutocompleteView,
  BusinessAutocompleteView,
  PersonAutocompleteView,
  type MenuWidth,
} from "../../src/react";
import { menuWidthAttributes } from "../../src/react/menuWidth";

afterEach(() => {
  vi.unstubAllGlobals();
});

const WIDTH = "--bl-ac-menu-width";

/** What the menu is given for `menuWidth` and `menuFollowsInputWidth`. */
function drawn(
  menuWidth: MenuWidth | undefined,
  menuFollowsInputWidth?: boolean,
) {
  const { dataWidth, style } = menuWidthAttributes(
    menuWidth,
    menuFollowsInputWidth,
  );
  return {
    dataWidth,
    width: (style as Record<string, string> | undefined)?.[WIDTH],
  };
}

describe("menuWidth, by name", () => {
  it("is the input's width for 'input', and nothing is set on the menu", () => {
    expect(menuWidthAttributes("input", undefined)).toEqual({
      dataWidth: undefined,
      style: undefined,
    });
  });

  it("is the input's width and more for 'wide', through the stylesheet alone", () => {
    expect(menuWidthAttributes("wide", undefined)).toEqual({
      dataWidth: "wide",
      style: undefined,
    });
  });

  it("is --bl-ac-menu-width for 'fixed', as menuFollowsInputWidth={false} is", () => {
    expect(menuWidthAttributes("fixed", undefined)).toEqual(
      menuWidthAttributes(undefined, false),
    );
    expect(drawn("fixed")).toEqual({ dataWidth: "fixed", width: undefined });
  });

  it("takes a name with spaces round it", () => {
    expect(drawn(" wide ")).toEqual({ dataWidth: "wide", width: undefined });
  });

  it("does not take another word for a name, nor an inherited property for a preset", () => {
    // A browser says no to a word that is not a length; jsdom has none to ask.
    vi.stubGlobal("CSS", { supports: () => false });

    for (const name of [
      "Wide",
      "narrow",
      "content",
      "constructor",
      "toString",
    ]) {
      expect(drawn(name)).toEqual({ dataWidth: undefined, width: undefined });
    }
  });
});

describe("menuWidth, of its own", () => {
  it("is a number of pixels, as --bl-ac-menu-width on a menu that keeps its own width", () => {
    expect(drawn(420)).toEqual({ dataWidth: "fixed", width: "420px" });
    expect(drawn(372.5)).toEqual({ dataWidth: "fixed", width: "372.5px" });
  });

  it("is a CSS length as given, so a width counted from the input's reaches the stylesheet", () => {
    expect(drawn("calc(100% + 56px)")).toEqual({
      dataWidth: "fixed",
      width: "calc(100% + 56px)",
    });
    expect(drawn("40rem")).toEqual({ dataWidth: "fixed", width: "40rem" });
    expect(drawn("clamp(22rem, calc(100% + 3.5rem), 40rem)").width).toBe(
      "clamp(22rem, calc(100% + 3.5rem), 40rem)",
    );
    expect(drawn("  30em ").width).toBe("30em");
  });

  it("leaves out a width that is not one, as though it had not been given", () => {
    for (const unusable of [
      0,
      -20,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      "",
      "  ",
    ]) {
      expect(drawn(unusable)).toEqual({
        dataWidth: undefined,
        width: undefined,
      });
      expect(drawn(unusable, false)).toEqual({
        dataWidth: "fixed",
        width: undefined,
      });
    }
  });

  it("turns away a string that would end the declaration it is written into", () => {
    for (const unsafe of [
      "10px; color: red",
      "10px } .x { color: red",
      "10px</style>",
    ]) {
      expect(drawn(unsafe)).toEqual({ dataWidth: undefined, width: undefined });
    }
  });

  it("turns away a length the browser says is not a width, where there is a browser to ask", () => {
    const supports = vi.fn((property: string, value: string) =>
      /^[\d.]+(px|rem|em|%)$/.test(value),
    );
    vi.stubGlobal("CSS", { supports });

    expect(drawn("wide-ish")).toEqual({
      dataWidth: undefined,
      width: undefined,
    });
    expect(drawn("calc(100% + 56)", false)).toEqual({
      dataWidth: "fixed",
      width: undefined,
    });
    expect(drawn("40rem").width).toBe("40rem");
    expect(supports).toHaveBeenCalledWith("width", "wide-ish");
  });
});

describe("menuWidth beside menuFollowsInputWidth", () => {
  it("keeps menuFollowsInputWidth as it was when menuWidth is absent", () => {
    expect(drawn(undefined)).toEqual({
      dataWidth: undefined,
      width: undefined,
    });
    expect(drawn(undefined, true)).toEqual({
      dataWidth: undefined,
      width: undefined,
    });
    expect(drawn(undefined, false)).toEqual({
      dataWidth: "fixed",
      width: undefined,
    });
  });

  it("is menuWidth's, whichever way the boolean points", () => {
    expect(drawn("input", false)).toEqual({
      dataWidth: undefined,
      width: undefined,
    });
    expect(drawn("wide", false)).toEqual({
      dataWidth: "wide",
      width: undefined,
    });
    expect(drawn("wide", true)).toEqual({
      dataWidth: "wide",
      width: undefined,
    });
    expect(drawn("fixed", true)).toEqual({
      dataWidth: "fixed",
      width: undefined,
    });
    expect(drawn(420, true)).toEqual({ dataWidth: "fixed", width: "420px" });
    expect(drawn("calc(100% + 56px)", true).width).toBe("calc(100% + 56px)");
  });
});

// What each component puts on the menu it draws.
describe("the menu each view draws", () => {
  const rows = {
    suggestions: [],
    found: 0,
    foundCapped: false,
    truncated: false,
    indexTag: null,
    roundTripMs: null,
    isSearching: false,
    error: null,
    open: true,
    value: "",
    onInputChange: vi.fn(),
    onSelect: vi.fn(),
  };

  const views = {
    business: (props: {
      menuWidth?: MenuWidth;
      menuFollowsInputWidth?: boolean;
    }) => <BusinessAutocompleteView id="field" {...rows} {...props} />,
    person: (props: {
      menuWidth?: MenuWidth;
      menuFollowsInputWidth?: boolean;
    }) => <PersonAutocompleteView id="field" {...rows} {...props} />,
    address: (props: {
      menuWidth?: MenuWidth;
      menuFollowsInputWidth?: boolean;
    }) => <AddressAutocompleteView id="field" {...rows} {...props} />,
  };

  for (const [name, view] of Object.entries(views)) {
    describe(`the ${name} view`, () => {
      const menu = () => screen.getByTestId("autocomplete-menu");

      it("has no width attribute and no style, by default, as it never had", () => {
        render(view({}));

        expect(menu()).not.toHaveAttribute("data-width");
        expect(menu()).not.toHaveAttribute("style");
      });

      it("keeps menuFollowsInputWidth={false}: data-width fixed, no style", () => {
        render(view({ menuFollowsInputWidth: false }));

        expect(menu()).toHaveAttribute("data-width", "fixed");
        expect(menu()).not.toHaveAttribute("style");
      });

      it("follows the input for 'input', though menuFollowsInputWidth says not to", () => {
        render(view({ menuWidth: "input", menuFollowsInputWidth: false }));

        expect(menu()).not.toHaveAttribute("data-width");
        expect(menu()).not.toHaveAttribute("style");
      });

      it("is wide for 'wide': data-width wide, no style", () => {
        render(view({ menuWidth: "wide" }));

        expect(menu()).toHaveAttribute("data-width", "wide");
        expect(menu()).not.toHaveAttribute("style");
      });

      it("carries a width of its own as --bl-ac-menu-width on the menu", () => {
        render(
          view({ menuWidth: "calc(100% + 56px)", menuFollowsInputWidth: true }),
        );

        expect(menu()).toHaveAttribute("data-width", "fixed");
        expect(menu().style.getPropertyValue(WIDTH)).toBe("calc(100% + 56px)");
      });

      it("carries a number as pixels", () => {
        render(view({ menuWidth: 420 }));

        expect(menu().style.getPropertyValue(WIDTH)).toBe("420px");
      });
    });
  }

  it("keeps the data attribute, and the variable, when unstyled: they are the host's hooks", () => {
    render(
      <BusinessAutocompleteView
        id="field"
        {...rows}
        unstyled
        menuWidth={420}
      />,
    );

    const menu = screen.getByTestId("autocomplete-menu");
    expect(menu).toHaveAttribute("data-width", "fixed");
    expect(menu.style.getPropertyValue(WIDTH)).toBe("420px");
    expect(menu.className).toBe("");
  });
});
