import { useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { commands } from "vitest/browser";

import { RowMap } from "../../site/demo/RowMap";
import {
  DEFAULT_STYLE,
  withListed,
  type StyleState,
} from "../../site/demo/style-state";

import "../../site/shared/brand.css";
import "../../site/demo/demo.css";

declare module "vitest/browser" {
  interface BrowserCommands {
    /** Emulates `prefers-reduced-motion: reduce`, or lifts it. */
    reducedMotion: (active: boolean) => Promise<void>;
  }
}

/** The map with its state kept, the latest state read back. */
function mount(initial: StyleState, width = 560) {
  const host = document.createElement("div");
  host.className = "demo";
  host.style.width = `${width}px`;
  document.body.append(host);
  const root = createRoot(host);
  const latest = { state: initial };
  function Kept() {
    const [state, setState] = useState(initial);
    latest.state = state;
    return <RowMap state={state} onChange={setState} route="businesses" />;
  }
  flushSync(() => root.render(<Kept />));
  const kind = (relation: string) =>
    host.querySelector<HTMLElement>(
      `.row-map-kind[data-relation="${relation}"]`,
    )!;
  const grip = (relation: string) =>
    kind(relation).querySelector<HTMLElement>("button.row-map-grip")!;
  return {
    host,
    kind,
    grip,
    latest,
    done() {
      root.unmount();
      host.remove();
    },
  };
}

const frame = () =>
  new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
/** Longer than the settle back into place. */
const settled = () => new Promise(resolve => setTimeout(resolve, 600));

/** A pointer pressed on `from` and carried past the slop; the caller lets go. */
async function press(from: HTMLElement, pointerType = "mouse") {
  const start = from.getBoundingClientRect();
  const at = (
    type: string,
    clientX: number,
    clientY: number,
    buttons: number,
  ) =>
    new PointerEvent(type, {
      bubbles: true,
      pointerId: 7,
      pointerType,
      button: 0,
      buttons,
      clientX,
      clientY,
    });
  const x0 = start.left + start.width / 2;
  const y0 = start.top + start.height / 2;
  from.dispatchEvent(at("pointerdown", x0, y0, 1));
  await frame();
  window.dispatchEvent(at("pointermove", x0 + 2, y0 + 8, 1));
  await frame();
  return {
    x0,
    y0,
    async move(x: number, y: number) {
      window.dispatchEvent(at("pointermove", x, y, 1));
      await frame();
    },
    async up(x: number, y: number) {
      window.dispatchEvent(at("pointerup", x, y, 0));
      await frame();
    },
  };
}

const ghost = () => document.querySelector<HTMLElement>(".row-map-row-ghost");
/** What is drawn tilted: the lifted row's card. */
const card = () => ghost()!.querySelector<HTMLElement>(".row-map")!;

/** The rotation of a computed transform, in degrees; 0 for none. */
function degrees(transform: string): number {
  if (transform === "none") return 0;
  const [a, b] = /matrix\(([^)]+)\)/
    .exec(transform)![1]!
    .split(",")
    .map(Number);
  return (Math.atan2(b!, a!) * 180) / Math.PI;
}

const faces = (row: Element) =>
  [...row.querySelectorAll(".row-map-face, .row-map-name-long")].map(
    face => face.textContent,
  );

/** Where each place and the Enabled cell start, from `from`'s left. */
const places = (row: Element, from: number) =>
  [...row.querySelectorAll(".row-map-place, .row-map-check-cell")].map(each =>
    Math.round(each.getBoundingClientRect().left - from),
  );
/** A line's places from its own grip. */
const fromGrip = (row: Element) =>
  places(row, row.querySelector(".row-map-grip")!.getBoundingClientRect().left);

/** Both of a business's lines shown: its officers, then its addresses. */
const BOTH = withListed(
  withListed(DEFAULT_STYLE, "businesses", "people", true),
  "businesses",
  "addresses",
  true,
);

