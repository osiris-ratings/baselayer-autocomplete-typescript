import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";

import { ROUTE_NAMES, type Route } from "@baselayer-sdk/autocomplete";

import { SearchTitle } from "../../site/demo/SearchTitle";

import "../../site/shared/brand.css";
import "../../site/demo/demo.css";

/** The card widths the head must hold at: a wide pane, a phone, a small one. */
const WIDTHS = [560, 400, 320] as const;

/** The test form's head as the demo draws it: the title, the filters toggle. */
function draw(width: number, route: Route) {
  const host = document.createElement("div");
  host.className = "demo";
  host.style.width = `${width}px`;
  document.body.append(host);
  const root = createRoot(host);
  flushSync(() =>
    root.render(
      <section className="demo-card">
        <div className="demo-card-head">
          <SearchTitle
            id="title"
            panelId="panel"
            routes={ROUTE_NAMES}
            route={route}
            onRoute={() => {}}
          />
          <button type="button" className="link-toggle">
            + Add filters
          </button>
        </div>
        <div id="panel" />
      </section>,
    ),
  );
  return {
    host,
    done() {
      root.unmount();
      host.remove();
    },
  };
}

function box(element: Element) {
  return element.getBoundingClientRect();
}

/**
 * How many lines an element's text runs over, by the tops of its text.
 */
function linesOf(element: Element): number {
  const tops = new Set<number>();
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  for (let text = walker.nextNode(); text; text = walker.nextNode()) {
    if ((text.textContent ?? "").trim() === "") continue;
    // The article a screen reader hears is out of the flow, and has no line.
    if (text.parentElement?.closest(".visually-hidden")) continue;
    const range = document.createRange();
    range.selectNodeContents(text);
    for (const rect of range.getClientRects()) tops.add(Math.round(rect.top));
  }
  return tops.size;
}

/** What is wrong with the head as drawn, one entry a fault. */
function faults(host: HTMLElement): string[] {
  const found: string[] = [];
  const head = host.querySelector<HTMLElement>(".demo-card-head")!;
  const card = box(host.querySelector(".demo-card")!);
  if (head.scrollWidth > head.clientWidth) {
    found.push(
      `the head scrolls sideways by ${head.scrollWidth - head.clientWidth}px`,
    );
  }
  for (const word of host.querySelectorAll<HTMLElement>(".search-by-word")) {
    const at = box(word);
    if (at.right > card.right + 0.5 || at.left < card.left - 0.5) {
      found.push(`"${word.textContent}" leaves the card`);
    }
    if (linesOf(word) > 1) {
      found.push(`"${word.textContent}" breaks across lines`);
    }
  }
  const title = box(host.querySelector(".demo-card-title")!);
  const toggle = box(host.querySelector(".link-toggle")!);
  const overlap =
    title.left < toggle.right &&
    toggle.left < title.right &&
    title.top < toggle.bottom &&
    toggle.top < title.bottom;
  if (overlap) {
    found.push("the title runs under the filters toggle");
  }
  if (toggle.right > card.right + 0.5) {
    found.push("the filters toggle leaves the card");
  }
  return found;
}

describe("the test form's title", () => {
  for (const width of WIDTHS) {
    for (const route of ["businesses", "addresses"] as const) {
      it(`keeps the button whole, never under the toggle, at ${width}px on ${route}`, () => {
        const { host, done } = draw(width, route);
        try {
          expect(host.querySelectorAll(".search-by-word")).toHaveLength(3);
          // The whole title, its longest form, at every width: the nouns as
          // drawn, and each tab's name, which carries its article.
          expect(
            [...host.querySelectorAll(".search-by-noun")].map(
              noun => noun.textContent,
            ),
          ).toEqual(["business", "person", "address"]);
          expect(
            [...host.querySelectorAll(".search-by-word")].map(
              word => word.textContent,
            ),
          ).toEqual(["a business", "a person", "an address"]);
          expect(faults(host)).toEqual([]);
        } finally {
          done();
        }
      });
    }
  }
});

/** A colour, a token's included, as the browser computes it. */
function computed(property: "color" | "background-color", value: string) {
  const probe = document.createElement("span");
  probe.style.setProperty(property, value);
  document.body.append(probe);
  const resolved = getComputedStyle(probe).getPropertyValue(property);
  probe.remove();
  return resolved;
}

const TRANSPARENT = "rgba(0, 0, 0, 0)";

