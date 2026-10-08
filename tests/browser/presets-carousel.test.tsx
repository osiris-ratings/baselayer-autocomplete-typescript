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

  it("wraps the arrow keys round at both ends", async () => {
    const { scroller, latest, done } = mount(560);
    try {
      const radios = () => [
        ...scroller.querySelectorAll<HTMLButtonElement>('[role="radio"]'),
      ];
      const first = PRESETS[0]!.name;
      const last = PRESETS.at(-1)!.name;
      radios()[0]!.focus();
      for (const [key, chosen] of [
        ["{ArrowLeft}", last],
        ["{ArrowRight}", first],
        ["{ArrowUp}", last],
        ["{ArrowDown}", first],
      ] as const) {
        await userEvent.keyboard(key);
        await frame();
        expect(activePreset(latest.state)?.name, key).toBe(chosen);
        expect(document.activeElement?.textContent, key).toContain(chosen);
      }
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

  it("puts the page buttons right beside its dots, the three centred as one, a dot for each page, the current one marked", async () => {
    const { host, scroller, earlier, later, done } = mount(560);
    try {
      const dots = () => [
        ...host.querySelectorAll<HTMLButtonElement>(".presets-dots button"),
      ];
      const pages = await stops(scroller, later);
      expect(dots()).toHaveLength(pages.length);
      const nav = host.querySelector(".presets-nav")!.getBoundingClientRect();
      const capsule = host
        .querySelector(".presets-dots")!
        .getBoundingClientRect();
      const back = earlier().getBoundingClientRect();
      const on = later().getBoundingClientRect();
      expect((back.left + on.right) / 2).toBeCloseTo(
        (nav.left + nav.right) / 2,
        0,
      );
      // Each arrow about a dot's gap from the capsule: 9px between dots.
      const arrow = (button: HTMLButtonElement) =>
        button.querySelector(".presets-chevron")!.getBoundingClientRect();
      expect(capsule.left - arrow(earlier()).right).toBeGreaterThanOrEqual(6);
      expect(capsule.left - arrow(earlier()).right).toBeLessThanOrEqual(12);
      expect(arrow(later()).left - capsule.right).toBeGreaterThanOrEqual(6);
      expect(arrow(later()).left - capsule.right).toBeLessThanOrEqual(12);
      for (const dot of dots()) {
        const box = dot.getBoundingClientRect();
        expect(box.left).toBeGreaterThan(
          earlier().getBoundingClientRect().right,
        );
        expect(box.right).toBeLessThan(later().getBoundingClientRect().left);
        // Small to the eye, but a target a finger can hit: about 24px tall,
        // and as wide as the space between it and its neighbours.
        const middle = {
          x: box.left + box.width / 2,
          y: box.top + box.height / 2,
        };
        for (const [x, y] of [
          [middle.x, middle.y - 11],
          [middle.x, middle.y + 11],
          [middle.x - 7, middle.y],
          [middle.x + 7, middle.y],
        ] as const) {
          expect(document.elementFromPoint(x, y)).toBe(dot);
        }
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

  it("draws its dots as a page control: small round dots, no button chrome, in one faint capsule", async () => {
    const { host, earlier, later, done } = mount(560);
    try {
      const capsule = host.querySelector<HTMLElement>(".presets-dots")!;
      const dots = [...capsule.querySelectorAll<HTMLButtonElement>("button")];
      expect(dots.length).toBeGreaterThan(1);
      const ground = getComputedStyle(capsule);
      // A faint fill, rounded at its ends, a few px round the dots.
      expect(ground.backgroundColor).toMatch(
        /^(rgba|color)\(.*(0\.0\d|0\.1\d?)\)$/,
      );
      const wrap = capsule.getBoundingClientRect();
      expect(parseFloat(ground.borderTopLeftRadius)).toBeGreaterThanOrEqual(
        wrap.height / 2,
      );
      expect(parseFloat(ground.paddingTop)).toBeGreaterThanOrEqual(3);
      expect(parseFloat(ground.paddingLeft)).toBeGreaterThanOrEqual(3);
      // Centred between the page buttons.
      const between =
        (earlier().getBoundingClientRect().right +
          later().getBoundingClientRect().left) /
        2;
      expect(wrap.left + wrap.width / 2).toBeCloseTo(between, 0);
      const boxes = dots.map(dot => dot.getBoundingClientRect());
      boxes.forEach((box, at) => {
        const style = getComputedStyle(dots[at]!);
        expect(Math.abs(box.width - box.height)).toBeLessThanOrEqual(0.5);
        expect(box.width).toBeLessThan(10);
        expect(box.width).toBeGreaterThanOrEqual(6);
        expect(style.borderTopWidth).toBe("0px");
        expect(style.borderTopLeftRadius).toBe("50%");
        expect(style.boxShadow).toBe("none");
        if (at > 0) {
          const gap = box.left - boxes[at - 1]!.right;
          expect(gap).toBeGreaterThanOrEqual(8);
          expect(gap).toBeLessThanOrEqual(10);
        }
      });
      // The current dot in the text's ink, the others in it at about 30%.
      const alpha = (dot: HTMLElement) => {
        const color = getComputedStyle(dot).backgroundColor;
        const parts = color.match(/[\d.]+/g)!.map(Number);
        return color.startsWith("rgba") || parts.length > 3 ? parts.at(-1)! : 1;
      };
      const current = dots.find(dot => dot.getAttribute("aria-current"))!;
      expect(alpha(current)).toBe(1);
      for (const dot of dots.filter(each => each !== current)) {
        expect(alpha(dot)).toBeGreaterThanOrEqual(0.25);
        expect(alpha(dot)).toBeLessThanOrEqual(0.35);
      }
      // A ring that hugs the dot, from the keyboard only.
      await userEvent.click(dots[1]!);
      expect(getComputedStyle(dots[1]!).outlineStyle).toBe("none");
      later().focus();
      await userEvent.keyboard("{Shift>}{Tab}{/Shift}");
      const focused = document.activeElement as HTMLElement;
      expect(dots).toContain(focused);
      const ring = getComputedStyle(focused);
      expect(ring.outlineStyle).toBe("solid");
      expect(parseFloat(ring.outlineOffset)).toBeLessThanOrEqual(3);
    } finally {
      done();
    }
  });

  it("draws each page button as its arrow alone, in the button's ink, faint at its end, whatever the font has", async () => {
    const { host, earlier, later, done } = mount(560);
    try {
      for (const button of [earlier(), later()]) {
        expect(button.textContent).toBe("");
        // No box: no border, fill or shadow, but a finger's target.
        const chrome = getComputedStyle(button);
        expect(chrome.borderTopWidth).toBe("0px");
        expect(chrome.backgroundColor).toBe("rgba(0, 0, 0, 0)");
        expect(chrome.boxShadow).toBe("none");
        const target = button.getBoundingClientRect();
        expect(target.width).toBeGreaterThanOrEqual(24);
        expect(target.height).toBeGreaterThanOrEqual(24);
        const arrow = button.querySelector<HTMLElement>(".presets-chevron")!;
        const box = arrow.getBoundingClientRect();
        expect(box.width).toBeGreaterThanOrEqual(6);
        expect(box.height).toBeGreaterThanOrEqual(6);
        const style = getComputedStyle(arrow);
        const ink = getComputedStyle(button).color;
        expect(style.borderRightColor).toBe(ink);
        expect(style.borderBottomColor).toBe(ink);
        // 1.5px, which a 1x screen rounds down to a whole pixel.
        expect(parseFloat(style.borderRightWidth)).toBeGreaterThanOrEqual(1);
        // Inside its button, across its middle.
        const own = button.getBoundingClientRect();
        expect(box.left).toBeGreaterThan(own.left);
        expect(box.right).toBeLessThan(own.right);
        expect(
          Math.abs(box.top + box.height / 2 - (own.top + own.height / 2)),
        ).toBeLessThanOrEqual(1);
      }
      // One points back and the other on.
      const turn = (button: HTMLButtonElement) =>
        new DOMMatrix(
          getComputedStyle(button.querySelector(".presets-chevron")!).transform,
        );
      expect(turn(earlier()).a).toBeCloseTo(-turn(later()).a, 3);
      // At the start, Earlier is disabled and faint, Later in full ink.
      const alpha = (button: HTMLButtonElement) => {
        const color = getComputedStyle(button).color;
        const parts = color.match(/[\d.]+/g)!.map(Number);
        return parts.length > 3 ? parts.at(-1)! : 1;
      };
      expect(earlier().disabled).toBe(true);
      expect(alpha(earlier())).toBeLessThanOrEqual(0.4);
      expect(alpha(later())).toBe(1);
      // A ring from the keyboard only.
      await userEvent.click(later());
      expect(getComputedStyle(later()).outlineStyle).toBe("none");
      const dots = host.querySelectorAll<HTMLButtonElement>(
        ".presets-dots button",
      );
      dots[dots.length - 1]!.focus();
      await userEvent.keyboard("{Tab}");
      expect(document.activeElement).toBe(later());
      expect(getComputedStyle(later()).outlineStyle).toBe("solid");
    } finally {
      done();
    }
  });

  it("keeps the page buttons beside its dots or its page, the three centred, at every width", async () => {
    let dotted = 0;
    for (let width = 200; width <= 600; width += 10) {
      const { host, earlier, later, done } = mount(width);
      try {
        await frame();
        const between = host.querySelector<HTMLElement>(
          ".presets-dots, .presets-page",
        )!;
        if (between.matches(".presets-dots")) dotted++;
        const box = between.getBoundingClientRect();
        const back = earlier().getBoundingClientRect();
        const on = later().getBoundingClientRect();
        // Beside it on each side, with no more than the group's gap.
        expect(box.left - back.right, `${width}px`).toBeGreaterThanOrEqual(0);
        expect(box.left - back.right, `${width}px`).toBeLessThanOrEqual(4);
        expect(on.left - box.right, `${width}px`).toBeGreaterThanOrEqual(0);
        expect(on.left - box.right, `${width}px`).toBeLessThanOrEqual(4);
        // Centred, and nothing pushed out past the row's ends.
        const nav = host.querySelector(".presets-nav")!.getBoundingClientRect();
        expect(
          Math.abs((back.left + on.right) / 2 - (nav.left + nav.right) / 2),
          `${width}px`,
        ).toBeLessThanOrEqual(1);
        expect(back.left, `${width}px`).toBeGreaterThanOrEqual(nav.left - 0.5);
        expect(on.right, `${width}px`).toBeLessThanOrEqual(nav.right + 0.5);
      } finally {
        done();
      }
    }
    // Both draw somewhere in the sweep, the dots and the text.
    expect(dotted).toBeGreaterThan(0);
    expect(dotted).toBeLessThan(41);
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