describe("a line carried by its grip", () => {
  afterEach(async () => {
    await commands.reducedMotion(false);
  });

  for (const pointerType of ["mouse", "touch"]) {
    it(`is held as its whole row, tilted, and nothing in the copy can be reached (${pointerType})`, async () => {
      const { kind, grip, done } = mount(BOTH);
      try {
        const live = kind("people");
        const name = grip("people").getAttribute("aria-label");
        expect(name).toMatch(/^Hide /);
        const drag = await press(grip("people"), pointerType);
        await drag.move(drag.x0 + 30, drag.y0 + 20);

        const held = ghost();
        expect(held).not.toBeNull();
        expect(held!.parentElement).toBe(document.body);
        const row = held!.querySelector(
          '.row-map-kind[data-relation="people"]',
        );
        expect(row, "the whole row").not.toBeNull();
        expect(faces(row!)).toEqual(faces(live));
        expect(row!.querySelector(".row-map-grip")).not.toBeNull();
        expect(row!.querySelector(".row-map-check")).not.toBeNull();
        expect(row!.hasAttribute("data-dragged")).toBe(false);

        const tilt = degrees(getComputedStyle(card()).transform);
        expect(Math.abs(tilt)).toBeGreaterThanOrEqual(0.75);
        expect(Math.abs(tilt)).toBeLessThanOrEqual(1.25);

        // Held where it was grabbed: the pointer is over the copy's grip.
        const copyGrip = row!
          .querySelector(".row-map-grip")!
          .getBoundingClientRect();
        expect(drag.x0 + 30).toBeGreaterThan(copyGrip.left - 4);
        expect(drag.x0 + 30).toBeLessThan(copyGrip.right + 4);

        // Hidden from assistive tech and out of reach of focus.
        expect(held!.getAttribute("aria-hidden")).toBe("true");
        expect(held!.hasAttribute("inert")).toBe(true);
        const copyButton = row!.querySelector<HTMLElement>("button")!;
        copyButton.focus();
        expect(document.activeElement).not.toBe(copyButton);
        // The live row keeps its own.
        expect(grip("people").getAttribute("aria-label")).toBe(name);
        expect(grip("people").closest("[inert], [aria-hidden]")).toBeNull();

        await drag.up(drag.x0 + 30, drag.y0 + 20);
      } finally {
        done();
      }
    });
  }

  it("settles into the place it is dropped, then is gone, the order as before", async () => {
    const { kind, grip, latest, done } = mount(BOTH);
    try {
      const below = kind("addresses").getBoundingClientRect();
      const drag = await press(grip("people"));
      await drag.move(below.left + 40, below.bottom - 2);
      expect(ghost()).not.toBeNull();
      await drag.up(below.left + 40, below.bottom - 2);

      expect(latest.state.rows.businesses.list).toEqual([
        "addresses",
        "people",
      ]);
      // Let go, it settles flat over the line's new place.
      expect(ghost()).not.toBeNull();
      expect(ghost()!.dataset.settling).toBe("true");
      expect(kind("people").dataset.landing).toBe("true");
      await settled();
      expect(ghost()).toBeNull();
      expect(kind("people").dataset.landing).toBeUndefined();
    } finally {
      done();
    }
  });

  it("goes back where it was on Escape, on a pointercancel, and on a drop outside the map", async () => {
    const { host, kind, grip, latest, done } = mount(BOTH);
    try {
      const below = kind("addresses").getBoundingClientRect();
      let drag = await press(grip("people"));
      await drag.move(below.left + 40, below.bottom - 2);
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      await frame();
      expect(ghost()?.dataset.settling).toBe("true");
      await settled();
      expect(ghost()).toBeNull();
      expect(latest.state.rows.businesses.list).toEqual([
        "people",
        "addresses",
      ]);

      drag = await press(grip("people"));
      await drag.move(below.left + 40, below.bottom - 2);
      window.dispatchEvent(
        new PointerEvent("pointercancel", { pointerId: 7, bubbles: true }),
      );
      await frame();
      expect(ghost()?.dataset.settling).toBe("true");
      await settled();
      expect(ghost()).toBeNull();
      expect(latest.state.rows.businesses.list).toEqual([
        "people",
        "addresses",
      ]);

      // Well clear of the map: no drawer, no place.
      const outside = { x: host.getBoundingClientRect().right + 200, y: 600 };
      expect(
        document
          .elementFromPoint(outside.x, outside.y)
          ?.closest("[data-drop]") ?? null,
      ).toBeNull();
      drag = await press(grip("people"));
      await drag.move(outside.x, outside.y);
      await drag.up(outside.x, outside.y);
      expect(ghost()?.dataset.settling).toBe("true");
      await settled();
      expect(ghost()).toBeNull();
      expect(latest.state.rows.businesses.list).toEqual([
        "people",
        "addresses",
      ]);
    } finally {
      done();
    }
  });

  it("settles over the line's new place, the line itself out of sight until it has", async () => {
    const { kind, grip, done } = mount(BOTH);
    try {
      const below = kind("addresses").getBoundingClientRect();
      const drag = await press(grip("people"));
      await drag.move(below.left + 40, below.bottom - 2);
      await drag.up(below.left + 40, below.bottom - 2);
      await frame();
      const row = kind("people").getBoundingClientRect();
      expect(parseFloat(ghost()!.style.left)).toBeCloseTo(row.left, 0);
      expect(parseFloat(ghost()!.style.top)).toBeCloseTo(row.top, 0);
      expect(getComputedStyle(kind("people")).opacity).toBe("0");
      await settled();
      expect(getComputedStyle(kind("people")).opacity).toBe("1");
    } finally {
      done();
    }
  });

  it("copies the row without the column's guide, as wide as the map, held where it was grabbed", async () => {
    await commands.reducedMotion(true);
    const { host, grip, done } = mount(BOTH);
    try {
      const live = grip("people").getBoundingClientRect();
      const drag = await press(grip("people"));
      await drag.move(drag.x0 + 30, drag.y0 + 20);
      const copy = ghost()!;
      expect(copy.querySelector(".row-map-guide")).toBeNull();
      expect(copy.getBoundingClientRect().width).toBeCloseTo(
        host.querySelector(".row-map-wrap")!.getBoundingClientRect().width,
        0,
      );
      const held = copy.querySelector(".row-map-grip")!.getBoundingClientRect();
      expect(held.left - live.left).toBeCloseTo(30, 0);
      expect(held.top - live.top).toBeCloseTo(20, 0);
      await drag.up(drag.x0 + 30, drag.y0 + 20);
    } finally {
      done();
    }
  });

  it("is held flat with reduced motion, and gone the moment it is let go", async () => {
    await commands.reducedMotion(true);
    const { kind, grip, latest, done } = mount(BOTH);
    try {
      const below = kind("addresses").getBoundingClientRect();
      const drag = await press(grip("people"));
      await drag.move(below.left + 40, below.bottom - 2);
      expect(ghost()!.querySelector(".row-map-kind")).not.toBeNull();
      expect(getComputedStyle(card()).transform).toBe("none");
      await drag.up(below.left + 40, below.bottom - 2);
      expect(ghost()).toBeNull();
      expect(latest.state.rows.businesses.list).toEqual([
        "addresses",
        "people",
      ]);
    } finally {
      done();
    }
  });

  it("lets a dropped line be seen again when another is lifted before it has settled", async () => {
    const { kind, grip, done } = mount(BOTH);
    try {
      const below = kind("addresses").getBoundingClientRect();
      let drag = await press(grip("people"));
      await drag.move(below.left + 40, below.bottom - 2);
      await drag.up(below.left + 40, below.bottom - 2);
      // Lifted again at once, while the first copy is still settling.
      drag = await press(grip("addresses"));
      await drag.move(drag.x0 + 20, drag.y0 + 6);
      expect(getComputedStyle(kind("people")).opacity).toBe("1");
      expect(kind("people").dataset.landing).toBeUndefined();
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      await settled();
    } finally {
      done();
    }
  });

  it("lets a dropped line be seen again, its copy gone, when a field is lifted before it has settled", async () => {
    const { host, kind, grip, done } = mount(BOTH);
    try {
      const below = kind("addresses").getBoundingClientRect();
      let drag = await press(grip("people"));
      await drag.move(below.left + 40, below.bottom - 2);
      await drag.up(below.left + 40, below.bottom - 2);
      // A field lifted at once, while the line's copy is still settling.
      drag = await press(host.querySelector<HTMLElement>(".row-map-chip")!);
      await drag.move(drag.x0 + 20, drag.y0 + 6);
      expect(document.querySelector(".row-map-ghost")).not.toBeNull();
      expect(ghost()).toBeNull();
      expect(getComputedStyle(kind("people")).opacity).toBe("1");
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      await settled();
    } finally {
      done();
    }
  });

  it("is held by its grip, showing what was in sight, when the line was scrolled sideways", async () => {
    const { host, kind, grip, done } = mount(BOTH, 280);
    try {
      const scroller = kind("people").closest<HTMLElement>(".row-map-scroll")!;
      const overflow = scroller.scrollWidth - scroller.clientWidth;
      expect(overflow).toBeGreaterThan(20);
      scroller.scrollLeft = overflow;
      await frame();
      const live = grip("people").getBoundingClientRect();
      const liveFace = kind("people")
        .querySelector(".row-map-face")!
        .getBoundingClientRect();
      const drag = await press(grip("people"));
      await drag.move(drag.x0 + 20, drag.y0 + 10);
      const copy = ghost()!;
      // Its grip under the pointer, as it was under the press.
      const held = copy.querySelector(".row-map-grip")!.getBoundingClientRect();
      expect(Math.abs(held.left - (live.left + 20))).toBeLessThanOrEqual(2);
      expect(Math.abs(held.top - (live.top + 10))).toBeLessThanOrEqual(2);
      // The same part of the line in sight: its first place as far from the
      // grip as on the live line.
      const face = copy.querySelector(".row-map-face")!.getBoundingClientRect();
      expect(
        Math.abs(face.left - held.left - (liveFace.left - live.left)),
      ).toBeLessThanOrEqual(2);
      expect(host.scrollWidth).toBeLessThanOrEqual(host.clientWidth + 1);
      await drag.up(drag.x0 + 20, drag.y0 + 10);
    } finally {
      done();
    }
  });

  for (const width of [320, 280]) {
    it(`is laid out as the line is, each place and the Enabled cell where they are on it, at ${width}px`, async () => {
      await commands.reducedMotion(true);
      const { kind, grip, done } = mount(BOTH, width);
      try {
        const live = fromGrip(kind("people"));
        const drag = await press(grip("people"));
        await drag.move(drag.x0 + 20, drag.y0 + 10);
        expect(fromGrip(ghost()!.querySelector(".row-map-kind")!)).toEqual(
          live,
        );
        await drag.up(drag.x0 + 20, drag.y0 + 10);
      } finally {
        done();
      }
    });
  }

  it("is never copied when Alt and an arrow move it", async () => {
    const { grip, latest, done } = mount(BOTH);
    try {
      grip("people").focus();
      grip("people").dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ArrowDown",
          altKey: true,
          bubbles: true,
        }),
      );
      await frame();
      expect(ghost()).toBeNull();
      expect(latest.state.rows.businesses.list).toEqual([
        "addresses",
        "people",
      ]);
    } finally {
      done();
    }
  });
});
