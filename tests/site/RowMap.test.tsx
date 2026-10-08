// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { BUSINESS_ROW } from "@baselayer-sdk/autocomplete";

import { RowMap } from "../../site/demo/RowMap";
import {
  DEFAULT_STYLE,
  componentProps,
  withListOrder,
  withListed,
  type StyleState,
} from "../../site/demo/style-state";

beforeAll(() => {
  // jsdom has neither pointer events, hit testing nor scrolling: a pointer
  // event is a mouse event with an id, and the page answers what is under a
  // point below.
  class PointerEvent extends MouseEvent {
    pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
    }
  }
  vi.stubGlobal("PointerEvent", PointerEvent);
  Element.prototype.setPointerCapture = () => {};
  document.elementFromPoint = () => null;
  Element.prototype.scrollIntoView = () => {};
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function mount(state: StyleState = DEFAULT_STYLE) {
  const onChange = vi.fn<(state: StyleState) => void>();
  const view = render(<RowMap state={state} onChange={onChange} />);
  const spot = (name: string) =>
    view.container.querySelector<HTMLElement>(`[data-drop="${name}"]`)!;
  return { view, onChange, spot };
}

/** Press on `handle`, move over `target`, and let go there. */
function drag(handle: Element, target: Element) {
  vi.spyOn(document, "elementFromPoint").mockReturnValue(target);
  fireEvent.pointerDown(handle, { button: 0, clientX: 0, clientY: 0 });
  fireEvent.pointerMove(handle, { buttons: 1, clientX: 40, clientY: 30 });
  fireEvent.pointerUp(handle, { clientX: 40, clientY: 30 });
}

describe("the Components fold's row", () => {
  /** Each drawn line's places, in reading order. */
  const drawnLines = (container: HTMLElement) =>
    [...container.querySelectorAll(".row-map-line")].map(line =>
      [...line.querySelectorAll<HTMLElement>("[data-drop]")].map(
        place => place.dataset.drop,
      ),
    );

  it("draws every line's places, the head's first, whether the row lists the line or not", () => {
    const { view } = mount();
    // The row, as the core describes it: a place the core adds is drawn here
    // too.
    expect(drawnLines(view.container)).toEqual(
      BUSINESS_ROW.lines.map(({ lead, trailing }) =>
        [lead.field, lead.badge, trailing.badge, trailing.field].filter(
          place => place !== null && place !== undefined,
        ),
      ),
    );
  });

  it("puts only a drawn line's fields on the tray", () => {
    const { view } = mount();
    const tray = () =>
      [
        ...view.container.querySelectorAll<HTMLElement>(
          ".row-map-tray .row-map-chip",
        ),
      ].map(chip => chip.dataset.field);
    // The officers' and the addresses' lines are switched off.
    expect(tray()).toEqual([]);

    // The officers' line listed, their role taken off it: on the tray.
    const listed = withListed(DEFAULT_STYLE, "businesses", "people", true);
    const roleOut: StyleState = {
      ...listed,
      rows: {
        ...listed.rows,
        businesses: {
          ...listed.rows.businesses,
          layout: { ...listed.rows.businesses.layout, personTrailing: null },
        },
      },
    };
    view.rerender(<RowMap state={roleOut} onChange={() => {}} />);
    expect(tray()).toEqual(["personRole"]);

    // The line switched off again: its fields go with it.
    view.rerender(
      <RowMap
        state={withListed(roleOut, "businesses", "people", false)}
        onChange={() => {}}
      />,
    );
    expect(tray()).toEqual([]);
  });

  it("swaps a field picked from a place's dropdown with the place's own", () => {
    const { onChange, spot } = mount();
    fireEvent.change(spot("subtitle").querySelector("select")!, {
      target: { value: "states" },
    });

    const { layout } = onChange.mock.calls[0]![0].rows.businesses;
    expect(layout.subtitle).toBe("states");
    expect(layout.titleTrailing).toBe("address");
  });

  it("drags a field by its place onto a corner's badge", () => {
    const { onChange, spot } = mount();
    drag(
      spot("titleBadge").querySelector(".row-map-handle")!,
      spot("subtitleTrailingBadge"),
    );
    const { layout } = onChange.mock.calls[0]![0].rows.businesses;
    expect(layout.titleBadge).toBeNull();
    expect(layout.subtitleTrailingBadge).toBe("structure");
  });

  it("swaps with what a taken place held", () => {
    const { onChange, spot } = mount();
    drag(
      spot("titleTrailing").querySelector(".row-map-handle")!,
      spot("subtitleTrailing"),
    );
    const { layout } = onChange.mock.calls[0]![0].rows.businesses;
    expect(layout.titleTrailing).toBe("people");
    expect(layout.subtitleTrailing).toBe("states");
  });

  it("leaves a field out on the tray, and brings it back from there", () => {
    const { view, onChange, spot } = mount();
    drag(
      spot("subtitleTrailing").querySelector(".row-map-handle")!,
      spot("tray"),
    );
    const out = onChange.mock.calls[0]![0];
    expect(out.rows.businesses.layout.subtitleTrailing).toBeNull();

    view.rerender(<RowMap state={out} onChange={onChange} />);
    const chip = view.container.querySelector(
      '.row-map-chip[data-field="people"]',
    )!;
    drag(chip, spot("subtitleBadge"));
    expect(
      onChange.mock.calls[1]![0].rows.businesses.layout.subtitleBadge,
    ).toBe("people");
  });

  it("lights every spot that takes the field while it is dragged", () => {
    const { view, spot } = mount();
    const handle = spot("subtitle").querySelector(".row-map-handle")!;
    vi.spyOn(document, "elementFromPoint").mockReturnValue(spot("titleBadge"));
    fireEvent.pointerDown(handle, { button: 0, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(handle, { buttons: 1, clientX: 40, clientY: 30 });

    const accepting = [
      ...view.container.querySelectorAll<HTMLElement>("[data-accepts]"),
    ].map(place => place.dataset.drop);
    // Not its own place, nor the badge that would pin it beside itself.
    expect(accepting).toEqual([
      "titleBadge",
      "titleTrailingBadge",
      "titleTrailing",
      "subtitleTrailing",
      // The Hidden drawer, all of it, to leave the field out.
      "hidden",
    ]);
    expect(document.querySelector(".row-map-ghost")).toHaveProperty(
      "textContent",
      "Address",
    );
    fireEvent.pointerUp(handle, { clientX: 40, clientY: 30 });
    expect(view.container.querySelector("[data-accepts]")).toBeNull();
  });

  it("does not pin a field beside itself", () => {
    const { onChange, spot } = mount();
    drag(
      spot("subtitle").querySelector(".row-map-handle")!,
      spot("subtitleBadge"),
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it("drags after a menu is left focused, even when the handle cannot capture the pointer", () => {
    const { onChange, spot } = mount();
    const menu = spot("titleTrailing").querySelector("select")!;
    menu.focus();
    vi.spyOn(Element.prototype, "setPointerCapture").mockImplementation(() => {
      throw new DOMException("No active pointer", "InvalidStateError");
    });
    vi.spyOn(document, "elementFromPoint").mockReturnValue(
      spot("subtitleTrailing"),
    );

    const handle = spot("titleTrailing").querySelector(".row-map-handle")!;
    fireEvent.pointerDown(handle, { button: 0, clientX: 0, clientY: 0 });
    expect(document.activeElement).not.toBe(menu);
    // Off the handle: the window follows the pointer.
    fireEvent.pointerMove(document.body, {
      buttons: 1,
      clientX: 40,
      clientY: 30,
    });
    fireEvent.pointerUp(document.body, { clientX: 40, clientY: 30 });

    const { layout } = onChange.mock.calls[0]![0].rows.businesses;
    expect(layout.titleTrailing).toBe("people");
    expect(layout.subtitleTrailing).toBe("states");
  });

  it("drags from a press the browser routes to the menu, away from the chevron", () => {
    const { onChange, spot } = mount();
    const place = spot("titleTrailing");
    vi.spyOn(
      place.querySelector(".row-map-handle")!,
      "getBoundingClientRect",
    ).mockReturnValue(new DOMRect(0, 0, 100, 28));
    vi.spyOn(document, "elementFromPoint").mockReturnValue(
      spot("subtitleTrailing"),
    );

    // Right after a native menu closes, the press lands on the select.
    const menu = place.querySelector("select")!;
    fireEvent.pointerDown(menu, { button: 0, clientX: 20, clientY: 10 });
    fireEvent.pointerMove(document.body, {
      buttons: 1,
      clientX: 60,
      clientY: 40,
    });
    fireEvent.pointerUp(document.body, { clientX: 60, clientY: 40 });

    expect(
      onChange.mock.calls[0]![0].rows.businesses.layout.subtitleTrailing,
    ).toBe("states");
  });

  it("drags from a bare mousedown, as Safari sends right after its menu closes", () => {
    // Safari skips the pointerdown for the first press after a native menu,
    // and sends the mouse events alone.
    const { onChange, spot } = mount();
    vi.spyOn(document, "elementFromPoint").mockReturnValue(
      spot("subtitleTrailing"),
    );
    const place = spot("titleTrailing");
    fireEvent.mouseDown(place.querySelector(".row-map-handle")!, {
      button: 0,
      clientX: 0,
      clientY: 0,
    });
    fireEvent.mouseMove(document.body, {
      buttons: 1,
      clientX: 40,
      clientY: 30,
    });
    fireEvent.mouseUp(document.body, { clientX: 40, clientY: 30 });

    expect(
      onChange.mock.calls[0]![0].rows.businesses.layout.subtitleTrailing,
    ).toBe("states");
  });

  it("leaves a mousedown on the chevron to the menu too", () => {
    const { view, onChange, spot } = mount();
    const place = spot("titleTrailing");
    vi.spyOn(
      place.querySelector(".row-map-handle")!,
      "getBoundingClientRect",
    ).mockReturnValue(new DOMRect(0, 0, 100, 28));
    const opened = fireEvent.mouseDown(place.querySelector("select")!, {
      button: 0,
      clientX: 110,
      clientY: 10,
    });
    fireEvent.mouseMove(document.body, {
      buttons: 1,
      clientX: 160,
      clientY: 40,
    });
    expect(opened).toBe(true);
    expect(view.container.querySelector("[data-accepts]")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("leaves a press on the chevron to the menu", () => {
    const { view, onChange, spot } = mount();
    const place = spot("titleTrailing");
    vi.spyOn(
      place.querySelector(".row-map-handle")!,
      "getBoundingClientRect",
    ).mockReturnValue(new DOMRect(0, 0, 100, 28));

    const menu = place.querySelector("select")!;
    const opened = fireEvent.pointerDown(menu, {
      button: 0,
      clientX: 110,
      clientY: 10,
    });
    fireEvent.pointerMove(document.body, {
      buttons: 1,
      clientX: 160,
      clientY: 40,
    });

    // Not cancelled, so the select still opens, and nothing is lifted.
    expect(opened).toBe(true);
    expect(view.container.querySelector("[data-accepts]")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("opens the menu on a press that never moves, and drops nothing", () => {
    const { onChange, spot } = mount();
    const place = spot("titleBadge");
    const handle = place.querySelector(".row-map-handle")!;
    // jsdom lays nothing out: without a width, every press is on the chevron.
    vi.spyOn(handle, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 0, 100, 28),
    );
    const showPicker = vi.fn();
    place.querySelector("select")!.showPicker = showPicker;

    const lifted = !fireEvent.pointerDown(handle, {
      button: 0,
      clientX: 5,
      clientY: 5,
    });
    fireEvent.pointerUp(handle, { clientX: 6, clientY: 5 });

    expect(lifted).toBe(true);
    expect(showPicker).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
  });

  /** Lift the states and carry them over the officers' place. */
  function carry(spot: (name: string) => HTMLElement) {
    const under = vi
      .spyOn(document, "elementFromPoint")
      .mockReturnValue(spot("subtitleTrailing"));
    const handle = spot("titleTrailing").querySelector(".row-map-handle")!;
    fireEvent.pointerDown(handle, { button: 0, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(document.body, {
      buttons: 1,
      clientX: 40,
      clientY: 30,
    });
    return under;
  }

  it("ends a pointer's drag whose button was let go where no listener saw it", () => {
    const { view, onChange, spot } = mount();
    carry(spot);
    expect(view.container.querySelector("[data-accepts]")).not.toBeNull();

    // A context menu or another window took the release: the next move
    // comes with the button up.
    fireEvent.pointerMove(document.body, {
      buttons: 0,
      clientX: 44,
      clientY: 30,
    });
    expect(view.container.querySelector("[data-accepts]")).toBeNull();
    expect(document.querySelector(".row-map-ghost")).toBeNull();

    // A later click anywhere drops nothing.
    fireEvent.pointerUp(document.body, { clientX: 44, clientY: 30 });
    expect(onChange).not.toHaveBeenCalled();
  });

  it.each([
    ["Escape", () => fireEvent.keyDown(window, { key: "Escape" })],
    ["the window losing focus", () => fireEvent.blur(window)],
    ["a context menu", () => fireEvent.contextMenu(window)],
  ])("ends a drag on %s", (_, end) => {
    const { view, onChange, spot } = mount();
    carry(spot);
    end();

    expect(view.container.querySelector("[data-accepts]")).toBeNull();
    fireEvent.pointerUp(document.body, { clientX: 40, clientY: 30 });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("drops where the pointer lets go, which a scroll since the last move can change", () => {
    const { onChange, spot } = mount();
    const under = carry(spot);

    // The pane scrolls under the still pointer, onto the tray.
    under.mockReturnValue(spot("tray"));
    fireEvent.pointerUp(document.body, { clientX: 40, clientY: 30 });

    const { layout } = onChange.mock.calls[0]![0].rows.businesses;
    expect(layout.titleTrailing).toBeNull();
    expect(layout.subtitleTrailing).toBe("people");
  });

  it("drops nothing where the pointer lets go over nothing", () => {
    const { onChange, spot } = mount();
    const under = carry(spot);

    under.mockReturnValue(null);
    fireEvent.pointerUp(document.body, { clientX: 40, clientY: 30 });

    expect(onChange).not.toHaveBeenCalled();
  });

  it("keeps what each field reads behind a disclosure, closed until opened", () => {
    const { view } = mount();
    const disclosure = view.container.querySelector("details")!;
    const summary = disclosure.querySelector("summary")!;

    expect(summary.textContent).toBe("What each field reads");
    expect(disclosure.open).toBe(false);
    expect(disclosure.querySelector("table.row-map-reads")).not.toBeNull();
    fireEvent.click(summary);
    expect(disclosure.open).toBe(true);
  });

  it("gives an empty place no handle: all of it is the dropdown", () => {
    const { spot } = mount();
    expect(spot("subtitleBadge").querySelector(".row-map-handle")).toBeNull();
    expect(spot("subtitleBadge").querySelector("select")).not.toBeNull();
  });
});

describe("the Components fold's row on People and Addresses", () => {
  function mountRoute(route: "people" | "addresses") {
    const onChange = vi.fn<(state: StyleState) => void>();
    const view = render(
      <RowMap state={DEFAULT_STYLE} onChange={onChange} route={route} />,
    );
    const spot = (name: string) =>
      view.container.querySelector<HTMLElement>(`[data-drop="${name}"]`)!;
    return { view, onChange, spot };
  }

  it("draws a person's row as its lines, each named and with its own places", () => {
    const { view } = mountRoute("people");
    const lines = [...view.container.querySelectorAll(".row-map-line")].map(
      line => ({
        name: line.querySelector(".row-map-name-long")?.textContent,
        places: [...line.querySelectorAll<HTMLElement>("[data-drop]")].map(
          place => place.dataset.drop,
        ),
      }),
    );

    expect(lines).toEqual([
      {
        name: "Person's name",
        places: ["headBadge", "headTrailingBadge", "headTrailing"],
      },
      {
        name: "Business name",
        places: ["businessBadge", "businessTrailingBadge", "businessTrailing"],
      },
      {
        name: "Their address",
        places: ["addressBadge", "addressTrailingBadge", "addressTrailing"],
      },
    ]);
  });

  it("moves a person's field within its line, into the person's layout only", () => {
    const { onChange, spot } = mountRoute("people");
    drag(
      spot("businessTrailing").querySelector(".row-map-handle")!,
      spot("businessBadge"),
    );

    const next = onChange.mock.calls[0]![0];
    expect(next.rows.people.layout.businessBadge).toBe("role");
    expect(next.rows.people.layout.businessTrailing).toBe("address");
    expect(next.rows.businesses).toBe(DEFAULT_STYLE.rows.businesses);
    expect(next.rows.addresses).toBe(DEFAULT_STYLE.rows.addresses);
  });

  it("takes a field on no other line's place", () => {
    const { onChange, spot } = mountRoute("people");
    drag(
      spot("headTrailing").querySelector(".row-map-handle")!,
      spot("businessTrailing"),
    );

    expect(onChange).not.toHaveBeenCalled();
  });

  it("edits an address's row into the address's layout", () => {
    const { onChange, spot } = mountRoute("addresses");
    fireEvent.change(spot("headTrailing").querySelector("select")!, {
      target: { value: "empty" },
    });

    const next = onChange.mock.calls[0]![0];
    expect(next.rows.addresses.layout.headTrailing).toBeNull();
    expect(next.rows.people).toBe(DEFAULT_STYLE.rows.people);
  });
});

describe("the row map as the row's configuration", () => {
  function mountOn(
    route: "businesses" | "people" | "addresses",
    state: StyleState = DEFAULT_STYLE,
  ) {
    const onChange = vi.fn<(state: StyleState) => void>();
    const view = render(
      <RowMap state={state} onChange={onChange} route={route} />,
    );
    const drawer = (name: "shown" | "hidden") =>
      view.container.querySelector<HTMLElement>(`[data-drawer="${name}"]`)!;
    const kinds = (name: "shown" | "hidden") =>
      [...drawer(name).querySelectorAll<HTMLElement>(".row-map-kind")].map(
        kind => kind.dataset.relation,
      );
    const kind = (relation: string) =>
      view.container.querySelector<HTMLElement>(
        `.row-map-kind[data-relation="${relation}"]`,
      )!;
    const grip = (relation: string) =>
      kind(relation).querySelector<HTMLButtonElement>("button.row-map-grip");
    const check = (relation: string) =>
      kind(relation).querySelector<HTMLInputElement>(".row-map-check")!;
    return { view, onChange, drawer, kinds, kind, grip, check };
  }

  it("shows the head and each line the row lists, and hides the rest, drawn in full", () => {
    const business = mountOn("businesses");
    expect(business.kinds("shown")).toEqual(["head"]);
    expect(business.kinds("hidden")).toEqual(["people", "addresses"]);
    cleanup();
    const person = mountOn("people");
    expect(person.kinds("shown")).toEqual(["head", "businesses"]);
    expect(person.kinds("hidden")).toEqual(["addresses"]);
    // A hidden line is drawn whole: its name and every place.
    expect(
      person.kind("addresses").querySelectorAll(".row-map-place, .row-map-name")
        .length,
    ).toBe(4);
  });

  it("gives every line a grip but the head, named for where it goes", () => {
    const { grip } = mountOn("people");
    expect(grip("head")).toBeNull();
    expect(grip("businesses")!.getAttribute("aria-label")).toBe(
      "Hide businesses",
    );
    expect(grip("addresses")!.getAttribute("aria-label")).toBe(
      "Show their addresses",
    );
  });

  it("moves a line to the other drawer by its grip, pressed or dragged", () => {
    const { onChange, grip, drawer } = mountOn("people");
    fireEvent.click(grip("addresses")!);
    expect(onChange.mock.calls[0]![0].rows.people.list).toEqual([
      "businesses",
      "addresses",
    ]);

    drag(grip("addresses")!, drawer("shown"));
    expect(onChange.mock.calls[1]![0].rows.people.list).toEqual([
      "businesses",
      "addresses",
    ]);
    drag(grip("businesses")!, drawer("hidden"));
    const hidden = onChange.mock.calls[2]![0];
    expect(hidden.rows.people.list).toEqual([]);
    // A hidden line is not drawn, so not a choice either, though it keeps
    // being enabled for when it is shown again.
    expect(componentProps(hidden, "people").enabledLines).toEqual([]);
    expect(hidden.rows.people.enabled).toEqual(["business"]);
  });

  it("keeps a line where it is when it is let go where it was, and takes one over a place of the other drawer", () => {
    const { onChange, grip, drawer, view } = mountOn("people");
    // The only line shown, let go in Shown: nowhere else to go.
    drag(grip("businesses")!, drawer("shown"));
    expect(onChange).not.toHaveBeenCalled();
    // Let go over a place of the other drawer: the drawer takes it.
    drag(
      grip("addresses")!,
      view.container.querySelector('[data-drop="businessTrailing"]')!,
    );
    expect(onChange.mock.calls[0]![0].rows.people.list).toEqual([
      "businesses",
      "addresses",
    ]);
  });

  it("does not move a line a drag only nudged, nor once a drag has dropped it", () => {
    const { onChange, grip, drawer } = mountOn("people");
    // A drag that dropped it is not a click as well: the browser's click
    // after the pointer's release does not move it back.
    const addresses = grip("addresses")!;
    drag(addresses, drawer("shown"));
    fireEvent.click(addresses);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("lights the drawer a carried line can go to", () => {
    const { grip, drawer, view } = mountOn("people");
    vi.spyOn(document, "elementFromPoint").mockReturnValue(drawer("shown"));
    const addresses = grip("addresses")!;
    fireEvent.pointerDown(addresses, { button: 0, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(addresses, { buttons: 1, clientX: 40, clientY: 30 });

    expect(
      [...view.container.querySelectorAll<HTMLElement>("[data-accepts]")].map(
        each => each.dataset.drop,
      ),
    ).toEqual(["shown"]);
    expect(document.querySelector(".row-map-ghost")?.textContent).toBe(
      "Their addresses",
    );
    fireEvent.pointerUp(addresses, { clientX: 40, clientY: 30 });
  });

  it("keeps a hidden line frozen: nothing moves into or out of it", () => {
    const { kind } = mountOn("people");
    const addresses = kind("addresses");
    const selects = [...addresses.querySelectorAll("select")];
    expect(selects.length).toBe(3);
    expect(selects.every(select => select.disabled)).toBe(true);
    expect(addresses.querySelector(".row-map-handle")).toBeNull();
  });

  it("disables a line by its checkbox, the head's too", () => {
    const { onChange, check } = mountOn("people");
    expect(check("head").checked).toBe(true);
    expect(check("head").getAttribute("aria-label")).toBe("Disable the person");
    expect(check("businesses").checked).toBe(false);

    fireEvent.click(check("head"));
    expect(onChange.mock.calls[0]![0].rows.people.enabled).toEqual([
      "person",
      "business",
    ]);
    fireEvent.click(check("businesses"));
    expect(onChange.mock.calls[1]![0].rows.people.enabled).toEqual([]);
  });

  it("gives a hidden line no Disabled checkbox, and a shown one back its own", () => {
    const hidden = mountOn(
      "people",
      withListed(DEFAULT_STYLE, "people", "businesses", false),
    );
    expect(
      hidden.kind("businesses").querySelector(".row-map-check"),
    ).toBeNull();
    expect(hidden.kind("addresses").querySelector(".row-map-check")).toBeNull();
    cleanup();
    // Shown again, as it was: enabled.
    const { check } = mountOn("people");
    expect(check("businesses").checked).toBe(false);
    expect(check("businesses").title).toBe(
      "Businesses: enabled, a choice in the menu (enabledLines)",
    );
  });

  it("draws the shown lines in the row's list's order", () => {
    const both = withListed(DEFAULT_STYLE, "people", "addresses", true);
    expect(mountOn("people", both).kinds("shown")).toEqual([
      "head",
      "businesses",
      "addresses",
    ]);
    cleanup();
    expect(
      mountOn("people", withListOrder(both, "people", "addresses", 0)).kinds(
        "shown",
      ),
    ).toEqual(["head", "addresses", "businesses"]);
  });

  it("moves a shown line up or down with Alt and an arrow, keeping its focus, and says where it went", () => {
    function Kept() {
      const [state, setState] = useState(
        withListed(DEFAULT_STYLE, "people", "addresses", true),
      );
      return <RowMap state={state} onChange={setState} route="people" />;
    }
    const view = render(<Kept />);
    const order = () =>
      [
        ...view.container.querySelectorAll<HTMLElement>(
          '[data-drawer="shown"] .row-map-kind',
        ),
      ].map(kind => kind.dataset.relation);
    const said = () =>
      view.container.querySelector('[role="status"]')!.textContent;
    const grip = () => screen.getByRole("button", { name: "Hide businesses" });

    grip().focus();
    fireEvent.keyDown(grip(), { key: "ArrowDown", altKey: true });
    expect(order()).toEqual(["head", "addresses", "businesses"]);
    expect(document.activeElement).toBe(grip());
    expect(said()).toBe("Businesses moved to position 2 of 2");

    // At the end already: it stays.
    fireEvent.keyDown(grip(), { key: "ArrowDown", altKey: true });
    expect(order()).toEqual(["head", "addresses", "businesses"]);

    fireEvent.keyDown(grip(), { key: "ArrowUp", altKey: true });
    expect(order()).toEqual(["head", "businesses", "addresses"]);
    expect(said()).toBe("Businesses moved to position 1 of 2");

    // An arrow alone moves nothing.
    fireEvent.keyDown(grip(), { key: "ArrowDown" });
    expect(order()).toEqual(["head", "businesses", "addresses"]);
  });

  it("moves nothing, and says nothing, when a line is already at the end it is moved toward", () => {
    const onChange = vi.fn<(state: StyleState) => void>();
    const view = render(
      <RowMap
        state={withListed(DEFAULT_STYLE, "people", "addresses", true)}
        onChange={onChange}
        route="people"
      />,
    );
    const said = () =>
      view.container.querySelector('[role="status"]')!.textContent;
    const first = screen.getByRole("button", { name: "Hide businesses" });
    const last = screen.getByRole("button", { name: "Hide their addresses" });

    fireEvent.keyDown(first, { key: "ArrowUp", altKey: true });
    fireEvent.keyDown(last, { key: "ArrowDown", altKey: true });

    expect(onChange).not.toHaveBeenCalled();
    expect(said()).toBe("");
  });

  it("tells a shown line's grip, and only a shown one's, that Alt and an arrow move it", () => {
    render(
      <RowMap
        state={withListed(DEFAULT_STYLE, "people", "addresses", true)}
        onChange={() => {}}
        route="people"
      />,
    );
    const shown = screen.getByRole("button", { name: "Hide businesses" });
    expect(shown.getAttribute("aria-keyshortcuts")).toBe(
      "Alt+ArrowUp Alt+ArrowDown",
    );
    expect(shown.title).toMatch(/ · Alt\+↑\/↓ to move$/);

    cleanup();
    render(<RowMap state={DEFAULT_STYLE} onChange={() => {}} route="people" />);
    const hidden = screen.getByRole("button", { name: "Show their addresses" });
    expect(hidden.hasAttribute("aria-keyshortcuts")).toBe(false);
    expect(hidden.title).not.toContain("Alt");
  });

  it("says when a line is shown or hidden", () => {
    function Kept() {
      const [state, setState] = useState(DEFAULT_STYLE);
      return <RowMap state={state} onChange={setState} route="people" />;
    }
    const view = render(<Kept />);
    fireEvent.click(
      screen.getByRole("button", { name: "Show their addresses" }),
    );
    expect(view.container.querySelector('[role="status"]')!.textContent).toBe(
      "Their addresses shown",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Hide their addresses" }),
    );
    expect(view.container.querySelector('[role="status"]')!.textContent).toBe(
      "Their addresses hidden",
    );
  });

  it("keeps the grip's focus as its line moves to the other drawer", () => {
    function Kept() {
      const [state, setState] = useState(DEFAULT_STYLE);
      return <RowMap state={state} onChange={setState} route="people" />;
    }
    render(<Kept />);
    fireEvent.click(
      screen.getByRole("button", { name: "Show their addresses" }),
    );

    const moved = screen.getByRole("button", { name: "Hide their addresses" });
    expect(document.activeElement).toBe(moved);
    expect(moved.closest("[data-drawer]")!.getAttribute("data-drawer")).toBe(
      "shown",
    );
  });

  it("draws as many lines wherever each one is", () => {
    const count = (state: StyleState) => {
      const view = render(
        <RowMap state={state} onChange={() => {}} route="people" />,
      );
      const lines = view.container.querySelectorAll(".row-map-line").length;
      view.unmount();
      return lines;
    };
    expect([
      count(DEFAULT_STYLE),
      count(withListed(DEFAULT_STYLE, "people", "addresses", true)),
      count(withListed(DEFAULT_STYLE, "people", "businesses", false)),
    ]).toEqual([3, 3, 3]);
  });

  /** The person's row with their businesses' role taken off its line. */
  const roleOut = (state: StyleState): StyleState => ({
    ...state,
    rows: {
      ...state.rows,
      people: {
        ...state.rows.people,
        layout: { ...state.rows.people.layout, businessTrailing: null },
      },
    },
  });

  it("keeps the fields the row leaves out in the Hidden drawer, ruled off from its hidden lines", () => {
    const { drawer, view } = mountOn("people", roleOut(DEFAULT_STYLE));
    const tray = drawer("hidden").querySelector<HTMLElement>(".row-map-tray")!;
    expect(
      [...tray.querySelectorAll<HTMLElement>(".row-map-chip")].map(
        chip => chip.dataset.field,
      ),
    ).toEqual(["role"]);
    // Under the hidden addresses: a rule between them.
    expect(tray.dataset.ruled).toBe("true");
    expect(view.container.textContent).not.toContain("Not shown");
    expect(
      view.container.querySelector(".row-map-wrap > .row-map-tray"),
    ).toBeNull();

    cleanup();
    const shown = mountOn(
      "people",
      roleOut(withListed(DEFAULT_STYLE, "people", "addresses", true)),
    );
    // No hidden line above it: no rule.
    expect(
      shown.drawer("hidden").querySelector<HTMLElement>(".row-map-tray")!
        .dataset.ruled,
    ).toBeUndefined();
  });

  it("takes a field dropped anywhere in the Hidden drawer", () => {
    const { onChange, drawer, view } = mountOn("people");
    drag(
      view.container.querySelector(
        '[data-drop="businessTrailing"] .row-map-handle',
      )!,
      drawer("hidden"),
    );
    // Left out: the role is in no place of the row.
    expect(
      Object.values(onChange.mock.calls[0]![0].rows.people.layout),
    ).not.toContain("role");
  });

  it("says how to fill the Hidden drawer only while nothing is in it", () => {
    const { drawer } = mountOn(
      "people",
      withListed(DEFAULT_STYLE, "people", "addresses", true),
    );
    expect(
      drawer("hidden").querySelector(".row-map-drawer-hint")?.textContent,
    ).toBe("Drag a line by its grip, or a field, here to hide it");
    cleanup();
    expect(
      mountOn("people").drawer("hidden").querySelector(".row-map-drawer-hint"),
    ).toBeNull();
    cleanup();
    expect(
      mountOn(
        "people",
        roleOut(withListed(DEFAULT_STYLE, "people", "addresses", true)),
      )
        .drawer("hidden")
        .querySelector(".row-map-drawer-hint"),
    ).toBeNull();
  });

  it("names each drawer's group of lines", () => {
    const { drawer } = mountOn("people");
    expect(
      drawer("shown")
        .querySelector('[role="group"]')!
        .getAttribute("aria-label"),
    ).toBe("Shown lines");
    expect(
      drawer("hidden")
        .querySelector('[role="group"]')!
        .getAttribute("aria-label"),
    ).toBe("Hidden lines");
  });

  it("lists what a field reads only for the lines the row shows", () => {
    const reads = (view: ReturnType<typeof render>) =>
      [
        ...view.container.querySelectorAll<HTMLElement>(
          ".row-map-reads tbody tr",
        ),
      ].map(row => row.dataset.field);
    const hidden = mountOn("people");
    expect(reads(hidden.view)).not.toContain("addressRole");
    cleanup();
    const shown = mountOn(
      "people",
      withListed(DEFAULT_STYLE, "people", "addresses", true),
    );
    expect(reads(shown.view)).toContain("addressRole");
  });

  it("carries a line as its name on a card, the line itself marked as carried", () => {
    const { grip, drawer, kind } = mountOn("people");
    vi.spyOn(document, "elementFromPoint").mockReturnValue(drawer("shown"));
    const addresses = grip("addresses")!;
    fireEvent.pointerDown(addresses, { button: 0, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(addresses, { buttons: 1, clientX: 40, clientY: 30 });

    const ghost = document.querySelector<HTMLElement>(".row-map-ghost")!;
    expect(ghost.classList.contains("row-map-line-ghost")).toBe(true);
    expect(ghost.classList.contains("row-map-place")).toBe(false);
    expect(ghost.style.width).toBe("");
    expect(kind("addresses").dataset.dragged).toBe("true");
    fireEvent.pointerUp(addresses, { clientX: 40, clientY: 30 });
    expect(kind("addresses").dataset.dragged).toBeUndefined();
  });

  it("carries a line by its grip from a bare mousedown, as Safari sends one", () => {
    const { onChange, grip, drawer } = mountOn("people");
    vi.spyOn(document, "elementFromPoint").mockReturnValue(drawer("shown"));
    const addresses = grip("addresses")!;
    fireEvent.mouseDown(addresses, { button: 0, clientX: 0, clientY: 0 });
    fireEvent.mouseMove(addresses, { buttons: 1, clientX: 40, clientY: 30 });
    fireEvent.mouseUp(addresses, { clientX: 40, clientY: 30 });
    expect(onChange.mock.calls[0]![0].rows.people.list).toEqual([
      "businesses",
      "addresses",
    ]);
  });

  it("takes a field on no gap of the row, only on a place", () => {
    const { onChange, view } = mountOn("businesses");
    drag(
      view.container.querySelector(
        '[data-drop="subtitleTrailing"] .row-map-handle',
      )!,
      view.container.querySelector(".row-map")!,
    );
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("a segment's icon in the row map", () => {
  function mountOn(
    route: "businesses" | "people" | "addresses",
    state: StyleState = DEFAULT_STYLE,
  ) {
    const onChange = vi.fn<(state: StyleState) => void>();
    const view = render(
      <RowMap state={state} onChange={onChange} route={route} />,
    );
    const toggle = (segment: string) =>
      view.container.querySelector<HTMLButtonElement>(
        `.row-map-icon[data-segment="${segment}"]`,
      );
    const toggles = () =>
      Object.fromEntries(
        [
          ...view.container.querySelectorAll<HTMLButtonElement>(
            ".row-map-icon",
          ),
        ].map(button => [
          button.dataset.segment,
          {
            on: button.getAttribute("aria-pressed"),
            frozen: button.disabled,
            glyph:
              button.querySelector<HTMLElement>("[data-glyph]")?.dataset.glyph,
          },
        ]),
      );
    return { view, onChange, toggle, toggles };
  }

  it("puts a toggle on each segment an icon can ride on, showing the glyph it draws", () => {
    expect(mountOn("people").toggles()).toEqual({
      name: { on: "true", frozen: false, glyph: "person" },
      firstAddress: { on: "false", frozen: false, glyph: "pin" },
      businessName: { on: "true", frozen: false, glyph: "building" },
      address: { on: "false", frozen: false, glyph: "pin" },
      // On a hidden line: frozen, as its places are.
      addressName: { on: "true", frozen: true, glyph: "pin" },
    });
    cleanup();
    const business = mountOn("businesses").toggles();
    expect(business.name).toEqual({
      on: "false",
      frozen: false,
      glyph: "building",
    });
    expect(business.people).toEqual({
      on: "false",
      frozen: false,
      glyph: "person",
    });
  });

  it("names each toggle for its segment", () => {
    const { toggle } = mountOn("people");
    expect(toggle("businessName")!.getAttribute("aria-label")).toBe(
      "Icon on Business name",
    );
    expect(toggle("firstAddress")!.getAttribute("aria-label")).toBe(
      "Icon on First address",
    );
  });

  it("puts the icon on its segment or takes it off", () => {
    const { onChange, toggle } = mountOn("people");
    fireEvent.click(toggle("firstAddress")!);
    expect(onChange.mock.calls[0]![0].rows.people.iconSegments).toEqual([
      "name",
      "firstAddress",
      "businessName",
      "addressName",
    ]);
    fireEvent.click(toggle("name")!);
    expect(onChange.mock.calls[1]![0].rows.people.iconSegments).toEqual([
      "businessName",
      "addressName",
    ]);
  });

  it("is pressed, not dragged: a press on it leaves the field where it is", () => {
    const { onChange, toggle, view } = mountOn("people");
    drag(
      toggle("firstAddress")!,
      view.container.querySelector('[data-drop="headTrailing"]')!,
    );
    expect(onChange).not.toHaveBeenCalled();
    expect(document.querySelector(".row-map-ghost")).toBeNull();
  });

  it("freezes a field's toggle on a hidden line, as its name's", () => {
    const { toggle } = mountOn(
      "people",
      withListed(DEFAULT_STYLE, "people", "businesses", false),
    );
    expect(toggle("businessName")!.disabled).toBe(true);
    expect(toggle("address")!.disabled).toBe(true);
    expect(toggle("firstAddress")!.disabled).toBe(false);
  });

  it("frees a line's toggles when the line is shown again", () => {
    const { toggle } = mountOn(
      "people",
      withListed(DEFAULT_STYLE, "people", "addresses", true),
    );
    expect(toggle("addressName")!.disabled).toBe(false);
  });

  it("puts no toggle on a segment the row leaves out", () => {
    const row = DEFAULT_STYLE.rows.businesses;
    const people = (
      Object.keys(row.layout) as (keyof typeof row.layout)[]
    ).find(place => row.layout[place] === "people")!;
    const { toggle } = mountOn("businesses", {
      ...DEFAULT_STYLE,
      rows: {
        ...DEFAULT_STYLE.rows,
        businesses: { ...row, layout: { ...row.layout, [people]: null } },
      },
    });
    expect(toggle("people")).toBeNull();
    expect(toggle("address")).not.toBeNull();
  });
});

describe("the Disabled column's guide with no canvas to measure on", () => {
  afterEach(() => {
    // jsdom has no offscreen canvas of its own.
    Reflect.deleteProperty(globalThis, "OffscreenCanvas");
  });

  const canvases: [string, unknown][] = [
    ["no offscreen canvas", undefined],
    [
      "no 2d context",
      class {
        getContext() {
          return null;
        }
      },
    ],
    [
      "a context that throws",
      class {
        getContext() {
          throw new Error("The context is lost");
        }
      },
    ],
  ];

  for (const [name, canvas] of canvases) {
    it(`still draws the guide, with ${name}`, () => {
      if (canvas !== undefined) vi.stubGlobal("OffscreenCanvas", canvas);
      // jsdom implements no canvas element, and reports asking one for a
      // context as an error.
      const element = vi.spyOn(HTMLCanvasElement.prototype, "getContext");
      const view = render(
        <RowMap
          state={withListed(DEFAULT_STYLE, "people", "addresses", true)}
          onChange={() => {}}
          route="people"
        />,
      );

      expect(element).not.toHaveBeenCalled();
      expect(
        view.container.querySelectorAll(".row-map-guide").length,
      ).toBeGreaterThan(0);
    });
  }
});
