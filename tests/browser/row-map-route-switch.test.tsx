import type { Route } from "@baselayer-sdk/autocomplete";
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

/** The map with its state and its search kept, both read back and set. */
function mount(initial: StyleState) {
  const host = document.createElement("div");
  host.className = "demo";
  host.style.width = "560px";
  document.body.append(host);
  const root = createRoot(host);
  const latest: { state: StyleState; setRoute: (route: Route) => void } = {
    state: initial,
    setRoute: () => {},
  };
  function Kept() {
    const [state, setState] = useState(initial);
    const [route, setRoute] = useState<Route>("businesses");
    latest.state = state;
    latest.setRoute = setRoute;
    return <RowMap state={state} onChange={setState} route={route} />;
  }
  flushSync(() => root.render(<Kept />));
  return {
    host,
    latest,
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
    pointerId: 7,
    pointerType: "mouse",
    button: 0,
    buttons,
    clientX: x,
    clientY: y,
  });

/** Both of a business's lines shown: its officers, then its addresses. */
const BOTH = withListed(
  withListed(DEFAULT_STYLE, "businesses", "people", true),
  "businesses",
  "addresses",
  true,
);

describe("the row map when its search changes", () => {
  it("ends a drag the switch comes in the middle of, dropping nothing into the other search's row", async () => {
    const { host, latest, done } = mount(BOTH);
    try {
      const grip = host.querySelector<HTMLElement>(
        'button.row-map-grip[data-relation="people"]',
      )!;
      const g = grip.getBoundingClientRect();
      grip.dispatchEvent(pointer("pointerdown", g.left + 8, g.top + 8, 1));
      await frame();
      window.dispatchEvent(pointer("pointermove", g.left + 30, g.top + 40, 1));
      await frame();
      flushSync(() => latest.setRoute("people"));
      await frame();
      const shown = host
        .querySelector<HTMLElement>('[data-drawer="shown"]')!
        .getBoundingClientRect();
      const y = shown.top + shown.height / 2;
      window.dispatchEvent(pointer("pointermove", g.left + 30, y, 1));
      await frame();
      window.dispatchEvent(pointer("pointerup", g.left + 30, y, 0));
      await frame();
      expect(latest.state.rows.people.list).toEqual(["businesses"]);
      expect(document.documentElement.hasAttribute("data-dragging")).toBe(
        false,
      );
      expect(
        document.querySelectorAll(".row-map-row-ghost, .row-map-ghost"),
      ).toHaveLength(0);
    } finally {
      done();
    }
  });

  it("ends a drag a switch between a person's and an address's map comes in the middle of", async () => {
    const { host, latest, done } = mount(BOTH);
    try {
      flushSync(() => latest.setRoute("people"));
      await frame();
      const before = latest.state.rows.addresses.list;
      const grip = host.querySelector<HTMLElement>(
        'button.row-map-grip[data-relation="businesses"]',
      )!;
      const g = grip.getBoundingClientRect();
      grip.dispatchEvent(pointer("pointerdown", g.left + 8, g.top + 8, 1));
      await frame();
      window.dispatchEvent(pointer("pointermove", g.left + 30, g.top + 40, 1));
      await frame();
      flushSync(() => latest.setRoute("addresses"));
      await frame();
      const hidden = host
        .querySelector<HTMLElement>('[data-drawer="hidden"]')!
        .getBoundingClientRect();
      const y = hidden.top + hidden.height / 2;
      window.dispatchEvent(pointer("pointermove", g.left + 30, y, 1));
      await frame();
      window.dispatchEvent(pointer("pointerup", g.left + 30, y, 0));
      await frame();
      expect(latest.state.rows.addresses.list).toEqual(before);
      expect(document.documentElement.hasAttribute("data-dragging")).toBe(
        false,
      );
      expect(
        document.querySelectorAll(".row-map-row-ghost, .row-map-ghost"),
      ).toHaveLength(0);
    } finally {
      done();
    }
  });

  it("leaves no copy, and no line out of sight, in the next search's map when it changes before a drop settles", async () => {
    const { host, latest, done } = mount(BOTH);
    try {
      const grip = host.querySelector<HTMLElement>(
        'button.row-map-grip[data-relation="addresses"]',
      )!;
      const g = grip.getBoundingClientRect();
      grip.dispatchEvent(pointer("pointerdown", g.left + 8, g.top + 8, 1));
      await frame();
      const people = host
        .querySelector<HTMLElement>('.row-map-kind[data-relation="people"]')!
        .getBoundingClientRect();
      window.dispatchEvent(
        pointer("pointermove", g.left + 30, people.top + 2, 1),
      );
      await frame();
      window.dispatchEvent(
        pointer("pointerup", g.left + 30, people.top + 2, 0),
      );
      await frame();
      flushSync(() => latest.setRoute("people"));
      await frame();
      expect(document.querySelectorAll(".row-map-row-ghost")).toHaveLength(0);
      expect(host.querySelectorAll("[data-landing]")).toHaveLength(0);
      for (const row of host.querySelectorAll<HTMLElement>(".row-map-kind")) {
        expect(getComputedStyle(row).opacity, row.dataset.relation).not.toBe(
          "0",
        );
      }
    } finally {
      done();
    }
  });
});
