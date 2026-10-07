// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import type { Route } from "@baselayer-sdk/autocomplete";

import { StylingPanel } from "../../site/demo/StylingPanel";
import {
  CUSTOM_FONT,
  DEFAULT_STYLE,
  type StyleState,
} from "../../site/demo/style-state";

afterEach(cleanup);

/** The panel with its state kept, as the demo keeps it. */
function Panel({ initial }: { initial: StyleState }) {
  const [state, setState] = useState(initial);
  return <StylingPanel state={state} onChange={setState} />;
}

/** The select that offers a font of your own. */
function fontSelect(): HTMLSelectElement {
  return screen.getByRole("option", { name: "Your own…" }).closest("select")!;
}

function fontStack(): HTMLInputElement | null {
  return screen.queryByRole("textbox", { name: /Font stack/ });
}

describe("the Font fold", () => {
  it("keeps the font stack's field while it is cleared and retyped", () => {
    render(<Panel initial={DEFAULT_STYLE} />);
    fireEvent.change(fontSelect(), { target: { value: CUSTOM_FONT } });
    const stack = fontStack()!;
    stack.focus();

    fireEvent.change(stack, { target: { value: "" } });
    expect(fontStack()).toBe(stack);
    expect(document.activeElement).toBe(stack);
    expect(fontSelect().value).toBe(CUSTOM_FONT);

    // A stack typed to match one of the choices is still your own.
    fireEvent.change(stack, {
      target: { value: 'system-ui, -apple-system, "Segoe UI", sans-serif' },
    });
    expect(fontStack()).toBe(stack);
    expect(fontSelect().value).toBe(CUSTOM_FONT);
  });

  it("picks afresh when the font is set from elsewhere", () => {
    const own: StyleState = {
      ...DEFAULT_STYLE,
      vars: { ...DEFAULT_STYLE.vars, "--bl-ac-font": '"Inter", sans-serif' },
    };
    const { rerender } = render(
      <StylingPanel state={own} onChange={() => {}} />,
    );
    expect(fontSelect().value).toBe(CUSTOM_FONT);

    rerender(<StylingPanel state={DEFAULT_STYLE} onChange={() => {}} />);
    expect(fontSelect().value).toBe("");
    expect(fontStack()).toBeNull();
  });
});

describe("the Components fold's searches", () => {
  /** The panel with its state and its search kept, as the demo keeps them. */
  function RoutedPanel({ start }: { start: Route }) {
    const [state, setState] = useState(DEFAULT_STYLE);
    const [route, setRoute] = useState<Route>(start);
    return (
      <>
        <output data-testid="route">{route}</output>
        <output data-testid="lists">
          {JSON.stringify([
            state.rows.people.list,
            state.rows.people.pickable,
            state.rows.addresses.list,
            state.rows.addresses.pickable,
          ])}
        </output>
        <StylingPanel
          state={state}
          onChange={setState}
          route={route}
          routes={["businesses", "people", "addresses"]}
          onRoute={setRoute}
        />
      </>
    );
  }

  const lists = () =>
    JSON.parse(screen.getByTestId("lists").textContent!) as string[][];

  it("has a tab per search, on the one the form is on, and moves the form with it", () => {
    render(<RoutedPanel start="people" />);

    const tabs = screen.getByRole("tablist", { name: "Row of" });
    expect(
      within(tabs)
        .getAllByRole("tab")
        .map(tab => tab.textContent),
    ).toEqual(["Business", "Person", "Address"]);
    expect(
      screen.getByRole("tab", { name: "Person" }).getAttribute("aria-selected"),
    ).toBe("true");
    expect(document.querySelector('[data-drop="headBadge"]')).not.toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "Address" }));
    expect(screen.getByTestId("route").textContent).toBe("addresses");
  });

  it("lists a person's addresses, and makes the person pickable", () => {
    render(<RoutedPanel start="people" />);

    fireEvent.click(
      within(
        screen.getByRole("group", { name: "Listed under each person" }),
      ).getByRole("checkbox", { name: "Their addresses" }),
    );
    fireEvent.click(
      within(screen.getByRole("group", { name: "Can be picked" })).getByRole(
        "checkbox",
        { name: "The person" },
      ),
    );

    expect(lists()).toEqual([
      ["businesses", "addresses"],
      ["business", "person"],
      ["businesses"],
      ["business"],
    ]);
  });

  it("lists the people at an address, and makes them pickable instead of its businesses", () => {
    render(<RoutedPanel start="addresses" />);
    const picked = screen.getByRole("group", { name: "Can be picked" });

    fireEvent.click(
      within(
        screen.getByRole("group", { name: "Listed under each address" }),
      ).getByRole("checkbox", { name: "People there" }),
    );
    fireEvent.click(
      within(picked).getByRole("checkbox", { name: "People there" }),
    );
    fireEvent.click(
      within(picked).getByRole("checkbox", { name: "Businesses" }),
    );

    expect(lists().slice(2)).toEqual([["businesses", "people"], ["person"]]);
  });

  it("has no lists or picks for a business's row", () => {
    render(<RoutedPanel start="businesses" />);

    expect(screen.queryByRole("group", { name: "Can be picked" })).toBeNull();
    expect(document.querySelector('[data-drop="titleBadge"]')).not.toBeNull();
  });
});
