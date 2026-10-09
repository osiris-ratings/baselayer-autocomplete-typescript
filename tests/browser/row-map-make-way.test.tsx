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

/** The map with its state kept, the latest state read back. */
function mount(initial: StyleState) {
  const host = document.createElement("div");
  host.className = "demo";
  host.style.width = "560px";
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
  const drawer = (name: "shown" | "hidden") =>
    host.querySelector<HTMLElement>(`.row-map-drawer[data-drawer="${name}"]`)!;
  return {
    host,
    kind,
    grip,
    drawer,
    latest,
    done() {
      root.unmount();
      host.remove();
    },
  };
}

const frame = () =>
  new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));

/** A pointer pressed on `from` and carried past the slop; the caller moves it. */
async function press(from: HTMLElement) {
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
      button: 0,
      buttons,
      clientX,
      clientY,
    });
  const x = start.left + start.width / 2 + 12;
  const y0 = start.top + start.height / 2;
  from.dispatchEvent(at("pointerdown", x - 12, y0, 1));
  await frame();
  window.dispatchEvent(at("pointermove", x, y0, 1));
  await frame();
  return {
    x,
    y0,
    async to(y: number, atX = x) {
      window.dispatchEvent(at("pointermove", atX, y, 1));
      await frame();
    },
    async up(y: number, atX = x) {
      window.dispatchEvent(at("pointerup", atX, y, 0));
      await frame();
    },
  };
}

/** Where every line but the carried one is drawn now: its slide, read off. */
const made = (host: HTMLElement, carried: string) =>
  [...host.querySelectorAll<HTMLElement>(".row-map-kind")]
    .filter(row => !["head", carried].includes(row.dataset.relation!))
    .map(row => `${row.dataset.relation}:${row.style.transform}`)
    .join(" ");

/** Both of a business's lines shown: its officers, then its addresses. */
const BOTH = withListed(
  withListed(DEFAULT_STYLE, "businesses", "people", true),
  "businesses",
  "addresses",
  true,
);
/** Its officers shown, its addresses hidden. */
const ONE = withListed(DEFAULT_STYLE, "businesses", "people", true);

describe("the lines making way for a carried one", () => {
  it("change order once each way as the pointer passes a boundary slowly, there and back", async () => {
    const { host, kind, grip, done } = mount(BOTH);
    try {
      const below = kind("addresses").getBoundingClientRect();
      const end = below.bottom - 4;
      const drag = await press(grip("people"));
      const seen: string[] = [made(host, "people")];
      for (let y = drag.y0; y <= end; y += 2) {
        await drag.to(y);
        if (made(host, "people") !== seen.at(-1))
          seen.push(made(host, "people"));
      }
      for (let y = end; y >= drag.y0; y -= 2) {
        await drag.to(y);
        if (made(host, "people") !== seen.at(-1))
          seen.push(made(host, "people"));
      }
      expect(seen, seen.join("\n")).toHaveLength(3);
      expect(seen[2]).toBe(seen[0]);
      await drag.up(drag.y0);
    } finally {
      done();
    }
  });

  it("hold their order while the pointer rests, or trembles, at a boundary", async () => {
    const { host, kind, grip, done } = mount(BOTH);
    try {
      const below = kind("addresses").getBoundingClientRect();
      const boundary = below.top + below.height / 2;
      const drag = await press(grip("people"));
      await drag.to(boundary);
      const first = made(host, "people");
      // About a second of animation frames, still.
      for (let count = 0; count < 60; count++) await frame();
      expect(made(host, "people")).toBe(first);
      // Then a hand's tremor: two pixels either side.
      for (let count = 0; count < 60; count++) {
        await drag.to(boundary + (count % 2 === 0 ? 2 : -2));
        expect(made(host, "people"), `tremor ${count}`).toBe(first);
      }
      await drag.up(boundary);
    } finally {
      done();
    }
  });

  it("land where the pointer is after a fast sweep, in one move each way", async () => {
    const { kind, grip, latest, done } = mount(BOTH);
    try {
      const below = kind("addresses").getBoundingClientRect();
      let drag = await press(grip("people"));
      await drag.to(below.bottom - 2);
      await drag.up(below.bottom - 2);
      expect(latest.state.rows.businesses.list).toEqual([
        "addresses",
        "people",
      ]);
      await new Promise(resolve => setTimeout(resolve, 600));

      const head = kind("head").getBoundingClientRect();
      drag = await press(grip("people"));
      await drag.to(head.top + 4);
      await drag.up(head.top + 4);
      expect(latest.state.rows.businesses.list).toEqual([
        "people",
        "addresses",
      ]);
    } finally {
      done();
    }
  });
});

