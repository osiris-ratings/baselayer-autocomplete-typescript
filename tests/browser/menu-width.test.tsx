import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";

import type {
  BusinessSuggestion,
  PersonSuggestion,
} from "@baselayer-sdk/autocomplete";
import {
  BusinessAutocompleteView,
  PersonAutocompleteView,
  type MenuWidth,
} from "@baselayer-sdk/autocomplete/react";

import "../../src/react/styles.css";

// The width of the menu, as the browser lays it out: a debtor field 318px wide
// on a form 660px wide, which is what a console's form has. The menu is the
// input's width, a fixed 560px, the input's and 3.5rem more, or a width of the
// host's own, from 48em (768px) up; below that it is the input's. The viewport
// is 1280px wide, and the menu is never wider than `100vw - 2rem` of it.

const FIELD = 318;
const EM = 16;

const none = { count: 0, matched: null, truncated: false, items: [] };
const ROW: BusinessSuggestion = {
  type: "business",
  token: "tok-a",
  label: "HARBOR CONCRETE SUPPLY, INC.",
  matched_name: null,
  match: "strong",
  domicile_state: "NJ",
  states: ["NJ"],
  structure: null,
  related: { people: none, addresses: none },
  highlight: [
    { text: "HARBOR", matched: true },
    { text: " CONCRETE SUPPLY, INC.", matched: false },
  ],
};

const PERSON: PersonSuggestion = {
  type: "person",
  token: "tok-dana",
  label: "Dana Whitfield",
  match: "strong",
  states: ["NJ"],
  highlight: [
    { text: "Dana", matched: true },
    { text: " Whitfield", matched: false },
  ],
  related: { businesses: none, addresses: none },
};

interface Width {
  menuWidth?: MenuWidth;
  menuFollowsInputWidth?: boolean;
}

afterEach(async () => {
  document.body.replaceChildren();
  await page.viewport(1280, 900);
});

/** The field drawn in a `field`px column, and the boxes of its input and menu. */
function draw(
  width: Width,
  { field = FIELD, group = false }: { field?: number; group?: boolean } = {},
) {
  const host = document.createElement("form");
  host.style.cssText = `box-sizing:border-box;width:660px;padding:0 0 300px`;
  const column = document.createElement("div");
  column.style.width = `${field}px`;
  host.append(column);
  document.body.append(host);
  const shared = {
    id: "debtor",
    label: "Name",
    value: "harbor",
    onInputChange: () => {},
    onSelect: () => {},
    found: 1,
    foundCapped: false,
    truncated: false,
    indexTag: null,
    roundTripMs: null,
    isSearching: false,
    error: null,
    open: true,
    ...width,
  };
  const root = createRoot(column);
  flushSync(() =>
    root.render(
      group ? (
        <PersonAutocompleteView {...shared} suggestions={[PERSON]} />
      ) : (
        <BusinessAutocompleteView {...shared} suggestions={[ROW]} />
      ),
    ),
  );
  const input = column.querySelector("input")!;
  const menu = column.querySelector<HTMLElement>(
    '[data-testid="autocomplete-menu"]',
  )!;
  return {
    input: input.getBoundingClientRect(),
    menu: menu.getBoundingClientRect(),
    visible: getComputedStyle(menu).display !== "none",
  };
}

