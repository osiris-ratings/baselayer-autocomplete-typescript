import { useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { commands, userEvent } from "vitest/browser";

import { StylingPanel } from "../../site/demo/StylingPanel";
import {
  INITIAL_STYLE,
  PRESETS,
  activePreset,
  type StyleState,
} from "../../site/demo/style-state";

import "../../site/shared/brand.css";
import "../../site/demo/demo.css";

declare module "vitest/browser" {
  interface BrowserCommands {
    reducedMotion: (active: boolean) => Promise<void>;
  }
}

/** The panel with its state kept, the latest read back. */
function mount(width: number) {
  const host = document.createElement("div");
  host.className = "demo";
  host.style.width = `${width}px`;
  document.body.append(host);
  const latest = {
    state: INITIAL_STYLE,
    set: (() => {}) as (state: StyleState) => void,
  };
  function Kept() {
    const [state, setState] = useState<StyleState>(INITIAL_STYLE);
    latest.state = state;
    latest.set = setState;
    return <StylingPanel state={state} onChange={setState} />;
  }
  const root = createRoot(host);
  flushSync(() => root.render(<Kept />));
  const scroller = host.querySelector<HTMLElement>(".presets")!;
  const frame = scroller.parentElement!;
  const button = (name: string) =>
    host.querySelector<HTMLButtonElement>(
      `.presets-nav button[aria-label="${name}"]`,
    )!;
  return {
    host,
    scroller,
    frame,
    latest,
    earlier: () => button("Earlier presets"),
    later: () => button("Later presets"),
    done() {
      root.unmount();
      host.remove();
    },
  };
}

const frame = () =>
  new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
/** Lets a shade finish fading in or out. */
const faded = () => new Promise(resolve => setTimeout(resolve, 200));

/** Whether a shade is drawn at an edge of the presets' row. */
function shaded(element: HTMLElement, pseudo: "::before" | "::after") {
  const style = getComputedStyle(element, pseudo);
  return style.content !== "none" && Number(style.opacity) > 0.5;
}

describe("the presets' carousel", () => {
  beforeAll(async () => {
    await commands.reducedMotion(true);
  });
  afterAll(async () => {
    await commands.reducedMotion(false);
  });

  for (const width of [560, 320]) {
    it(`keeps every preset in one row that scrolls sideways, snapping to each, and the page no wider, at ${width}px`, () => {
      const { host, scroller, done } = mount(width);
      try {
        const presets = [...scroller.querySelectorAll<HTMLElement>(".preset")];
        expect(presets).toHaveLength(PRESETS.length);
        const tops = new Set(
          presets.map(each => Math.round(each.getBoundingClientRect().top)),
        );
        expect(tops.size).toBe(1);
        expect(scroller.scrollWidth).toBeGreaterThan(scroller.clientWidth + 20);
        expect(getComputedStyle(scroller).scrollSnapType).toMatch(/^x/);
        for (const each of presets) {
          expect(getComputedStyle(each).scrollSnapAlign).toBe("start");
        }
        expect(host.scrollWidth).toBeLessThanOrEqual(host.clientWidth);
        expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
          window.innerWidth,
        );
      } finally {
        done();
      }
    });
  }

  it("turns a page with the buttons below it, each disabled at its end", async () => {
    const { scroller, earlier, later, done } = mount(400);
    try {
      expect(earlier().disabled).toBe(true);
      expect(later().disabled).toBe(false);
      const page = scroller.clientWidth;
      await userEvent.click(later());
      await frame();
      // A page, give or take where the snap puts the next preset.
      expect(scroller.scrollLeft).toBeGreaterThan(page * 0.6);
      expect(scroller.scrollLeft).toBeLessThanOrEqual(page + 1);
      expect(earlier().disabled).toBe(false);
      for (let turns = 0; turns < 20 && !later().disabled; turns++) {
        await userEvent.click(later());
        await frame();
      }
      expect(later().disabled).toBe(true);
      expect(scroller.scrollLeft + scroller.clientWidth).toBeGreaterThanOrEqual(
        scroller.scrollWidth - 1,
      );
      await userEvent.click(earlier());
      await frame();
      expect(later().disabled).toBe(false);
    } finally {
      done();
    }
  });

  it("shades only the edge there is more beyond, with the row map's own shade", async () => {
    const { scroller, frame: edges, done } = mount(400);
    try {
      await faded();
      expect([shaded(edges, "::before"), shaded(edges, "::after")]).toEqual([
        false,
        true,
      ]);
      scroller.scrollLeft = (scroller.scrollWidth - scroller.clientWidth) / 2;
      scroller.dispatchEvent(new Event("scroll"));
      await faded();
      expect([shaded(edges, "::before"), shaded(edges, "::after")]).toEqual([
        true,
        true,
      ]);
      scroller.scrollLeft = scroller.scrollWidth;
      scroller.dispatchEvent(new Event("scroll"));
      await faded();
      expect([shaded(edges, "::before"), shaded(edges, "::after")]).toEqual([
        true,
        false,
      ]);
      // The row map's shade: as deep, as round, and the page's ink at the same share.
      for (const pseudo of ["::before", "::after"] as const) {
        const style = getComputedStyle(edges, pseudo);
        expect(style.width, pseudo).toBe("12px");
        expect(style.backgroundImage, pseudo).toContain("linear-gradient");
      }
      // Over the whole item, swatch and name, and a little past each.
      const swatch = scroller
        .querySelector(".preset-swatch")!
        .getBoundingClientRect();
      const name = scroller
        .querySelector(".preset-name")!
        .getBoundingClientRect();
      const box = edges.getBoundingClientRect();
      for (const pseudo of ["::before", "::after"] as const) {
        const style = getComputedStyle(edges, pseudo);
        const top = box.top + parseFloat(style.top);
        const bottom = top + parseFloat(style.height);
        expect(top, pseudo).toBeLessThan(swatch.top - 1);
        expect(bottom, pseudo).toBeGreaterThan(name.bottom + 1);
      }
      expect(getComputedStyle(edges, "::before").borderTopLeftRadius).toBe(
        "8px",
      );
      expect(getComputedStyle(edges, "::after").borderTopRightRadius).toBe(
        "8px",
      );
    } finally {
      done();
    }
  });

  it("moves the choice with the arrow keys, one tab stop, and brings it into view", async () => {
    const { scroller, latest, done } = mount(320);
    try {
      const radios = () => [
        ...scroller.querySelectorAll<HTMLButtonElement>('[role="radio"]'),
      ];
      expect(radios().filter(radio => radio.tabIndex === 0)).toHaveLength(1);
      radios()[0]!.focus();
      for (let step = 0; step < 6; step++)
        await userEvent.keyboard("{ArrowRight}");
      await frame();
      const chosen = PRESETS[6]!;
      expect(activePreset(latest.state)?.name).toBe(chosen.name);
      const focused = document.activeElement as HTMLElement;
      expect(focused.getAttribute("aria-checked")).toBe("true");
      expect(focused.textContent).toContain(chosen.name);
      expect(radios().filter(radio => radio.tabIndex === 0)).toEqual([focused]);
      const view = scroller.getBoundingClientRect();
      const box = focused.getBoundingClientRect();
      expect(box.left).toBeGreaterThanOrEqual(view.left - 1);
      expect(box.right).toBeLessThanOrEqual(view.right + 1);
      await userEvent.keyboard("{ArrowLeft}");
      expect(activePreset(latest.state)?.name).toBe(PRESETS[5]!.name);
    } finally {
      done();
    }
  });

  for (const width of [560, 320]) {
    it(`never moves the form when the Custom label comes and goes, at ${width}px`, async () => {
      const { scroller, frame: carousel, latest, done } = mount(width);
      try {
        const fold = scroller
          .closest(".styling-panel")!
          .querySelector(".presets-nav")!.nextElementSibling!;
        const tops = () => [
          carousel.getBoundingClientRect().top,
          fold.getBoundingClientRect().top,
        ];
        const custom = () =>
          scroller
            .closest(".styling-panel")!
            .querySelector<HTMLElement>(".presets-custom")!;
        expect(getComputedStyle(custom()).visibility).toBe("hidden");
        const before = tops();
        flushSync(() =>
          latest.set({
            ...latest.state,
            look: { ...latest.state.look, titleColor: "#123456" },
          }),
        );
        expect(activePreset(latest.state)).toBeNull();
        expect(getComputedStyle(custom()).visibility).toBe("visible");
        expect(tops()).toEqual(before);
        await userEvent.click(
          scroller.querySelector<HTMLElement>('[role="radio"]')!,
        );
        expect(activePreset(latest.state)?.name).toBe(PRESETS[0]!.name);
        expect(tops()).toEqual(before);
        expect(getComputedStyle(custom()).visibility).toBe("hidden");
      } finally {
        done();
      }
    });
  }

  /** The scroll positions the Later button stops at, from the start. */
  async function stops(scroller: HTMLElement, later: () => HTMLButtonElement) {
    scroller.scrollLeft = 0;
    scroller.dispatchEvent(new Event("scroll"));
    await frame();
    const found = [scroller.scrollLeft];
    for (let turns = 0; turns < 30 && !later().disabled; turns++) {
      await userEvent.click(later());
      await frame();
      found.push(scroller.scrollLeft);
    }
    return found;
  }

  it("puts the page buttons at its far sides, a dot for each page between them, the current one marked", async () => {
    const { host, scroller, earlier, later, done } = mount(560);
    try {
      const dots = () => [
        ...host.querySelectorAll<HTMLButtonElement>(".presets-dots button"),
      ];
      const pages = await stops(scroller, later);
      expect(dots()).toHaveLength(pages.length);
      const nav = host.querySelector(".presets-nav")!.getBoundingClientRect();
      expect(earlier().getBoundingClientRect().left).toBeCloseTo(nav.left, 0);
      expect(later().getBoundingClientRect().right).toBeCloseTo(nav.right, 0);
      for (const dot of dots()) {
        const box = dot.getBoundingClientRect();
        expect(box.left).toBeGreaterThan(
          earlier().getBoundingClientRect().right,
        );
        expect(box.right).toBeLessThan(later().getBoundingClientRect().left);
        // Small to the eye, but a target a finger can hit.
        expect(box.width).toBeGreaterThanOrEqual(20);
        expect(box.height).toBeGreaterThanOrEqual(20);
      }
      const current = () =>
        dots().findIndex(dot => dot.getAttribute("aria-current") === "true");
      // The Later button left it on the last page.
      expect(current()).toBe(pages.length - 1);
      expect(dots()[1]!.getAttribute("aria-label")).toBe(
        `Page 2 of ${pages.length}`,
      );
      await userEvent.click(dots()[1]!);
      await frame();
      expect(scroller.scrollLeft).toBeCloseTo(pages[1]!, 0);
      expect(current()).toBe(1);
      // A swipe or a wheel moves the current dot as well.
      scroller.scrollLeft = 0;
      scroller.dispatchEvent(new Event("scroll"));
      await frame();
      expect(current()).toBe(0);
      expect(earlier().disabled).toBe(true);
    } finally {
      done();
    }
  });

  it("counts its pages again when the panel is resized", async () => {
    const { host, scroller, later, done } = mount(400);
    try {
      const count = () => host.querySelectorAll(".presets-dots button").length;
      const narrow = count();
      expect(narrow).toBe((await stops(scroller, later)).length);
      host.style.width = "900px";
      await frame();
      await frame();
      expect(count()).toBeLessThan(narrow);
      expect(count()).toBe((await stops(scroller, later)).length);
    } finally {
      done();
    }
  });

  it("shows the page as text where its dots would not fit between the buttons", async () => {
    const { host, scroller, later, done } = mount(200);
    try {
      expect(host.querySelectorAll(".presets-dots button")).toHaveLength(0);
      const pages = (await stops(scroller, later)).length;
      expect(host.querySelector(".presets-page")!.textContent).toBe(
        `${pages} / ${pages}`,
      );
    } finally {
      done();
    }
  });
});
