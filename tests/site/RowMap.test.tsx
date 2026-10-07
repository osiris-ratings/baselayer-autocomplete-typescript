// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { BUSINESS_ROW } from "@baselayer-sdk/autocomplete";

import { RowMap } from "../../site/demo/RowMap";
import {
  DEFAULT_STYLE,
  withListed,
  type StyleState,
} from "../../site/demo/style-state";

beforeAll(() => {
  // jsdom has neither pointer events nor hit testing: a pointer event is a
  // mouse event with an id, and the page answers what is under a point below.
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
      "tray",
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
    const hidden = onChange.mock.calls[2]![0].rows.people;
    expect(hidden.list).toEqual([]);
    // A hidden line is not drawn, so not a choice either.
    expect(hidden.enabled).toEqual([]);
  });

  it("takes a line only in the drawer it is not in, over a place there too", () => {
    const { onChange, grip, drawer, view } = mountOn("people");
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

  it("leaves a hidden line's checkbox disabled", () => {
    const { check } = mountOn("people");
    expect(check("addresses").disabled).toBe(true);
    expect(check("addresses").checked).toBe(false);
    expect(check("businesses").disabled).toBe(false);
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
