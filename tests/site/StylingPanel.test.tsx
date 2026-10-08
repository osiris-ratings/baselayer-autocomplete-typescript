// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import type { Route } from "@baselayer-sdk/autocomplete";

import { StylingPanel } from "../../site/demo/StylingPanel";
import {
  CUSTOM_FONT,
  DEFAULT_STYLE,
  type StyleState,
} from "../../site/demo/style-state";

beforeAll(() => {
  // jsdom lays nothing out: the row map brings what is focused into view.
  Element.prototype.scrollIntoView = () => {};
});

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
            state.rows.people.enabled,
            state.rows.addresses.list,
            state.rows.addresses.enabled,
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

  /** Move a line to the other drawer by its grip. */
  const grip = (label: string) =>
    fireEvent.click(screen.getByRole("button", { name: label }));
  /** Tick or untick a line's Enabled checkbox. */
  const enable = (name: string) =>
    fireEvent.click(screen.getByRole("checkbox", { name: `Enable ${name}` }));
  const exported = () =>
    document.querySelector(".styling-export")!.textContent ?? "";

  it("lists a person's addresses, and enables the person, from the row map", () => {
    render(<RoutedPanel start="people" />);

    grip("Show their addresses");
    enable("the person");

    expect(lists()).toEqual([
      ["businesses", "addresses"],
      ["person", "business"],
      ["businesses"],
      ["business"],
    ]);
  });

  it("lists the people at an address, and enables them instead of its businesses", () => {
    render(<RoutedPanel start="addresses" />);

    grip("Show people there");
    enable("people there");
    enable("businesses");

    expect(lists().slice(2)).toEqual([["businesses", "people"], ["person"]]);
  });

  it("offers no checkboxes for what a row lists or what can be picked: the map is the configuration", () => {
    for (const start of ["businesses", "people", "addresses"] as const) {
      const view = render(<RoutedPanel start={start} />);
      expect(screen.queryByRole("group", { name: /Listed under/ })).toBeNull();
      expect(screen.queryByRole("group", { name: "Can be picked" })).toBeNull();
      view.unmount();
    }
  });

  it("exports each line as the map has it: shown and enabled, disabled, then hidden", () => {
    render(<RoutedPanel start="people" />);
    grip("Show their addresses");
    enable("their addresses");
    expect(exported()).toContain('list={["businesses", "addresses"]}');
    expect(exported()).toContain('enabledLines={["business", "address"]}');
    expect(exported()).toContain("onPickEntity");

    enable("their addresses");
    expect(exported()).toContain('list={["businesses", "addresses"]}');
    expect(exported()).not.toContain("enabledLines");
    expect(exported()).not.toContain("onPickEntity");

    grip("Hide their addresses");
    expect(lists()[0]).toEqual(["businesses"]);
    expect(lists()[1]).toEqual(["business"]);
    expect(exported()).not.toContain("addresses");
    expect(exported()).not.toContain('"address"');
    // A hidden line keeps its grip, to show it again.
    expect(
      screen.getByRole("button", { name: "Show their addresses" }),
    ).toBeTruthy();
  });

  it("explains the row map in one sentence, naming its Enabled column, never unpickable", () => {
    render(<RoutedPanel start="people" />);
    grip("Show their addresses");

    const note = screen.getByText(/Shown and Hidden/, {
      selector: "p.fold-note",
    });
    expect(note.textContent!.trim().split(/(?<=\.)\s+/)).toHaveLength(1);
    expect(note.textContent).toMatch(/\buntick Enabled\b/);
    const said = [note, document.querySelector(".row-map-wrap")!].flatMap(
      element => [
        element.textContent,
        ...[...element.querySelectorAll("[aria-label], [title]")].flatMap(
          labelled => [
            labelled.getAttribute("aria-label"),
            labelled.getAttribute("title"),
          ],
        ),
      ],
    );
    expect(said.filter(text => text !== null && /pick/i.test(text))).toEqual(
      [],
    );
  });

  it("lists a business's officers and enables them, as the other rows do", () => {
    render(<RoutedPanel start="businesses" />);

    expect(document.querySelector('[data-drop="titleBadge"]')).not.toBeNull();
    grip("Show officers and agents");
    enable("officers and agents");

    expect(exported()).toContain('list={["people"]}');
    expect(exported()).toContain('enabledLines={["business", "person"]}');
    expect(exported()).toContain("onPickEntity={pick => …}");
  });
});
