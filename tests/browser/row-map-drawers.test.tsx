import type { Route } from "@baselayer-sdk/autocomplete";
import { useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { commands, userEvent } from "vitest/browser";

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

  it("tints an enabled line's box, greys a disabled one, and a hidden one more", () => {
    const { kind, done } = mount();
    try {
      const lines = (relation: string) =>
        getComputedStyle(kind(relation).querySelector(".row-map-kind-lines")!);
      expect(lines("businesses").backgroundColor).toBe(
        rgb(DEFAULT_STYLE.vars["--bl-ac-highlight-bg"]!),
      );
      expect(lines("businesses").filter).toBe("none");
      expect(lines("businesses").opacity).toBe("1");
      // The person is shown, and disabled by default.
      expect(lines("head").filter).toBe("saturate(0)");
      expect(lines("head").opacity).toBe("0.6");
      expect(lines("addresses").filter).toBe("saturate(0)");
      expect(Number(lines("addresses").opacity)).toBeLessThan(0.6);
      // The controls are never greyed.
      for (const relation of ["head", "addresses"]) {
        for (const control of [".row-map-check-cell", ".row-map-grip"]) {
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