/** The blank line a drop would fill: which drawer holds it, and where. */
function slot(host: HTMLElement) {
  const holding = [
    ...host.querySelectorAll<HTMLElement>(".row-map-drawer[data-slot]"),
  ];
  return holding.map(each => `${each.dataset.drawer}@${each.dataset.slot}`);
}

/**
 * The lines of a drawer as drawn, top to bottom, with "_" for the blank one:
 * each line's place in the drawer from its laid-out top and its slide.
 */
function drawn(host: HTMLElement, name: string, carried: string): string[] {
  const rows = [
    ...host.querySelectorAll<HTMLElement>(
      `.row-map-drawer[data-drawer="${name}"] .row-map-kind:not([data-relation="head"])`,
    ),
  ];
  if (rows.length === 0) return [];
  const all = [...host.querySelectorAll<HTMLElement>(".row-map-kind")];
  const lifted = all.find(row => row.dataset.relation === carried)!;
  const step =
    lifted.offsetHeight +
    parseFloat(getComputedStyle(rows[0]!.parentElement!).rowGap || "0");
  const top = Math.min(...rows.map(row => row.offsetTop));
  const at = (row: HTMLElement) => {
    const slide = /translateY\((-?[\d.]+)px\)/.exec(row.style.transform);
    return Math.round(
      (row.offsetTop + (slide ? Number(slide[1]) : 0) - top) / step,
    );
  };
  const places: string[] = [];
  for (const row of rows) {
    if (row === lifted) continue;
    places[at(row)] = row.dataset.relation!;
  }
  return Array.from(places, place => place ?? "_");
}

