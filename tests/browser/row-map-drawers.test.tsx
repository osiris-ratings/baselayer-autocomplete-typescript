import type { Route } from "@baselayer-sdk/autocomplete";
import { useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { commands, userEvent } from "vitest/browser";

import { mapInks } from "../../site/demo/map-ink";
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
    /** Emulates `forced-colors: active`, or lifts it. */
    forcedColors: (active: boolean) => Promise<void>;
  }
}

/** The map with its state kept, as the panel keeps it. */
function Kept({ initial, route }: { initial: StyleState; route: Route }) {
  const [state, setState] = useState(initial);
  return <RowMap state={state} onChange={setState} route={route} />;
}

function mount(initial: StyleState = DEFAULT_STYLE, route: Route = "people") {
  const host = document.createElement("div");
  host.style.width = "560px";
  document.body.append(host);
  const root = createRoot(host);
  flushSync(() => root.render(<Kept initial={initial} route={route} />));
  const kind = (relation: string) =>
    host.querySelector<HTMLElement>(
      `.row-map-kind[data-relation="${relation}"]`,
    )!;
  return {
    host,
    kind,
    done() {
      root.unmount();
      host.remove();
    },
  };
}

/** `#f1f6fd` as the page computes it. */
function rgb(hex: string): string {
  const [r, g, b] = [1, 3, 5].map(at => parseInt(hex.slice(at, at + 2), 16));
  return `rgb(${r}, ${g}, ${b})`;
}

describe("the row map's drawers", () => {
  it("moves a line from the keyboard by its grip, which keeps the focus", async () => {
    const { host, done } = mount();
    try {
      const grip = host.querySelector<HTMLButtonElement>(
        'button.row-map-grip[data-relation="businesses"]',
      )!;
      grip.focus();
      await userEvent.keyboard("{Enter}");
      const moved = host.querySelector<HTMLElement>(
        '[data-drawer="hidden"] button.row-map-grip[data-relation="businesses"]',
      )!;
      expect(moved.getAttribute("aria-label")).toBe("Show businesses");
      expect(document.activeElement).toBe(moved);

      await userEvent.keyboard(" ");
      expect(
        host.querySelector(
          '[data-drawer="shown"] [data-relation="businesses"]',
        ),
      ).not.toBeNull();
    } finally {
      done();
    }
  });

  it("disables a line from the keyboard by its checkbox", async () => {
    const { kind, done } = mount();
    try {
      const check =
        kind("businesses").querySelector<HTMLInputElement>(".row-map-check")!;
      check.focus();
      await userEvent.keyboard(" ");
      expect(
        kind("businesses").querySelector<HTMLInputElement>(".row-map-check")!
          .checked,
      ).toBe(true);
      expect(kind("businesses").dataset.state).toBe("disabled");
    } finally {
      done();
    }
  });

  it("keeps the grip and the checkbox outside the line's box, the checkbox under its heading", () => {
    const { host, kind, done } = mount();
    try {
      const box = kind("businesses")
        .querySelector(".row-map-kind-lines")!
        .getBoundingClientRect();
      const grip = kind("businesses")
        .querySelector(".row-map-grip")!
        .getBoundingClientRect();
      const check = kind("businesses")
        .querySelector(".row-map-check")!
        .getBoundingClientRect();
      expect(grip.right).toBeLessThanOrEqual(box.left);
      expect(check.left).toBeGreaterThanOrEqual(box.right);
      expect(
        getComputedStyle(kind("businesses").querySelector(".row-map-check")!)
          .accentColor,
      ).toBe(rgb("#384ce3"));

      const label = host.querySelector(".row-map-check-head")!;
      expect(label.textContent).toBe("Disabled");
      const heading = label.getBoundingClientRect();
      expect(heading.bottom).toBeLessThanOrEqual(check.top);
      expect(heading.left).toBeLessThanOrEqual(check.left);
      expect(heading.right).toBeGreaterThanOrEqual(check.right);
    } finally {
      done();
    }
  });

  it("draws an enabled line plainly, dims a disabled one whole, head too, and a hidden one more", () => {
    const { kind, done } = mount();
    try {
      const lines = (relation: string) =>
        getComputedStyle(kind(relation).querySelector(".row-map-kind-lines")!);
      const inks = mapInks(DEFAULT_STYLE);
      for (const relation of ["head", "businesses", "addresses"]) {
        // No tint on any line, and every line in the one ink.
        expect(lines(relation).backgroundColor).toBe("rgba(0, 0, 0, 0)");
        expect(lines(relation).filter).toBe("none");
        expect(lines(relation).color).toBe(rgb(inks.ink));
      }
      expect(lines("businesses").opacity).toBe("1");
      // The person is shown, and disabled by default.
      expect(lines("head").opacity).toBe("0.58");
      expect(Number(lines("addresses").opacity)).toBeLessThan(0.58);
      // The controls are never greyed.
      for (const [relation, controls] of [
        ["head", [".row-map-check-cell", ".row-map-grip-cell"]],
        ["addresses", [".row-map-grip-cell"]],
      ] as const) {
        for (const control of controls) {
          const style = getComputedStyle(
            kind(relation).querySelector(control)!,
          );
          expect(style.filter).toBe("none");
          expect(style.opacity).toBe("1");
        }
      }
    } finally {
      done();
    }
  });

  it("greys nothing under forced colours", async () => {
    await commands.forcedColors(true);
    const { kind, done } = mount(
      withListed(DEFAULT_STYLE, "people", "addresses", true),
    );
    try {
      expect(
        getComputedStyle(kind("head").querySelector(".row-map-kind-lines")!)
          .filter,
      ).toBe("none");
    } finally {
      done();
      await commands.forcedColors(false);
    }
  });
});

