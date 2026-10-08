import { useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
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

/** A pointer's press on `from`, moved to a point, and let go there. */
async function carry(
  from: HTMLElement,
  x: number,
  y: number,
  during?: () => void,
) {
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
  const x0 = start.left + start.width / 2;
  const y0 = start.top + start.height / 2;
  from.dispatchEvent(at("pointerdown", x0, y0, 1));
  await frame();
  window.dispatchEvent(at("pointermove", x0, y0 + 6, 1));
  await frame();
  window.dispatchEvent(at("pointermove", x, y, 1));
  await frame();
  during?.();
  window.dispatchEvent(at("pointerup", x, y, 0));
  await frame();
}

/** Both of a business's lines shown: its officers, then its addresses. */
const BOTH = withListed(
  withListed(DEFAULT_STYLE, "businesses", "people", true),
  "businesses",
  "addresses",
  true,
);

describe("lines reordered by their grips", () => {
  it("drops a shown line below the next, the others making way while it is carried", async () => {
    const { kind, grip, latest, done } = mount(BOTH);
    try {
      expect(latest.state.rows.businesses.list).toEqual([
        "people",
        "addresses",
      ]);
      const below = kind("addresses").getBoundingClientRect();
      let slid = "none";
      let toward = "";
      await carry(grip("people"), below.left + 40, below.bottom - 2, () => {
        slid = getComputedStyle(kind("addresses")).transform;
        toward = kind("addresses").style.transform;
      });
      // While carried, the line below slid UP to make way: by a line's
      // height, toward the place the carried line left.
      expect(slid).not.toBe("none");
      const by = /^translateY\((-?[\d.]+)px\)$/.exec(toward);
      expect(by, toward).not.toBeNull();
      expect(Number(by![1])).toBeLessThan(0);
      expect(latest.state.rows.businesses.list).toEqual([
        "addresses",
        "people",
      ]);
      // Let go, nothing is left slid.
      for (const relation of ["people", "addresses"]) {
        expect(kind(relation).style.transform).toBe("");
      }
    } finally {
      done();
    }
  });

  it("drops a hidden line where it is let go in Shown, above a line already there", async () => {
    const { kind, grip, latest, done } = mount(
      withListed(DEFAULT_STYLE, "businesses", "addresses", true),
    );
    try {
      const head = kind("head").getBoundingClientRect();
      const addresses = kind("addresses").getBoundingClientRect();
      await carry(
        grip("people"),
        addresses.left + 40,
        (head.bottom + addresses.top + addresses.height / 3) / 2 +
          addresses.height / 4,
      );
      expect(latest.state.rows.businesses.list).toEqual([
        "people",
        "addresses",
      ]);
    } finally {
      done();
    }
  });

  it("does not slide for a reader who asks for less motion", async () => {
    await commands.reducedMotion(true);
    const { kind, done } = mount(BOTH);
    try {
      expect(getComputedStyle(kind("people")).transitionDuration).toBe("0s");
    } finally {
      done();
      await commands.reducedMotion(false);
    }
  });

  it("slides at the pace a person can follow, and keeps the head first", () => {
    const { kind, done } = mount(BOTH);
    try {
      expect(getComputedStyle(kind("people")).transitionDuration).toBe("0.15s");
      expect(kind("head").querySelector("button.row-map-grip")).toBeNull();
    } finally {
      done();
    }
  });
});