describe("the title's segmented button", () => {
  it("raises the selected segment on the paper, in the ink, and mutes the others", () => {
    const { host, done } = draw(560, "people");
    try {
      const [business, person, address] = [
        ...host.querySelectorAll<HTMLElement>(".search-by-word"),
      ].map(word => getComputedStyle(word));

      expect(person!.backgroundColor).toBe(
        computed("background-color", "var(--paper)"),
      );
      expect(person!.color).toBe(computed("color", "var(--ink)"));
      for (const style of [business!, address!]) {
        expect(style.backgroundColor).toBe(TRANSPARENT);
        expect(style.color).toBe(computed("color", "var(--muted)"));
      }
    } finally {
      done();
    }
  });

  it("draws the component's glyph before each word, the selected one's in the accent and the rest in the word's colour", () => {
    const { host, done } = draw(560, "people");
    try {
      const icons = [...host.querySelectorAll<HTMLElement>(".search-by-icon")];
      expect(icons.map(icon => icon.dataset.entity)).toEqual([
        "business",
        "person",
        "address",
      ]);
      for (const icon of icons) {
        expect(icon.getAttribute("aria-hidden")).toBe("true");
        expect(icon.querySelector("svg")).not.toBeNull();
      }
      const [business, person, address] = icons.map(icon =>
        getComputedStyle(icon),
      );
      expect(person!.color).toBe(computed("color", "var(--blue)"));
      expect(business!.color).toBe(computed("color", "var(--muted)"));
      expect(address!.color).toBe(computed("color", "var(--muted)"));
    } finally {
      done();
    }
  });

  it("stands the button on the baseline of the title's own word, glyphs or none", () => {
    for (const width of [900, 320]) {
      const { host, done } = draw(width, "people");
      try {
        // A zero-sized box sits on the baseline of whatever it is put in.
        const probe = () => {
          const mark = document.createElement("span");
          mark.style.cssText = "display:inline-block;width:0;height:0";
          return mark;
        };
        const lead = probe();
        const title = host.querySelector(".search-title")!;
        title.prepend(lead);
        const words = [
          ...host.querySelectorAll<HTMLElement>(".search-by-noun"),
        ].map(noun => {
          const mark = probe();
          noun.append(mark);
          return mark;
        });
        const line = lead.getBoundingClientRect().bottom;
        const lines = new Set(
          words.map(mark => mark.getBoundingClientRect().bottom),
        );
        // The segments share one baseline, and where the button has room on
        // the title's line it is the title's. A narrow head wraps it below.
        expect(lines.size).toBe(1);
        if (width > 600) {
          expect(Math.abs([...lines][0]! - line)).toBeLessThan(0.5);
        }
      } finally {
        done();
      }
    }
  });

  it("darkens a segment under the pointer, moving no segment", async () => {
    const { host, done } = draw(560, "people");
    try {
      const words = [...host.querySelectorAll<HTMLElement>(".search-by-word")];
      const boxes = () =>
        words.map(word => {
          const { x, y, width } = word.getBoundingClientRect();
          return [Math.round(x), Math.round(y), Math.round(width)];
        });
      const before = boxes();

      await userEvent.hover(words[0]!);

      expect(getComputedStyle(words[0]!).color).toBe(
        computed("color", "var(--ink)"),
      );
      expect(boxes()).toEqual(before);
      await userEvent.unhover(words[0]!);
    } finally {
      done();
    }
  });

  it("moves between the segments with the arrow keys, and shows the ring where the focus is", async () => {
    const { host, done } = draw(560, "people");
    try {
      // The selected segment is the one in the tab order; the arrow moves the
      // focus to the next, which this title's host never selects.
      await userEvent.tab();
      await userEvent.keyboard("{ArrowRight}");
      const address = host.querySelectorAll<HTMLElement>(".search-by-word")[2]!;
      expect(document.activeElement).toBe(address);

      const style = getComputedStyle(address);
      expect(style.outlineStyle).toBe("solid");
      expect(style.outlineColor).toBe(computed("color", "var(--blue)"));
    } finally {
      done();
    }
  });

  it("drops the glyphs and tightens the segments in a head too narrow for them, keeping the button on one line", () => {
    const { host, done } = draw(320, "businesses");
    try {
      for (const icon of host.querySelectorAll(".search-by-icon")) {
        expect(getComputedStyle(icon).display).toBe("none");
      }
      const control = box(host.querySelector(".search-by")!);
      const head = box(host.querySelector(".demo-card-head")!);
      expect(control.right).toBeLessThanOrEqual(head.right + 0.5);
      expect(control.left).toBeGreaterThanOrEqual(head.left - 0.5);
    } finally {
      done();
    }
  });
});
