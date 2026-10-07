import type { Route } from "@baselayer-sdk/autocomplete";
import { useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { commands, userEvent } from "vitest/browser";

import { RowMap } from "../../site/demo/RowMap";
import {
  DEFAULT_STYLE,
  lineKinds,
  withLineState,
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

function mount(
  initial: StyleState = DEFAULT_STYLE,
  route: Route = "people",
  width = 560,
) {
  const host = document.createElement("div");
  host.style.width = `${width}px`;
  document.body.append(host);
  const root = createRoot(host);
  flushSync(() => root.render(<Kept initial={initial} route={route} />));
  const kind = (relation: string) =>
    host.querySelector<HTMLElement>(
      `.row-map-kind[data-relation="${relation}"]`,
    )!;
  const checked = (relation: string) =>
    kind(relation).querySelector<HTMLButtonElement>(
      '[role="radio"][aria-checked="true"]',
    )!;
  return {
    host,
    kind,
    checked,
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

describe("a line's switch in the row map", () => {
  it("is one tab stop, moved by the arrow keys, its choice the focus", async () => {
    const { checked, done } = mount();
    try {
      // Off the page's start, the first stop the keyboard reaches is the
      // head's chosen one.
      document.body.focus();
      await userEvent.tab();
      expect(document.activeElement).toBe(checked("head"));
      expect(checked("head").getAttribute("aria-label")).toBe("Visible");

      await userEvent.keyboard("{ArrowRight}");
      expect(checked("head").getAttribute("aria-label")).toBe("Enabled");
      expect(document.activeElement).toBe(checked("head"));
      // Round again, past the Off a head cannot take.
      await userEvent.keyboard("{ArrowRight}");
      expect(checked("head").getAttribute("aria-label")).toBe("Visible");

      // The next tab stop is not the head's next radio but past the switch.
      await userEvent.tab();
      expect(
        (document.activeElement as Element).closest('[role="radiogroup"]'),
      ).toBeNull();
    } finally {
      done();
    }
  });

  it("rings the stop the keyboard is on", async () => {
    const { checked, done } = mount();
    try {
      document.body.focus();
      await userEvent.tab();
      expect(getComputedStyle(checked("head")).outlineStyle).toBe("solid");
    } finally {
      done();
    }
  });

  it("is no wider than its gutter, on a phone too", () => {
    for (const width of [560, 400]) {
      const { host, done } = mount(DEFAULT_STYLE, "people", width);
      try {
        for (const group of host.querySelectorAll<HTMLElement>(
          '[role="radiogroup"]',
        )) {
          expect(group.getBoundingClientRect().width).toBeLessThanOrEqual(46);
        }
      } finally {
        done();
      }
    }
  });

  it("tints an enabled line, and greys any other, its switch excepted", () => {
    const [, , addresses] = lineKinds("people");
    const { kind, done } = mount(
      withLineState(DEFAULT_STYLE, "people", addresses!, "off"),
    );
    try {
      const lines = (relation: string) =>
        getComputedStyle(
          kind(relation).querySelector<HTMLElement>(".row-map-kind-lines")!,
        );
      const highlight = rgb(DEFAULT_STYLE.vars["--bl-ac-highlight-bg"]!);

      // Enabled: the businesses under a person.
      expect(getComputedStyle(kind("businesses")).backgroundColor).toBe(
        highlight,
      );
      expect(lines("businesses").filter).toBe("none");
      expect(lines("businesses").opacity).toBe("1");
      // Visible: the person, the head included.
      expect(lines("head").filter).toBe("saturate(0)");
      expect(lines("head").opacity).toBe("0.6");
      // Off: greyer still.
      expect(lines("addresses").filter).toBe("saturate(0)");
      expect(Number(lines("addresses").opacity)).toBeLessThan(0.6);
      // The switch is never greyed.
      for (const relation of ["head", "addresses"]) {
        const control = kind(relation).querySelector<HTMLElement>(
          ".row-map-kind-controls",
        )!;
        expect(getComputedStyle(control).filter).toBe("none");
        expect(getComputedStyle(control).opacity).toBe("1");
      }
    } finally {
      done();
    }
  });

  it("greys nothing under forced colours", async () => {
    await commands.forcedColors(true);
    const { kind, done } = mount();
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
