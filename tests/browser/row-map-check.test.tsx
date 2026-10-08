import { useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { commands, page, userEvent } from "vitest/browser";

import { mapInks } from "../../site/demo/map-ink";
import { RowMap } from "../../site/demo/RowMap";
import {
  DEFAULT_STYLE,
  PRESETS,
  applyPreset,
  withEnabled,
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

/** A `#rrggbb` as a computed style writes it. */
function rgb(hex: string): string {
  const [r, g, b] = [1, 3, 5].map(at => parseInt(hex.slice(at, at + 2), 16));
  return `rgb(${r}, ${g}, ${b})`;
}

/** The map with its state kept, as the panel keeps it. */
function Kept({ initial }: { initial: StyleState }) {
  const [state, setState] = useState(initial);
  return <RowMap state={state} onChange={setState} route="people" />;
}

/** The people map, its head's box empty and its businesses' checked. */
async function mounted(
  test: (boxes: {
    empty: HTMLInputElement;
    checked: HTMLInputElement;
  }) => Promise<void>,
  base: StyleState = DEFAULT_STYLE,
) {
  const host = document.createElement("div");
  host.className = "demo";
  host.style.width = "560px";
  document.body.append(host);
  const root = createRoot(host);
  flushSync(() =>
    root.render(
      <Kept
        initial={withEnabled(
          withListed(
            withListed(base, "people", "businesses", true),
            "people",
            "addresses",
            true,
          ),
          "people",
          "business",
          true,
        )}
      />,
    ),
  );
  try {
    const boxes = [
      ...host.querySelectorAll<HTMLInputElement>(".row-map-check"),
    ];
    const empty = boxes.find(box => !box.checked)!;
    const checked = boxes.find(box => box.checked)!;
    expect(empty).toBeDefined();
    expect(checked).toBeDefined();
    await test({ empty, checked });
  } finally {
    root.unmount();
    host.remove();
  }
}

describe("the Enabled column's checkbox", () => {
  // A viewport the runner draws whole: a scaled one snaps a 2px ring to 1px.
  beforeAll(async () => {
    await page.viewport(1280, 700);
  });
  afterAll(async () => {
    await page.viewport(1280, 900);
  });

  const midnight = applyPreset(
    DEFAULT_STYLE,
    PRESETS.find(each => each.name === "Midnight")!,
  );

  for (const [look, state] of [
    ["Light", DEFAULT_STYLE],
    ["Midnight", midnight],
  ] as const) {
    it(`is drawn by the page at the native box's size, in the look's inks, in ${look}`, async () => {
      const { check } = mapInks(withListed(state, "people", "addresses", true));
      await mounted(async ({ empty, checked }) => {
        for (const box of [empty, checked]) {
          const style = getComputedStyle(box);
          expect(style.appearance).toBe("none");
          expect(box.getBoundingClientRect().width).toBe(14);
          expect(box.getBoundingClientRect().height).toBe(14);
          expect(style.borderTopWidth).toBe("1px");
        }
        expect(getComputedStyle(empty).borderTopColor).toBe(rgb(check.edge));
        expect(getComputedStyle(empty).backgroundImage).toBe("none");
        const on = getComputedStyle(checked);
        expect(on.backgroundColor).toBe(rgb(check.fill));
        expect(on.borderTopColor).toBe(rgb(check.fill));
        expect(on.backgroundImage).toContain("data:image/svg+xml");
        expect(decodeURIComponent(on.backgroundImage)).toContain(
          `stroke="#ffffff"`,
        );
      }, state);
    });
  }

  it("strengthens its edge under the pointer", async () => {
    const { check, ring } = mapInks(DEFAULT_STYLE);
    await mounted(async ({ empty, checked }) => {
      await userEvent.hover(empty);
      expect(getComputedStyle(empty).borderTopColor).toBe(rgb(check.hover));
      await userEvent.hover(checked);
      expect(getComputedStyle(checked).borderTopColor).toBe(rgb(ring));
      await userEvent.unhover(checked);
    });
  });

  it("rings a box reached from the keyboard in the map's ring, clear of it", async () => {
    const { ring } = mapInks(DEFAULT_STYLE);
    await mounted(async ({ empty }) => {
      for (let tab = 0; tab < 60 && document.activeElement !== empty; tab++) {
        await userEvent.keyboard("{Tab}");
      }
      expect(document.activeElement).toBe(empty);
      const style = getComputedStyle(empty);
      expect(style.outlineStyle).toBe("solid");
      expect(style.outlineWidth).toBe("2px");
      expect(style.outlineColor).toBe(rgb(ring));
      expect(style.outlineOffset).toBe("2px");
    });
  });

  it("keeps its own edge, and no ring, when a click focuses it", async () => {
    const { check } = mapInks(
      withListed(DEFAULT_STYLE, "people", "addresses", true),
    );
    await mounted(async ({ checked }) => {
      // Clicked, the box is emptied, focused and still under the pointer.
      await userEvent.click(checked);
      expect(checked.checked).toBe(false);
      expect(document.activeElement).toBe(checked);
      const style = getComputedStyle(checked);
      expect(style.borderTopColor).toBe(rgb(check.hover));
      expect(style.outlineStyle).toBe("none");
    });
  });

  it("leaves a forced-colours display to draw the system's own box", async () => {
    await commands.forcedColors(true);
    try {
      await mounted(async ({ empty, checked }) => {
        expect(getComputedStyle(empty).appearance).toBe("auto");
        expect(getComputedStyle(checked).appearance).toBe("auto");
      });
    } finally {
      await commands.forcedColors(false);
    }
  });

  for (const preset of PRESETS) {
    it(`rings everything the map focuses in one ink that holds on the card, in ${preset.name}`, async () => {
      const state = applyPreset(DEFAULT_STYLE, preset);
      const { ring } = mapInks(withListed(state, "people", "addresses", true));
      await mounted(async () => {
        const map = document.querySelector<HTMLElement>(".row-map-wrap")!;
        const rings = new Map<string, string>();
        for (let tab = 0; tab < 80; tab++) {
          await userEvent.keyboard("{Tab}");
          const focused = document.activeElement;
          if (!(focused instanceof HTMLElement) || !map.contains(focused)) {
            continue;
          }
          // A place's select rings the face it sits on.
          const drawn =
            focused instanceof HTMLSelectElement
              ? focused
                  .closest(".row-map-place")!
                  .querySelector(".row-map-face")!
              : focused;
          if (drawn.closest(".row-map") === null) continue;
          const kind = focused.className.split(" ")[0] || focused.tagName;
          rings.set(
            `${kind} ${rings.size}`,
            getComputedStyle(drawn).outlineColor,
          );
        }
        const kinds = new Set([...rings.keys()].map(key => key.split(" ")[0]));
        for (const kind of ["row-map-grip", "row-map-check", "row-map-icon"]) {
          expect(kinds, [...kinds].join()).toContain(kind);
        }
        expect(kinds.has("SELECT") || kinds.has("row-map-select")).toBe(true);
        for (const [what, color] of rings) {
          expect(color, what).toBe(rgb(ring));
        }
      }, state);
    });
  }
});
