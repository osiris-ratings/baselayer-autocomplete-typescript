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

/** A person's row with their addresses listed: a disabled line under it. */
const LISTED = withListed(DEFAULT_STYLE, "people", "addresses", true);

function mount(initial: StyleState = LISTED, route: Route = "people") {
  const host = document.createElement("div");
  host.style.width = "560px";
  document.body.append(host);
  const root = createRoot(host);
  flushSync(() => root.render(<Kept initial={initial} route={route} />));
  const kind = (relation: string) =>
    host.querySelector<HTMLElement>(
      `.row-map-kind[data-relation="${relation}"]`,
    )!;
  const toggle = (relation: string) =>
    kind(relation).querySelector<HTMLButtonElement>(".row-map-toggle")!;
  return {
    kind,
    toggle,
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

describe("a line's Enabled toggle in the row map", () => {
  it("is reached and pressed from the keyboard, and says what it is", async () => {
    const { toggle, done } = mount();
    try {
      const head = toggle("head");
      expect(head.getAttribute("aria-label")).toBe("Enable the person");
      expect(head.getAttribute("aria-pressed")).toBe("false");
      expect(head.textContent).toBe("Disabled");

      head.focus();
      await userEvent.keyboard("{Enter}");
      expect(toggle("head").getAttribute("aria-pressed")).toBe("true");
      expect(toggle("head").textContent).toBe("Enabled");
      expect(document.activeElement).toBe(toggle("head"));

      await userEvent.keyboard(" ");
      expect(toggle("head").getAttribute("aria-pressed")).toBe("false");
      expect(toggle("head").textContent).toBe("Disabled");

      // The next line's toggle is a tab stop on, after the head's places.
      for (
        let stops = 0;
        stops < 20 && document.activeElement !== toggle("businesses");
        stops++
      ) {
        await userEvent.tab();
      }
      expect(document.activeElement).toBe(toggle("businesses"));
      await userEvent.keyboard("{Enter}");
      expect(toggle("businesses").getAttribute("aria-pressed")).toBe("false");
    } finally {
      done();
    }
  });

  it("is as wide enabled as disabled, so the lines start in one column", () => {
    const { toggle, done } = mount();
    try {
      expect(toggle("businesses").getBoundingClientRect().width).toBe(
        toggle("addresses").getBoundingClientRect().width,
      );
    } finally {
      done();
    }
  });

  it("tints an enabled line as the menu tints one, and fades a disabled one as the menu does", async () => {
    const { kind, toggle, done } = mount();
    try {
      const highlight = rgb(DEFAULT_STYLE.vars["--bl-ac-highlight-bg"]!);
      const lines = (relation: string) =>
        kind(relation).querySelector<HTMLElement>(".row-map-kind-lines")!;
      const face = (relation: string) =>
        kind(relation).querySelector<HTMLElement>(
          ".row-map-face, .row-map-name",
        )!;

      expect(getComputedStyle(kind("businesses")).backgroundColor).toBe(
        highlight,
      );
      expect(getComputedStyle(lines("businesses")).filter).toBe("none");
      expect(getComputedStyle(face("businesses")).opacity).toBe("1");

      expect(getComputedStyle(kind("addresses")).backgroundColor).toBe(
        "rgba(0, 0, 0, 0)",
      );
      expect(getComputedStyle(lines("addresses")).filter).toBe("saturate(0.4)");
      expect(getComputedStyle(face("addresses")).opacity).toBe("0.91");

      // The menu never fades a row's head, enabled or not.
      expect(getComputedStyle(lines("head")).filter).toBe("none");

      await userEvent.click(toggle("addresses"));
      expect(getComputedStyle(kind("addresses")).backgroundColor).toBe(
        highlight,
      );
      expect(getComputedStyle(lines("addresses")).filter).toBe("none");
    } finally {
      done();
    }
  });

  it("fades a disabled line by the look's own amount", () => {
    const { kind, done } = mount({
      ...LISTED,
      look: { ...LISTED.look, disabledDim: 0.3 },
    });
    try {
      const addresses = kind("addresses");
      expect(
        getComputedStyle(addresses.querySelector(".row-map-kind-lines")!)
          .filter,
      ).toBe("saturate(0.7)");
      expect(
        getComputedStyle(addresses.querySelector(".row-map-name")!).opacity,
      ).toBe("0.955");
    } finally {
      done();
    }
  });

  it("draws a disabled line as any other under forced colours", async () => {
    await commands.forcedColors(true);
    const { kind, done } = mount();
    try {
      const addresses = kind("addresses");
      expect(
        getComputedStyle(addresses.querySelector(".row-map-kind-lines")!)
          .filter,
      ).toBe("none");
      expect(
        getComputedStyle(addresses.querySelector(".row-map-name")!).opacity,
      ).toBe("1");
    } finally {
      done();
      await commands.forcedColors(false);
    }
  });
});
