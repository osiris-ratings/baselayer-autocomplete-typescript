import { render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
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

  it("turns away a string that is not made of what a length is made of", () => {
    for (const unsafe of [
      "10px; color: red",
      "10px } .x { color: red",
      "10px</style>",
      "10px !important",
      'calc(100% + 1px) "',
      "calc(100% + 1px) '",
      "10px\\3b color:red",
      "url(https://example.test/x)",
      "10px /* */ ; color:red",
      "@import 'x'",
      "10px\n; color:red",
    ]) {
      expect(drawn(unsafe), unsafe).toEqual({
        dataWidth: undefined,
        width: undefined,
      });
    }
  });

  it("takes what lengths are made of: numbers, units, words, operators, brackets and commas", () => {
    for (const length of [
      "40rem",
      "100%",
      "calc(100% + 56px)",
      "calc(200% + var(--gap, 24px))",
      "calc(100% - 2 * 1.5rem)",
      "clamp(22rem, calc(100% + 3.5rem), 40rem)",
      "min(100%, 40rem)",
      "max(20rem, 50%)",
      "fit-content(30rem)",
      "max-content",
      "calc(100cqw / 3)",
    ]) {
      expect(drawn(length).width, length).toBe(length);
    }
  });

  it("turns away what CSS would drop as a width, and falls back as though it were not given", () => {
    for (const notWidth of [
      "wide-ish",
      "calc(100% + 56)",
      "inherit",
      "initial",
      "unset",
      "auto",
      "none",
      "-2.5em",
      "40",
    ]) {
      expect(drawn(notWidth), notWidth).toEqual({
        dataWidth: undefined,
        width: undefined,
      });
      expect(drawn(notWidth, false), notWidth).toEqual({
        dataWidth: "fixed",
        width: undefined,
      });
    }
  });

  it("does not ask a browser what a width is: a server and the page say the same", () => {
    const supports = vi.fn(() => false);
    vi.stubGlobal("CSS", { supports });

    expect(drawn("40rem").width).toBe("40rem");
    expect(drawn("calc(100% + 56)").width).toBeUndefined();
    expect(supports).not.toHaveBeenCalled();
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

// A page rendered on a server has no CSS to ask, and its style attribute is
// text: nothing but a width may reach it.
describe("the menu, rendered on a server", () => {
  const menuTag = (markup: string) =>
    /<div[^>]*data-testid="autocomplete-menu"[^>]*>/.exec(markup)![0];

  const markup = (menuWidth: MenuWidth) =>
    renderToStaticMarkup(
      <BusinessAutocompleteView
        id="field"
        value=""
        onInputChange={() => {}}
        onSelect={() => {}}
        suggestions={[]}
        found={0}
        foundCapped={false}
        truncated={false}
        indexTag={null}
        roundTripMs={null}
        isSearching={false}
        error={null}
        open
        menuWidth={menuWidth}
      />,
    );

  it("writes a width as the one custom property, and nothing else", () => {
    const tag = menuTag(markup("calc(100% + 56px)"));

    expect(tag).toContain('style="--bl-ac-menu-width:calc(100% + 56px)"');
    expect(tag).toContain('data-width="fixed"');
    expect((tag.match(/style="/g) ?? []).length).toBe(1);
  });

  it("writes a number as pixels", () => {
    expect(menuTag(markup(420))).toContain('style="--bl-ac-menu-width:420px"');
  });

  it("writes no style at all for what is not a width, whatever it carries", () => {
    for (const unsafe of [
      '10px" onmouseover="alert(1)',
      "10px; position: fixed; inset: 0",
      "10px !important",
      "url(https://example.test/x)",
    ]) {
      const tag = menuTag(markup(unsafe));

      expect(tag, unsafe).not.toContain("style=");
      expect(tag, unsafe).not.toContain("onmouseover");
      expect(tag, unsafe).not.toContain("position");
      expect(tag, unsafe).not.toContain("example.test");
    }
  });
});
