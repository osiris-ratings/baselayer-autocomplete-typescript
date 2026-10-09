import { useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import { RowMap } from "../../site/demo/RowMap";
import {
  DEFAULT_STYLE,
  withListed,
  type StyleState,
} from "../../site/demo/style-state";

import "../../site/shared/brand.css";
import "../../site/demo/demo.css";

function mount(initial: StyleState) {
  const host = document.createElement("div");
  host.className = "demo";
  host.style.width = "560px";
  document.body.append(host);
  const root = createRoot(host);
  function Kept() {
    const [state, setState] = useState(initial);
    return <RowMap state={state} onChange={setState} route="businesses" />;
  }
  flushSync(() => root.render(<Kept />));
  return {
    host,
    done() {
      root.unmount();
      host.remove();
    },
  };
}

const frame = () =>
  new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));

const pointer = (type: string, x: number, y: number, buttons: number) =>
  new PointerEvent(type, {
    bubbles: true,
    pointerId: 9,
    button: 0,
    buttons,
    clientX: x,
    clientY: y,
  });

/** The cursor the page shows at a point: that of whatever is under it. */
const cursorAt = (x: number, y: number) =>
  getComputedStyle(document.elementFromPoint(x, y) ?? document.body).cursor;

/** Its officers shown, its addresses hidden: a line in each drawer. */
const ONE = withListed(DEFAULT_STYLE, "businesses", "people", true);

describe("the pointer while something is carried", () => {
  for (const [what, handle] of [
    ["a line", 'button.row-map-grip[data-relation="people"]'],
    ["a field", ".row-map-chip"],
  ] as const) {
    it(`is a grabbing hand everywhere for ${what}, from lift to drop and to Escape`, async () => {
      const { host, done } = mount(ONE);
      try {
        const from = host.querySelector<HTMLElement>(handle)!;
        expect(from, handle).not.toBeNull();
        const shown = host
          .querySelector('[data-drawer="shown"]')!
          .getBoundingClientRect();
        const hidden = host
          .querySelector('[data-drawer="hidden"]')!
          .getBoundingClientRect();
        const x = shown.left + 60;
        const places: [string, number][] = [
          ["Shown", shown.top + shown.height / 2],
          ["Hidden", hidden.top + hidden.height / 2],
          ["the gap between them", (shown.bottom + hidden.top) / 2],
          ["outside the map", hidden.bottom + 60],
        ];
        const start = from.getBoundingClientRect();
        const [x0, y0] = [
          start.left + start.width / 2,
          start.top + start.height / 2,
        ];

        for (const end of ["drop", "Escape"] as const) {
          const at = host.querySelector<HTMLElement>(handle)!;
          const box = at.getBoundingClientRect();
          at.dispatchEvent(
            pointer(
              "pointerdown",
              box.left + box.width / 2,
              box.top + box.height / 2,
              1,
            ),
          );
          await frame();
          expect(document.documentElement.hasAttribute("data-dragging")).toBe(
            true,
          );
          for (const [where, y] of places) {
            window.dispatchEvent(pointer("pointermove", x, y, 1));
            await frame();
            expect(cursorAt(x, y), `${where}, before the ${end}`).toBe(
              "grabbing",
            );
          }
          if (end === "drop") {
            window.dispatchEvent(pointer("pointerup", x0, y0, 0));
          } else {
            window.dispatchEvent(
              new KeyboardEvent("keydown", { key: "Escape" }),
            );
          }
          await frame();
          expect(
            document.documentElement.hasAttribute("data-dragging"),
            `after the ${end}`,
          ).toBe(false);
          expect(cursorAt(x, places[3]![1])).not.toBe("grabbing");
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } finally {
        done();
      }
    });
  }

  it("is a grabbing hand over a place's menu too", async () => {
    // Both lines shown: the officers carried over the addresses' menu.
    const { host, done } = mount(
      withListed(ONE, "businesses", "addresses", true),
    );
    try {
      const select = host.querySelector<HTMLElement>(
        '.row-map-kind[data-relation="addresses"] .row-map-place select',
      )!;
      const box = select.getBoundingClientRect();
      const [x, y] = [box.left + box.width / 2, box.top + box.height / 2];
      const grip = host.querySelector<HTMLElement>(
        'button.row-map-grip[data-relation="people"]',
      )!;
      const start = grip.getBoundingClientRect();
      grip.dispatchEvent(
        pointer(
          "pointerdown",
          start.left + start.width / 2,
          start.top + start.height / 2,
          1,
        ),
      );
      await frame();
      window.dispatchEvent(pointer("pointermove", x, y, 1));
      await frame();
      const under = document.elementFromPoint(x, y)!;
      expect(under.tagName).toBe("SELECT");
      expect(getComputedStyle(under).cursor).toBe("grabbing");
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      await frame();
    } finally {
      done();
    }
  });
});
