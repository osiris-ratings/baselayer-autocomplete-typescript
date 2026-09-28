// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

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
  fireEvent.pointerMove(handle, { clientX: 40, clientY: 30 });
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
    expect(lines).toEqual([
      ["titleBadge", "titleTrailingBadge", "titleTrailing"],
      [
        "subtitle",
        "subtitleBadge",
        "subtitleTrailingBadge",
        "subtitleTrailing",
      ],
    ]);
  });

  it("drags a field by its place onto a corner's badge", () => {
    const { onChange, spot } = mount();
    drag(
      spot("titleBadge").querySelector(".row-map-handle")!,
      spot("subtitleTrailingBadge"),
    );
    const { layout } = onChange.mock.calls[0]![0];
    expect(layout.titleBadge).toBeNull();
    expect(layout.subtitleTrailingBadge).toBe("structure");
  });

  it("swaps with what a taken place held", () => {
    const { onChange, spot } = mount();
    drag(
      spot("titleTrailing").querySelector(".row-map-handle")!,
      spot("subtitleTrailing"),
    );
    const { layout } = onChange.mock.calls[0]![0];
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
    expect(out.layout.subtitleTrailing).toBeNull();

    view.rerender(<RowMap state={out} onChange={onChange} />);
    const chip = view.container.querySelector(
      '.row-map-chip[data-field="people"]',
    )!;
    drag(chip, spot("subtitleBadge"));
    expect(onChange.mock.calls[1]![0].layout.subtitleBadge).toBe("people");
  });

  it("lights every spot that takes the field while it is dragged", () => {
    const { view, spot } = mount();
    const handle = spot("subtitle").querySelector(".row-map-handle")!;
    vi.spyOn(document, "elementFromPoint").mockReturnValue(spot("titleBadge"));
    fireEvent.pointerDown(handle, { button: 0, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(handle, { clientX: 40, clientY: 30 });

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
    fireEvent.pointerMove(document.body, { clientX: 40, clientY: 30 });
    fireEvent.pointerUp(document.body, { clientX: 40, clientY: 30 });

    const { layout } = onChange.mock.calls[0]![0];
    expect(layout.titleTrailing).toBe("people");
    expect(layout.subtitleTrailing).toBe("states");
  });

  it("does not drop a press that never moves", () => {
    const { onChange, spot } = mount();
    const handle = spot("titleBadge").querySelector(".row-map-handle")!;
    fireEvent.pointerDown(handle, { button: 0, clientX: 5, clientY: 5 });
    fireEvent.pointerUp(handle, { clientX: 6, clientY: 5 });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("gives an empty place no handle: all of it is the dropdown", () => {
    const { spot } = mount();
    expect(spot("subtitleBadge").querySelector(".row-map-handle")).toBeNull();
    expect(spot("subtitleBadge").querySelector("select")).not.toBeNull();
  });
});