describe("the blank line a carried line would drop into", () => {
  it("opens at the line's own place the moment it is lifted, and the line is not drawn there", async () => {
    const { host, kind, grip, done } = mount(BOTH);
    try {
      const drag = await press(grip("people"));
      expect(slot(host)).toEqual(["shown@0"]);
      expect(getComputedStyle(kind("people")).opacity).toBe("0");
      expect(kind("addresses").style.transform).toBe("");
      await drag.up(drag.y0);
    } finally {
      done();
    }
  });

  it("moves within its drawer as the pointer does, the others making way, and the drop fills it", async () => {
    const { host, kind, grip, latest, done } = mount(BOTH);
    try {
      const below = kind("addresses").getBoundingClientRect();
      const drag = await press(grip("people"));
      await drag.to(below.bottom - 4);
      expect(slot(host)).toEqual(["shown@1"]);
      expect(drawn(host, "shown", "people")).toEqual(["addresses"]);
      await drag.up(below.bottom - 4);
      expect(latest.state.rows.businesses.list).toEqual([
        "addresses",
        "people",
      ]);
      expect(slot(host)).toEqual([]);
    } finally {
      done();
    }
  });

  it("moves to the other drawer with the pointer, and back, closing behind it", async () => {
    const { host, kind, grip, drawer, latest, done } = mount(ONE);
    try {
      // From Hidden: open there first, at its own place.
      const drag = await press(grip("addresses"));
      expect(slot(host)).toEqual(["hidden@0"]);

      const people = kind("people").getBoundingClientRect();
      await drag.to(people.bottom - 4);
      expect(slot(host)).toEqual(["shown@1"]);
      expect(drawer("hidden").querySelector(".row-map-scroll")!).toHaveProperty(
        "style.marginBottom",
        expect.stringMatching(/^-\d/),
      );

      await drag.to(people.top + 4);
      expect(slot(host)).toEqual(["shown@0"]);

      const hidden = drawer("hidden").getBoundingClientRect();
      await drag.to(hidden.top + hidden.height / 2);
      expect(slot(host)).toEqual(["hidden@0"]);

      await drag.to(people.top + 4);
      expect(slot(host)).toEqual(["shown@0"]);
      await drag.up(people.top + 4);
      expect(latest.state.rows.businesses.list).toEqual([
        "addresses",
        "people",
      ]);
      expect(slot(host)).toEqual([]);
    } finally {
      done();
    }
  });

  it("opens in Hidden where the line would go there, the Shown line closing behind it", async () => {
    const { host, grip, drawer, latest, done } = mount(BOTH);
    try {
      const drag = await press(grip("addresses"));
      const hidden = drawer("hidden").getBoundingClientRect();
      await drag.to(hidden.top + hidden.height / 2);
      expect(slot(host)).toEqual(["hidden@0"]);
      await drag.up(hidden.top + hidden.height / 2);
      expect(latest.state.rows.businesses.list).toEqual(["people"]);
      expect(slot(host)).toEqual([]);
    } finally {
      done();
    }
  });

  it("is gone after a drop outside the map and after Escape, nothing slid or resized", async () => {
    const { host, grip, latest, done } = mount(BOTH);
    try {
      // Well clear of the map: no drawer, no place.
      const outside = { x: host.getBoundingClientRect().right + 200, y: 600 };
      expect(
        document
          .elementFromPoint(outside.x, outside.y)
          ?.closest("[data-drop]") ?? null,
      ).toBeNull();
      let drag = await press(grip("people"));
      await drag.to(outside.y, outside.x);
      // Over nothing it waits where the line came from, where a cancel puts it.
      expect(slot(host)).toEqual(["shown@0"]);
      await drag.up(outside.y, outside.x);
      expect(slot(host)).toEqual([]);

      drag = await press(grip("people"));
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      await frame();
      expect(slot(host)).toEqual([]);
      for (const row of host.querySelectorAll<HTMLElement>(".row-map-kind")) {
        expect(row.style.transform).toBe("");
      }
      for (const scroller of host.querySelectorAll<HTMLElement>(
        ".row-map-scroll",
      )) {
        expect(scroller.style.paddingBottom).toBe("");
        expect(scroller.style.marginBottom).toBe("");
      }
      expect(latest.state.rows.businesses.list).toEqual([
        "people",
        "addresses",
      ]);
    } finally {
      done();
    }
  });

  for (const exit of ["Escape", "drop"] as const) {
    it(`leaves nothing slid or resized after a carry over the other drawer ends in ${exit === "drop" ? "a drop" : "Escape"}`, async () => {
      const { host, grip, done } = mount(BOTH);
      try {
        const hidden = host
          .querySelector<HTMLElement>('[data-drawer="hidden"]')!
          .getBoundingClientRect();
        const over = hidden.top + hidden.height / 2;
        const drag = await press(grip("people"));
        await drag.to(over, hidden.left + 60);
        const [shown, held] = [
          ...host.querySelectorAll<HTMLElement>(".row-map-scroll"),
        ];
        expect(shown!.style.marginBottom).toMatch(/^-\d/);
        expect(held!.style.paddingBottom).toMatch(/^\d/);
        if (exit === "Escape") {
          window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
          await frame();
        } else {
          await drag.up(over, hidden.left + 60);
        }
        for (const scroller of host.querySelectorAll<HTMLElement>(
          ".row-map-scroll",
        )) {
          expect(scroller.style.marginBottom).toBe("");
          expect(scroller.style.paddingBottom).toBe("");
        }
        for (const row of host.querySelectorAll<HTMLElement>(".row-map-kind")) {
          expect(row.style.transform).toBe("");
        }
      } finally {
        done();
      }
    });
  }

  it("opens in Hidden after the hidden lines the line follows in the row", async () => {
    // Its addresses shown, its officers, which come first in the row, hidden.
    const { host, grip, done } = mount(
      withListed(
        withListed(DEFAULT_STYLE, "businesses", "addresses", true),
        "businesses",
        "people",
        false,
      ),
    );
    try {
      const hidden = host
        .querySelector<HTMLElement>('[data-drawer="hidden"]')!
        .getBoundingClientRect();
      const drag = await press(grip("addresses"));
      await drag.to(hidden.top + hidden.height / 2, hidden.left + 60);
      expect(slot(host)).toEqual(["hidden@1"]);
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      await frame();
    } finally {
      done();
    }
  });

  it("stays past a boundary once over it, a tremble there flipping nothing back", async () => {
    const { host, kind, grip, done } = mount(BOTH);
    try {
      const below = kind("addresses").getBoundingClientRect();
      const middle = below.top + below.height / 2;
      const drag = await press(grip("people"));
      await drag.to(middle + 12);
      expect(slot(host)).toEqual(["shown@1"]);
      for (let count = 0; count < 20; count++) {
        await drag.to(middle + (count % 2 === 0 ? 2 : -2));
        expect(slot(host), `tremor ${count}`).toEqual(["shown@1"]);
      }
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      await frame();
    } finally {
      done();
    }
  });

  it("holds its slot while the leading edge is inside the band at either mark, and moves once it is past", async () => {
    const { host, kind, grip, done } = mount(BOTH);
    try {
      const people = kind("people").getBoundingClientRect();
      const addresses = kind("addresses").getBoundingClientRect();
      const half = people.height / 2;
      const below = addresses.top + addresses.height / 2;
      const above = people.top + people.height / 2;
      const drag = await press(grip("people"));
      await drag.to(below - half + 2);
      expect(slot(host)).toEqual(["shown@0"]);
      await drag.to(below - half + 6);
      expect(slot(host)).toEqual(["shown@1"]);
      await drag.to(above + half - 2);
      expect(slot(host)).toEqual(["shown@1"]);
      await drag.to(above + half - 6);
      expect(slot(host)).toEqual(["shown@0"]);
      await drag.up(above + half - 6);
    } finally {
      done();
    }
  });

  it("is read afresh, where the row's middle falls, when the pointer comes back over Shown from Hidden", async () => {
    const { host, kind, grip, done } = mount(BOTH);
    try {
      const first = kind("people").getBoundingClientRect();
      const below = kind("addresses").getBoundingClientRect();
      const hidden = host
        .querySelector<HTMLElement>('[data-drawer="hidden"]')!
        .getBoundingClientRect();
      const drag = await press(grip("people"));
      await drag.to(below.top + below.height / 2 + 12);
      expect(slot(host)).toEqual(["shown@1"]);
      await drag.to(hidden.top + hidden.height / 2, hidden.left + 60);
      // Back with the row's middle just under the line drawn first: read
      // afresh it goes after that line, where a slot kept from before would
      // have gone back above it.
      await drag.to(first.top + first.height / 2 + 6);
      expect(slot(host)).toEqual(["shown@1"]);
      await drag.to(hidden.top + hidden.height / 2, hidden.left + 60);
      await drag.to(first.top + first.height / 2 - 10);
      expect(slot(host)).toEqual(["shown@0"]);
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      await frame();
    } finally {
      done();
    }
  });

  it("opens under a Hidden lines title over a Hidden that holds only fields", async () => {
    const { host, grip, done } = mount(BOTH);
    try {
      const titles = () =>
        [
          ...host.querySelectorAll(
            '[data-drawer="hidden"] .row-map-drawer-label',
          ),
        ].map(title => title.textContent);
      expect(titles()).toEqual(["Hidden fields"]);
      const hidden = host
        .querySelector<HTMLElement>('[data-drawer="hidden"]')!
        .getBoundingClientRect();
      const drag = await press(grip("people"));
      await drag.to(hidden.top + hidden.height / 2, hidden.left + 60);
      expect(titles()).toEqual(["Hidden lines", "Hidden fields"]);
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      await frame();
      expect(titles()).toEqual(["Hidden fields"]);
    } finally {
      done();
    }
  });
});