describe("the menu's width, drawn", () => {
  it("is the input's by default, and for 'input'", () => {
    for (const width of [{}, { menuWidth: "input" as const }]) {
      const { input, menu, visible } = draw(width);

      expect(visible).toBe(true);
      expect(input.width).toBe(FIELD);
      expect(menu.width).toBe(FIELD);
      expect(menu.left).toBe(input.left);
    }
  });

  it("is 560px for 'fixed', and for menuFollowsInputWidth={false}, as it always was", () => {
    expect(draw({ menuWidth: "fixed" }).menu.width).toBe(560);
    expect(draw({ menuFollowsInputWidth: false }).menu.width).toBe(560);
  });

  it("is the input's and 3.5rem more for 'wide', from the input's own edge", () => {
    const { input, menu } = draw({ menuWidth: "wide" });

    expect(menu.width).toBe(FIELD + 3.5 * EM);
    expect(menu.left).toBe(input.left);
  });

  it("is never narrower than the input for 'wide', however narrow the input", () => {
    for (const field of [120, 318, 500]) {
      const { input, menu } = draw({ menuWidth: "wide" }, { field });

      expect(menu.width).toBe(input.width + 3.5 * EM);
    }
  });

  it("is a number of pixels", () => {
    expect(draw({ menuWidth: 420 }).menu.width).toBe(420);
    // Narrower than the input, if that is what was asked for.
    expect(draw({ menuWidth: 240 }).menu.width).toBe(240);
  });

  it("is a CSS length, counted from the input's: the console's calc(100% + 56px)", () => {
    const { input, menu } = draw({ menuWidth: "calc(100% + 56px)" });

    expect(menu.width).toBe(input.width + 56);
    expect(draw({ menuWidth: "40rem" }).menu.width).toBe(640);
    expect(draw({ menuWidth: "50%" }).menu.width).toBe(FIELD / 2);
  });

  it("is bounded by clamp(): the width asked for, between a least and a most", () => {
    const bounded = "clamp(22rem, calc(100% + 3.5rem), 26rem)";

    // 318 + 56 = 374 is between 352 and 416.
    expect(draw({ menuWidth: bounded }, { field: 318 }).menu.width).toBe(374);
    // A narrow input does not drag it under the least.
    expect(draw({ menuWidth: bounded }, { field: 200 }).menu.width).toBe(352);
    // A wide one does not push it over the most.
    expect(draw({ menuWidth: bounded }, { field: 500 }).menu.width).toBe(416);
  });

  it("is never wider than the screen, whatever the width asked for", () => {
    for (const menuWidth of [5000, "400vw", "calc(100% + 4000px)"]) {
      const { menu } = draw({ menuWidth });

      expect(menu.width).toBe(1280 - 2 * EM);
    }
  });

  it("is menuWidth's when both are given", () => {
    expect(
      draw({ menuWidth: "input", menuFollowsInputWidth: false }).menu.width,
    ).toBe(FIELD);
    expect(
      draw({ menuWidth: "wide", menuFollowsInputWidth: false }).menu.width,
    ).toBe(FIELD + 3.5 * EM);
    expect(
      draw({ menuWidth: 420, menuFollowsInputWidth: true }).menu.width,
    ).toBe(420);
  });

  it("is the input's when the width is not a length, as though none was given", () => {
    for (const menuWidth of ["wide-ish", "calc(100% + 56)", "", 0, -10]) {
      expect(draw({ menuWidth }).menu.width).toBe(FIELD);
      expect(draw({ menuWidth, menuFollowsInputWidth: false }).menu.width).toBe(
        560,
      );
    }
  });

  it("is the same on a person field's menu", () => {
    expect(draw({ menuWidth: "wide" }, { group: true }).menu.width).toBe(
      FIELD + 3.5 * EM,
    );
    expect(draw({ menuWidth: 420 }, { group: true }).menu.width).toBe(420);
  });

  it("is the input's, below 48em, whatever the width asked for", async () => {
    await page.viewport(700, 900);

    for (const width of [
      { menuWidth: "wide" as const },
      { menuWidth: "fixed" as const },
      { menuWidth: 420 },
      { menuWidth: "calc(100% + 56px)" },
      { menuFollowsInputWidth: false },
    ]) {
      const { input, menu } = draw(width);

      expect(menu.width).toBe(input.width);
    }
  });

  it("is a menu's width from 48em: 768px, and not 767px", async () => {
    await page.viewport(768, 900);
    expect(draw({ menuWidth: "wide" }).menu.width).toBe(FIELD + 3.5 * EM);

    await page.viewport(767, 900);
    expect(draw({ menuWidth: "wide" }).menu.width).toBe(FIELD);
  });
});
