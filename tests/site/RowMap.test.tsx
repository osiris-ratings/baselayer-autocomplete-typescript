// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { ROW_LINES, ROW_PLACES } from "@baselayer-sdk/autocomplete";

import { RowMap } from "../../site/demo/RowMap";
import { DEFAULT_STYLE, type StyleState } from "../../site/demo/style-state";

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
  it("draws every place, in its lines", () => {
    const { view } = mount();
    const lines = [...view.container.querySelectorAll(".row-map-line")].map(
      line =>
        [...line.querySelectorAll<HTMLElement>("[data-drop]")].map(
          place => place.dataset.drop,
        ),
    );
    // The row's own lines, as the core describes them: a place the core
    // adds is drawn here too.
    expect(lines).toEqual(
      ROW_LINES.map(({ lead, trailing }) =>
        [lead.field, lead.badge, trailing.badge, trailing.field].filter(
          place => place !== null,
        ),
      ),
    );
    expect(lines.flat()).toEqual(ROW_PLACES);
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