describe("the Hidden drawer's ground", () => {
  it("is banded faintly, in bands as wide as the gaps between them, clear of its border, and the Shown drawer is not", () => {
    const { host, done } = mount();
    try {
      const card = (drawer: string) =>
        host.querySelector<HTMLElement>(`[data-drawer="${drawer}"] .row-map`)!;
      const stripes = getComputedStyle(card("hidden"), "::before");
      const image = stripes.backgroundImage;
      expect(image).toContain("repeating-linear-gradient");
      // Slanting down to the left, the other way to a 45° line.
      expect(image).toMatch(/-45deg|135deg/);
      // A band and a gap of one width: colour from 0 to 6px, clear to 12px.
      const stops = [...image.matchAll(/(\d+(?:\.\d+)?)px/g)].map(match =>
        Number(match[1]),
      );
      expect(stops).toEqual([0, 6, 6, 12]);
      for (const side of ["top", "right", "bottom", "left"] as const) {
        expect(parseFloat(stripes[side])).toBeGreaterThanOrEqual(6);
        expect(parseFloat(stripes[side])).toBeLessThanOrEqual(8);
      }
      expect(stripes.pointerEvents).toBe("none");
      expect(getComputedStyle(card("shown"), "::before").content).toBe("none");
      // What the drawer holds lies over the stripes, not under them.
      const lines = host.querySelector<HTMLElement>(
        '[data-drawer="hidden"] .row-map-scroll-frame',
      )!;
      expect(Number(getComputedStyle(lines).zIndex)).toBeGreaterThan(
        Number(stripes.zIndex),
      );
    } finally {
      done();
    }
  });

  it("keeps every hidden line and field on a ground of its own, ringed, with no band in it", async () => {
    const row = DEFAULT_STYLE.rows.people;
    const { host, done } = mount({
      ...DEFAULT_STYLE,
      rows: {
        ...DEFAULT_STYLE.rows,
        people: {
          ...row,
          layout: { ...row.layout, businessTrailing: null },
        },
      },
    });
    try {
      const hidden = host.querySelector<HTMLElement>('[data-drawer="hidden"]')!;
      const grounds = [
        ...hidden.querySelectorAll<HTMLElement>(
          ".row-map-kind-ground, .row-map-chip, .row-map-drawer-label",
        ),
      ];
      expect(grounds.length).toBeGreaterThanOrEqual(3);
      for (const ground of grounds) {
        const style = getComputedStyle(ground);
        expect(style.backgroundColor, ground.className).toBe(
          rgb(DEFAULT_STYLE.look.backgroundColor),
        );
        expect(style.boxShadow, ground.className).toContain(
          rgb(DEFAULT_STYLE.look.backgroundColor),
        );
      }
      // Each hidden line's ground lies under the whole of its line's box.
      for (const kind of hidden.querySelectorAll<HTMLElement>(
        ".row-map-kind",
      )) {
        const under = kind
          .querySelector(".row-map-kind-ground")!
          .getBoundingClientRect();
        const box = kind
          .querySelector(".row-map-kind-lines")!
          .getBoundingClientRect();
        expect(under.left).toBeLessThanOrEqual(box.left + 0.5);
        expect(under.right).toBeGreaterThanOrEqual(box.right - 0.5);
        expect(under.top).toBeLessThanOrEqual(box.top + 0.5);
        expect(under.bottom).toBeGreaterThanOrEqual(box.bottom - 0.5);
      }
    } finally {
      done();
    }
  });
});