/** A line's grip pressed at a height through its row, carried past the slop. */
async function grabAt(row: HTMLElement, through: number) {
  const grip = row.querySelector<HTMLElement>("button.row-map-grip")!;
  const box = row.getBoundingClientRect();
  const x = grip.getBoundingClientRect().left + 6;
  const y0 = box.top + box.height * through;
  const at = (
    type: string,
    clientX: number,
    clientY: number,
    buttons: number,
  ) =>
    new PointerEvent(type, {
      bubbles: true,
      pointerId: 7,
      button: 0,
      buttons,
      clientX,
      clientY,
    });
  grip.dispatchEvent(at("pointerdown", x, y0, 1));
  await frame();
  window.dispatchEvent(at("pointermove", x + 12, y0, 1));
  await frame();
  return {
    y0,
    async by(dy: number) {
      window.dispatchEvent(at("pointermove", x + 12, y0 + dy, 1));
      await frame();
    },
    async up(dy: number) {
      window.dispatchEvent(at("pointerup", x + 12, y0 + dy, 0));
      await frame();
    },
  };
}

describe("a carried line passing its neighbour", () => {
  // Where it is held through its row does not matter: its leading edge does.
  for (const [where, through] of [
    ["top", 0.1],
    ["middle", 0.5],
    ["bottom", 0.9],
  ] as const) {
    it(`swaps once its bottom edge is a few pixels past the next line's middle, held at its ${where}`, async () => {
      const { host, kind, latest, done } = mount(BOTH);
      try {
        const carried = kind("people").getBoundingClientRect();
        const next = kind("addresses").getBoundingClientRect();
        // From its bottom edge to the next line's middle: under one row.
        const reach = next.top + next.height / 2 - carried.bottom;
        expect(reach).toBeLessThan(carried.height);
        const drag = await grabAt(kind("people"), through);
        await drag.by(reach - 2);
        expect(slot(host)).toEqual(["shown@0"]);
        await drag.by(reach + 6);
        expect(slot(host)).toEqual(["shown@1"]);
        await drag.up(reach + 6);
        expect(latest.state.rows.businesses.list).toEqual([
          "addresses",
          "people",
        ]);
        await new Promise(resolve => setTimeout(resolve, 600));
      } finally {
        done();
      }
    });

    it(`swaps once its top edge is a few pixels past the line above's middle, held at its ${where}`, async () => {
      const { host, kind, latest, done } = mount(BOTH);
      try {
        const above = kind("people").getBoundingClientRect();
        const carried = kind("addresses").getBoundingClientRect();
        const reach = carried.top - (above.top + above.height / 2);
        expect(reach).toBeLessThan(carried.height);
        const drag = await grabAt(kind("addresses"), through);
        await drag.by(-(reach - 2));
        expect(slot(host)).toEqual(["shown@1"]);
        await drag.by(-(reach + 6));
        expect(slot(host)).toEqual(["shown@0"]);
        await drag.up(-(reach + 6));
        expect(latest.state.rows.businesses.list).toEqual([
          "addresses",
          "people",
        ]);
        await new Promise(resolve => setTimeout(resolve, 600));
      } finally {
        done();
      }
    });
  }
});
