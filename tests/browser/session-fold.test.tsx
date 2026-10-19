import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";

import { App } from "../../site/demo/App";
import { Collapsible } from "../../site/demo/controls";
import { answerSample } from "../../site/demo/sample-api";

import "../../site/shared/brand.css";
import "../../site/shared/fonts";
import "../../site/demo/demo.css";

// The key step's Session fold in a real layout engine: closed it is one row on
// the step's title, as step 2's filters are on its title, and nothing else;
// opened it is drawn as step 2's filters are. It is there only while the step
// is expanded: the folded step is drawn as it was before the row.

// The demo against the made-up API `DEMO_API=sample` serves, every search on.
function sampleFetch() {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const path = url.slice(url.indexOf("/_baselayer") + "/_baselayer".length);
    const headers = Object.fromEntries([
      ...new Headers(init?.headers).entries(),
    ]);
    const reply = answerSample(
      {
        method: init?.method ?? "GET",
        path,
        headers: { ...headers, origin: "http://localhost:3000" },
        body: typeof init?.body === "string" ? init.body : null,
      },
      { routes: ["businesses", "people", "addresses"] },
    );
    return new Response(JSON.stringify(reply?.body ?? {}), {
      status: reply?.status ?? 404,
      headers: { "content-type": "application/json" },
    });
  });
}

let done: (() => void) | null = null;
beforeEach(async () => {
  await page.viewport(1280, 900);
});
afterEach(async () => {
  done?.();
  done = null;
  vi.unstubAllGlobals();
  await page.viewport(1280, 900);
});

function drawn() {
  vi.stubGlobal("fetch", sampleFetch());
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  flushSync(() => root.render(<App />));
  done = () => {
    root.unmount();
    host.remove();
  };
}

const byId = (testId: string) =>
  document.querySelector<HTMLElement>(`[data-testid="${testId}"]`)!;
const toggle = () => byId("demo-session-toggle");
const panel = () => document.getElementById("demo-session-settings")!;
const filters = () => document.getElementById("demo-filters")!;
const filtersToggle = () =>
  [...document.querySelectorAll<HTMLButtonElement>("button")].find(button =>
    /Add filters/.test(button.textContent ?? ""),
  )!;
const rect = (element: Element) => element.getBoundingClientRect();
/** A click with Shift held, which reveals the match profile. */
const shiftClick = (element: Element) =>
  element.dispatchEvent(
    new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      shiftKey: true,
    }),
  );
const profileSelect = () => panel().querySelector<HTMLSelectElement>("select");
const customText = () =>
  panel().querySelector<HTMLInputElement>("input:not([type])");
const rowsInput = () =>
  panel().querySelector<HTMLInputElement>('input[type="number"]')!;
const routeBoxes = () => [
  ...panel().querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
];
/** The key step's title row: its heading, with the fold's button and ours. */
const heading = () => step().querySelector("h2")!;
/** The step's Environment dropdown: its first, once the panel's is set apart. */
const environmentSelect = () =>
  [...step().querySelectorAll<HTMLSelectElement>("select")].find(
    select => !panel().contains(select),
  )!;
const step = () => byId("demo-connect");
/** The step's own chevron, at the end of its title row: not the toggle's. */
const stepChevron = () =>
  [...step().querySelectorAll<HTMLElement>(".fold-heading .fold-chevron")].find(
    chevron => chevron.closest(".link-toggle") === null,
  )!;
/** Step 2's title row: the title and the filters' button. */
const filtersHead = () =>
  filtersToggle().closest<HTMLElement>(".demo-card-head")!;
/** Where a card's own content ends on the right: its edge less its padding. */
const contentRight = (card: Element) =>
  rect(card).right -
  parseFloat(getComputedStyle(card).paddingRight) -
  parseFloat(getComputedStyle(card).borderRightWidth);

/**
 * The same fold as the key step's (number, title, icon, summary), drawn the
 * way every fold is drawn without a control after its title, beside the key
 * step in its own pane so it has the same width; measured, then taken away.
 */
function beside<T>(
  measure: (reference: HTMLElement) => T,
  summaryHtml?: string,
  open = false,
): T {
  const host = document.createElement("div");
  step().after(host);
  const root = createRoot(host);
  flushSync(() =>
    root.render(
      <Collapsible
        num="01"
        title="Connect"
        icon="token"
        summary="Not connected"
        open={open}
        onToggle={() => {}}
      >
        {null}
      </Collapsible>,
    ),
  );
  try {
    const reference = host.querySelector<HTMLElement>(".fold")!;
    // The summary the step shows, drawn here as it is there.
    if (summaryHtml !== undefined) {
      reference.querySelector(".fold-summary")!.innerHTML = summaryHtml;
    }
    return measure(reference);
  } finally {
    root.unmount();
    host.remove();
  }
}

/**
 * Where each part of a fold's title row is, from the card's own corner. The
 * summary is where its words are drawn: its box may take the free room.
 */
const parts = (card: HTMLElement) => {
  const from = rect(card);
  const relative = (box: DOMRect) => ({
    left: box.left - from.left,
    right: box.right - from.left,
    top: box.top - from.top,
    height: box.height,
    width: box.width,
  });
  const at = (selector: string) =>
    relative(rect(card.querySelector(selector)!));
  const words = (selector: string) => {
    const element = card.querySelector(selector);
    if (element === null) return relative(new DOMRect(from.left, from.top));
    const range = document.createRange();
    range.selectNodeContents(element);
    return relative(range.getBoundingClientRect());
  };
  return {
    card: { height: from.height, width: from.width },
    heading: at(".fold-heading"),
    num: at(".demo-num"),
    title: at(".fold-title"),
    summary: words(".fold-summary"),
    // The fold's own, not the one on the row's toggle.
    chevron: at(
      ".fold-heading > .fold-chevron, .fold-heading > .fold-toggle .fold-chevron",
    ),
  };
};

describe("the Session fold, closed", () => {
  it("is not drawn: the panel takes no room and nothing in it can be reached", async () => {
    drawn();

    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    expect(getComputedStyle(panel()).display).toBe("none");
    expect(rect(panel()).height).toBe(0);
    // Tab from the step's fold to the row and on: never into the panel's
    // dropdown, but to the step's own first field.
    byId("demo-connect").querySelector<HTMLElement>(".fold-toggle")!.focus();
    await userEvent.tab();
    expect(document.activeElement).toBe(toggle());
    await userEvent.tab();
    expect(panel().contains(document.activeElement)).toBe(false);
    expect(step().contains(document.activeElement)).toBe(true);
  });

  it("leaves the key path as it was: the key, Apply, and out of the step", async () => {
    drawn();

    await userEvent.fill(byId("demo-key"), "a-key");
    byId("demo-key").focus();
    await userEvent.tab();
    expect(document.activeElement).toBe(byId("demo-apply"));
    await userEvent.tab();
    // Nothing in the step comes after Apply.
    expect(step().contains(document.activeElement)).toBe(false);
  });

  it("adds nothing to the key step: it is as tall, and the key and Apply stand where they would without the row", () => {
    drawn();
    const key = byId("demo-key");
    const apply = byId("demo-apply");
    const keyTop = rect(key).top;
    const applyTop = rect(apply).top;
    const withRow = rect(step()).height;

    toggle().style.display = "none";
    const withoutRow = rect(step()).height;
    const keyWithout = rect(key).top;
    const applyWithout = rect(apply).top;
    toggle().style.display = "";

    expect(keyTop).toBe(keyWithout);
    expect(applyTop).toBe(applyWithout);
    expect(withRow).toBe(withoutRow);
    // And the row is no taller than the filters' row, on one line.
    expect(rect(toggle()).height).toBeLessThanOrEqual(
      rect(filtersToggle()).height + 1,
    );
  });

  it("is on the title row, on the left right after the title, and the step's chevron stays at the row's end", () => {
    drawn();
    const title = step().querySelector<HTMLElement>(".fold-title")!;
    const chevron = stepChevron();

    // On the heading's row, right after the title: not the right.
    expect(rect(toggle()).left).toBeGreaterThan(rect(title).right);
    expect(rect(toggle()).left - rect(title).right).toBeLessThanOrEqual(48);
    expect(rect(toggle()).top).toBeGreaterThanOrEqual(rect(heading()).top);
    expect(rect(toggle()).bottom).toBeLessThanOrEqual(rect(heading()).bottom);
    // The step's own chevron is at the end of the row, as every fold's is,
    // past the toggle.
    expect(rect(chevron).left).toBeGreaterThan(rect(toggle()).right);
    expect(contentRight(step()) - rect(chevron).right).toBeLessThanOrEqual(8);
    // Sharing the title's baseline, as step 2's row does: the same alignment.
    expect(getComputedStyle(heading()).alignItems).toBe(
      getComputedStyle(filtersHead()).alignItems,
    );
    expect(rect(toggle()).top).toBeGreaterThanOrEqual(rect(title).top - 1);
    expect(rect(toggle()).bottom).toBeLessThanOrEqual(rect(title).bottom + 1);
  });

  it("leaves the whole title row the fold's button: its end and the free space fold the step, the toggle presses only itself", async () => {
    drawn();
    const fold = step().querySelector<HTMLElement>(".fold-toggle")!;
    const at = (element: Element) => {
      const { left, top, width, height } = rect(element);
      return document.elementFromPoint(left + width / 2, top + height / 2);
    };

    // The chevron, drawn where the summary and chevron always were.
    expect(at(stepChevron())?.closest("button")).toBe(fold);
    // The free space between the toggle and the chevron.
    const gap = {
      x: (rect(toggle()).right + rect(stepChevron()).left) / 2,
      y: rect(toggle()).top + rect(toggle()).height / 2,
    };
    expect(document.elementFromPoint(gap.x, gap.y)?.closest("button")).toBe(
      fold,
    );
    // The toggle itself is its own button.
    expect(at(toggle())?.closest("button")).toBe(toggle());
    expect(step().getAttribute("data-open")).toBe("true");
    (document.elementFromPoint(gap.x, gap.y) as HTMLElement).click();
    await expect.poll(() => step().getAttribute("data-open")).toBe("false");
  });

  it("turns the step's own chevron up while it is open and down once folded, as every fold's does", async () => {
    drawn();
    const open = getComputedStyle(stepChevron()).transform;
    const down = getComputedStyle(
      filtersToggle().querySelector(".fold-chevron")!,
    ).transform;

    await userEvent.click(step().querySelector(".fold-toggle")!);

    await expect.poll(() => step().getAttribute("data-open")).toBe("false");
    // The chevron turns over a moment.
    await expect
      .poll(() => getComputedStyle(stepChevron()).transform)
      .toBe(down);
    expect(open).not.toBe(down);
  });

  it("is drawn as step 2's filters row is", () => {
    drawn();
    const ours = getComputedStyle(toggle());
    const theirs = getComputedStyle(filtersToggle());

    for (const property of [
      "color",
      "fontFamily",
      "fontSize",
      "letterSpacing",
      "textTransform",
      "backgroundColor",
      "cursor",
    ] as const) {
      expect(ours[property]).toBe(theirs[property]);
    }
    // The chevron is the same one, pointing the same way.
    const chevron = (element: HTMLElement) =>
      getComputedStyle(element.querySelector(".fold-chevron")!);
    expect(chevron(toggle()).width).toBe(chevron(filtersToggle()).width);
    expect(chevron(toggle()).transform).toBe(
      chevron(filtersToggle()).transform,
    );
  });

  it("fits a phone: the row wraps under the title, as the filters' row does, and nothing scrolls", async () => {
    await page.viewport(375, 800);
    drawn();

    expect(
      document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ).toBe(true);
    expect(rect(toggle()).left).toBeGreaterThanOrEqual(rect(heading()).left);
    expect(rect(toggle()).right).toBeLessThanOrEqual(window.innerWidth);
    // Under the title, as step 2's row wraps under its: on nothing of the
    // step's own title, and the step's chevron stays on the title's row.
    const title = step().querySelector<HTMLElement>(".fold-title")!;
    const chevron = stepChevron();
    expect(rect(toggle()).top).toBeGreaterThanOrEqual(rect(title).bottom);
    expect(rect(chevron).bottom).toBeLessThanOrEqual(rect(toggle()).top);
    expect(rect(chevron).top).toBeGreaterThanOrEqual(rect(heading()).top);
    expect(contentRight(step()) - rect(chevron).right).toBeLessThanOrEqual(8);
  });
});

describe("the Session fold, on a narrow page that would still hold it beside the title", () => {
  it("puts the row under the title and keeps the step's chevron on the title's row", async () => {
    await page.viewport(560, 800);
    drawn();
    const title = step().querySelector<HTMLElement>(".fold-title")!;

    // Room beside the title: the toggle's words and chevron would fit the rest
    // of the row (the toggle's own box is the whole row once it wraps).
    const own =
      rect(toggle().querySelector("span")!).width +
      rect(toggle().querySelector(".fold-chevron")!).width +
      16;
    expect(rect(title).right + 16 + own).toBeLessThan(
      contentRight(step()) - rect(stepChevron()).width - 16,
    );
    expect(rect(toggle()).top).toBeGreaterThanOrEqual(rect(title).bottom);
    expect(rect(stepChevron()).top).toBeLessThan(rect(title).bottom);
    expect(
      contentRight(step()) - rect(stepChevron()).right,
    ).toBeLessThanOrEqual(8);
  });
});

describe("the Session fold, with the key step folded", () => {
  /** The step folded by its own title, or by Apply once a key is applied. */
  async function folded({ applied = false } = {}) {
    drawn();
    if (applied) {
      await userEvent.fill(byId("demo-key"), "a-key");
      await userEvent.click(byId("demo-apply"));
    } else {
      await userEvent.click(step().querySelector(".fold-toggle")!);
    }
    await expect.poll(() => step().getAttribute("data-open")).toBe("false");
    await expect
      .poll(() => rect(step().querySelector(".fold-body")!).height)
      .toBe(0);
  }

  it("shows no row: just the step's own title, summary and chevron", async () => {
    await folded();

    expect(byId("demo-session-toggle")).toBeNull();
    expect(step().querySelectorAll(".fold-heading button")).toHaveLength(1);
    expect(step().querySelector(".fold-summary")?.textContent).toMatch(
      /not connected/i,
    );
  });

  it("draws the title row as every fold's is without a row: the same parts in the same places", async () => {
    await folded();

    const ours = parts(step());
    const theirs = beside(parts);

    for (const part of [
      "heading",
      "num",
      "title",
      "summary",
      "chevron",
    ] as const) {
      for (const edge of ["left", "right", "top", "height"] as const) {
        expect(
          Math.abs(ours[part][edge] - theirs[part][edge]),
          `${part}.${edge}`,
        ).toBeLessThanOrEqual(1);
      }
    }
    expect(ours.card.height).toBeCloseTo(theirs.card.height, 0);
  });

  it("keeps the summary to the row and the chevron at its end on a phone, as every fold does", async () => {
    await page.viewport(375, 800);
    await folded();

    const ours = parts(step());
    const theirs = beside(parts);

    expect(
      document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ).toBe(true);
    for (const part of ["heading", "title", "summary", "chevron"] as const) {
      for (const edge of ["left", "right", "top", "height"] as const) {
        expect(
          Math.abs(ours[part][edge] - theirs[part][edge]),
          `${part}.${edge}`,
        ).toBeLessThanOrEqual(1);
      }
    }
  });

  it("draws a connected step's summary where every fold draws it, on a desktop and on a phone", async () => {
    for (const width of [1280, 375]) {
      await page.viewport(width, 800);
      await folded({ applied: true });

      const summary = step().querySelector(".fold-summary")!;
      expect(summary.textContent).toMatch(/API key/);
      const ours = parts(step());
      const theirs = beside(parts, summary.innerHTML);

      for (const part of ["heading", "title", "summary", "chevron"] as const) {
        for (const edge of ["left", "right", "top", "height"] as const) {
          expect(
            Math.abs(ours[part][edge] - theirs[part][edge]),
            `${width}px ${part}.${edge}`,
          ).toBeLessThanOrEqual(1);
        }
      }
      expect(
        document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ).toBe(true);
      done?.();
      done = null;
    }
  });

  it("keeps the open step's chevron where every open fold's is, the row beside the title or not", async () => {
    drawn();

    const ours = parts(step());
    const theirs = beside(parts, undefined, true);

    for (const edge of ["right", "top", "height"] as const) {
      expect(
        Math.abs(ours.chevron[edge] - theirs.chevron[edge]),
        `chevron.${edge}`,
      ).toBeLessThanOrEqual(1);
    }
  });

  it("opens the step from anywhere on its title row, as it did", async () => {
    await folded();
    const fold = step().querySelector<HTMLElement>(".fold-toggle")!;
    const at = (element: Element) => {
      const { left, top, width, height } = rect(element);
      return document.elementFromPoint(left + width / 2, top + height / 2);
    };

    expect(at(step().querySelector(".fold-summary")!)?.closest("button")).toBe(
      fold,
    );
    expect(at(stepChevron())?.closest("button")).toBe(fold);
    expect(at(step().querySelector(".fold-title")!)?.closest("button")).toBe(
      fold,
    );
    (at(stepChevron()) as HTMLElement).click();
    await expect.poll(() => step().getAttribute("data-open")).toBe("true");
    expect(byId("demo-session-toggle")).not.toBeNull();
  });

  it("turns the same chevron over when the step folds and opens again, rather than drawing a new one", async () => {
    drawn();
    const chevron = stepChevron();

    await userEvent.click(step().querySelector(".fold-toggle")!);
    await expect.poll(() => step().getAttribute("data-open")).toBe("false");
    expect(stepChevron()).toBe(chevron);
    expect(byId("demo-session-toggle")).toBeNull();

    await userEvent.click(step().querySelector(".fold-toggle")!);
    await expect.poll(() => step().getAttribute("data-open")).toBe("true");
    expect(stepChevron()).toBe(chevron);
  });

  it("opens closed, the panel folded away with the step and the toggle drawn on the title again", async () => {
    drawn();
    await userEvent.click(toggle());
    await expect.poll(() => rect(panel()).height > 0).toBe(true);

    await userEvent.click(step().querySelector(".fold-toggle")!);
    await expect.poll(() => step().getAttribute("data-open")).toBe("false");
    await userEvent.click(step().querySelector(".fold-toggle")!);
    await expect.poll(() => step().getAttribute("data-open")).toBe("true");

    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    await expect.poll(() => rect(panel()).height).toBe(0);
    expect(rect(toggle()).bottom).toBeLessThanOrEqual(rect(heading()).bottom);
  });
});

describe("the Session fold, with a scope and a profile set, the key applied and the step opened again", () => {
  async function set({
    profile,
    routes = 0,
    rows = "",
  }: {
    profile: string;
    routes?: number;
    rows?: string;
  }) {
    drawn();
    flushSync(() => shiftClick(toggle()));
    for (const box of routeBoxes().slice(0, routes)) await userEvent.click(box);
    if (rows !== "") await userEvent.fill(rowsInput(), rows);
    await userEvent.selectOptions(profileSelect()!, "custom");
    await userEvent.fill(customText()!, profile);
    await userEvent.fill(byId("demo-key"), "a-key");
    await userEvent.click(byId("demo-apply"));
    await expect.poll(() => step().getAttribute("data-open")).toBe("false");
    // The step folds up over a third of a second.
    await expect
      .poll(() => rect(step().querySelector(".fold-body")!).height)
      .toBe(0);
    // The row is not on the folded step: it comes back with the step.
    expect(byId("demo-session-toggle")).toBeNull();
    await userEvent.click(step().querySelector(".fold-toggle")!);
    await expect.poll(() => step().getAttribute("data-open")).toBe("true");
  }

  it("names the profile on the title row of the step opened again, as step 2 names its count", async () => {
    await set({ profile: "tuned" });

    expect(toggle().textContent).toBe("Session · tuned");
    expect(rect(toggle()).top).toBeGreaterThanOrEqual(rect(heading()).top);
    expect(rect(toggle()).bottom).toBeLessThanOrEqual(rect(heading()).bottom);
    expect(rect(toggle()).right).toBeLessThanOrEqual(window.innerWidth);
  });

  it("names what is set, all of it, on the one title row", async () => {
    await set({ profile: "tuned", routes: 2, rows: "5" });

    expect(toggle().textContent).toBe(
      "Session · businesses, people · 5 rows · tuned",
    );
    expect(rect(toggle()).bottom).toBeLessThanOrEqual(rect(heading()).bottom);
    expect(rect(toggle()).right).toBeLessThanOrEqual(window.innerWidth);
  });

  it("wraps the toggle's words as one line of text on a phone, a short profile staying whole", async () => {
    await page.viewport(375, 800);
    await set({ profile: "tuned", routes: 3, rows: "20" });

    const value = toggle().querySelector(".link-toggle-value")!;
    const chevron = toggle().querySelector(".fold-chevron")!;

    // "tuned" is one word on one line: not split, not on a line of its own with
    // the chevron beside it.
    expect(value.getClientRects()).toHaveLength(1);
    expect(rect(value).width).toBeGreaterThan(20);
    expect(rect(chevron).left).toBeGreaterThanOrEqual(rect(value).right);
    // The words read from the left, as the filters' do.
    expect(getComputedStyle(toggle()).textAlign).toBe("left");
  });

  it("keeps a phone from scrolling, whatever the profile's length and the routes named", async () => {
    await page.viewport(375, 800);
    await set({ profile: "x".repeat(63), routes: 3, rows: "20" });

    expect(
      document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ).toBe(true);
    expect(rect(toggle()).right).toBeLessThanOrEqual(window.innerWidth);
  });
});

describe("the Session fold, open", () => {
  async function open({ reveal = false } = {}) {
    drawn();
    if (reveal) flushSync(() => shiftClick(toggle()));
    else await userEvent.click(toggle());
    await userEvent.click(filtersToggle());
    // Both panels unfold over a quarter of a second.
    await expect
      .poll(() => rect(panel()).height > 0 && rect(filters()).height > 0)
      .toBe(true);
  }

  it("is the filters' panel in look: its ground, its hairline and its padding", async () => {
    await open();
    const ours = getComputedStyle(panel());
    const theirs = getComputedStyle(filters());

    for (const property of [
      "backgroundColor",
      "borderTopWidth",
      "borderTopColor",
      "borderTopStyle",
      "borderTopLeftRadius",
      "paddingLeft",
      "paddingRight",
    ] as const) {
      expect(ours[property]).toBe(theirs[property]);
    }
    // And a full hairline: no accent down one side.
    expect(ours.borderLeftWidth).toBe(ours.borderTopWidth);
  });

  it("unfolds under the title row, over the step's own fields, as the filters' panel does under its", async () => {
    await open();
    const environment = environmentSelect();

    expect(rect(panel()).top).toBeGreaterThanOrEqual(rect(heading()).bottom);
    expect(rect(panel()).bottom).toBeLessThanOrEqual(rect(environment).top);
    expect(rect(panel()).left).toBeGreaterThanOrEqual(rect(step()).left);
    expect(rect(panel()).right).toBeLessThanOrEqual(rect(step()).right);
  });

  it("draws no match profile for a plain click, and the dropdown for a shift-click", async () => {
    await open();
    expect(profileSelect()).toBeNull();
    expect(customText()).toBeNull();
    expect(panel().textContent).not.toMatch(/profile/i);
    done?.();
    done = null;

    await open({ reveal: true });

    expect(profileSelect()).not.toBeNull();
    expect(rect(profileSelect()!).height).toBeGreaterThan(0);
  });

  it("holds the routes and the most rows drawn as the page's others", async () => {
    await open();
    const environment = environmentSelect();
    const boxes = routeBoxes();

    expect(boxes).toHaveLength(3);
    // One number field, as tall as the page's dropdown.
    expect(rect(rowsInput()).height).toBe(rect(environment).height);
    expect(getComputedStyle(rowsInput()).borderTopColor).toBe(
      getComputedStyle(environment).borderTopColor,
    );
    // The routes' toggles read in a row inside the panel, none out of it.
    for (const box of boxes) {
      const label = box.closest("label")!;
      expect(rect(label).left).toBeGreaterThanOrEqual(rect(panel()).left);
      expect(rect(label).right).toBeLessThanOrEqual(rect(panel()).right);
      expect(rect(label).height).toBeGreaterThanOrEqual(
        rect(environment).height - 1,
      );
    }
  });

  it("keeps the routes on one row, and no dropdown beside them stretched by it", async () => {
    await open({ reveal: true });

    const tops = routeBoxes().map(box =>
      Math.round(rect(box.closest("label")!).top),
    );
    expect(new Set(tops).size).toBe(1);
    // A dropdown's chevron is drawn against its wrapper: a wrapper taller than
    // the dropdown would draw it below the box.
    const select = profileSelect()!;
    expect(rect(select.parentElement!).height).toBe(rect(select).height);
    expect(rect(rowsInput()).height).toBe(rect(select).height);
  });

  it("holds the dropdown drawn as the page's others, and a text field once custom is chosen", async () => {
    await open({ reveal: true });
    const select = profileSelect()!;
    const environment = environmentSelect();

    expect(rect(select).height).toBe(rect(environment).height);
    expect(getComputedStyle(select).borderTopColor).toBe(
      getComputedStyle(environment).borderTopColor,
    );
    expect(customText()).toBeNull();

    await userEvent.selectOptions(select, "custom");
    const text = customText()!;

    expect(rect(text).height).toBe(rect(select).height);
    expect(rect(text).width).toBeGreaterThan(100);
  });

  it("keeps to the width of the step on a phone, every field showing", async () => {
    await page.viewport(375, 800);
    await open({ reveal: true });
    await userEvent.selectOptions(profileSelect()!, "custom");

    expect(
      document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ).toBe(true);
    expect(rect(panel()).right).toBeLessThanOrEqual(window.innerWidth);
    for (const field of [rowsInput(), profileSelect()!, customText()!]) {
      expect(rect(field).right).toBeLessThanOrEqual(rect(panel()).right);
    }
    for (const box of routeBoxes()) {
      expect(rect(box.closest("label")!).right).toBeLessThanOrEqual(
        rect(panel()).right,
      );
    }
  });

  it("folds up with everything it showed, the match profile row going with the rest and not before", async () => {
    await open({ reveal: true });
    const before = rect(panel()).height;

    // The same task as the click, before the first frame of the fold.
    flushSync(() => toggle().click());

    expect(profileSelect()).not.toBeNull();
    expect(rect(panel()).height).toBeGreaterThanOrEqual(before - 2);
    await expect.poll(() => getComputedStyle(panel()).display).toBe("none");
  });

  it("folds up and goes when closed, as the filters do", async () => {
    await open();

    await userEvent.click(toggle());

    await expect.poll(() => getComputedStyle(panel()).display).toBe("none");
    expect(rect(panel()).height).toBe(0);
  });
});

describe("the Session settings on the published page", () => {
  // The published build has `import.meta.env.DEV` off: a visitor sees the
  // key step as every fold is drawn, and a shift-click on its title brings the
  // toggle in.
  beforeEach(() => {
    vi.stubEnv("DEV", false);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const fold = () => step().querySelector<HTMLButtonElement>(".fold-toggle")!;
  const reveal = (element: Element = fold()) =>
    flushSync(() => shiftClick(element));
  /** The edges the title row is checked by, against a plain fold's. */
  const EDGES = ["left", "right", "top", "height"] as const;

  it("is drawn before the reveal as every fold is, with no toggle: the open step and the folded one", async () => {
    drawn();

    expect(toggle()).toBeNull();
    expect(panel()).toBeNull();
    expect(step().querySelectorAll(".fold-heading > *")).toHaveLength(1);
    for (const open of [true, false]) {
      if (!open) {
        await userEvent.click(fold());
        await expect.poll(() => step().getAttribute("data-open")).toBe("false");
        await expect
          .poll(() => rect(step().querySelector(".fold-body")!).height)
          .toBe(0);
      }
      const ours = parts(step());
      const theirs = beside(parts, undefined, open);

      for (const part of ["heading", "num", "title", "chevron"] as const) {
        for (const edge of EDGES) {
          expect(
            Math.abs(ours[part][edge] - theirs[part][edge]),
            `${open ? "open" : "folded"} ${part}.${edge}`,
          ).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("brings the toggle in on the title row, right after the title, and moves nothing else", () => {
    drawn();
    const before = parts(step());
    const keyTop = rect(byId("demo-key")).top;

    reveal();

    const after = parts(step());
    expect(toggle()).not.toBeNull();
    expect(rect(toggle()).left).toBeGreaterThanOrEqual(
      rect(heading().querySelector(".fold-title")!).right,
    );
    expect(rect(toggle()).top).toBeGreaterThanOrEqual(rect(heading()).top);
    expect(rect(toggle()).bottom).toBeLessThanOrEqual(
      rect(heading()).bottom + 1,
    );
    for (const part of ["heading", "title", "chevron"] as const) {
      for (const edge of EDGES) {
        expect(
          Math.abs(after[part][edge] - before[part][edge]),
          `${part}.${edge}`,
        ).toBeLessThanOrEqual(1);
      }
    }
    expect(Math.abs(rect(byId("demo-key")).top - keyTop)).toBeLessThanOrEqual(
      1,
    );
    expect(
      Math.abs(after.card.height - before.card.height),
    ).toBeLessThanOrEqual(1);
  });

  it("brings it in on a phone without moving the title or the chevron, and nothing scrolls", async () => {
    await page.viewport(375, 800);
    drawn();
    const before = parts(step());

    reveal();

    const after = parts(step());
    expect(toggle()).not.toBeNull();
    for (const part of ["title", "chevron"] as const) {
      for (const edge of EDGES) {
        expect(
          Math.abs(after[part][edge] - before[part][edge]),
          `${part}.${edge}`,
        ).toBeLessThanOrEqual(1);
      }
    }
    expect(
      document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ).toBe(true);
  });

  it("reveals from anywhere on a folded step's title row, and opens the step", async () => {
    drawn();
    await userEvent.click(fold());
    await expect.poll(() => step().getAttribute("data-open")).toBe("false");
    const at = (element: Element) => {
      const { left, top, width, height } = rect(element);
      return document.elementFromPoint(left + width / 2, top + height / 2)!;
    };

    reveal(at(stepChevron()));

    expect(step().getAttribute("data-open")).toBe("true");
    expect(toggle()).not.toBeNull();
    expect(toggle().textContent).toBe("+ Session settings");
  });

  it("reveals the toggle with Shift and Enter on the focused title, the click the browser makes from them, and Enter alone folds the step", async () => {
    drawn();
    fold().focus();

    await userEvent.keyboard("{Enter}");
    await expect.poll(() => step().getAttribute("data-open")).toBe("false");
    expect(toggle()).toBeNull();
    await userEvent.keyboard("{Enter}");
    await expect.poll(() => step().getAttribute("data-open")).toBe("true");
    expect(toggle()).toBeNull();

    await userEvent.keyboard("{Shift>}{Enter}{/Shift}");
    await expect.poll(() => toggle()).not.toBeNull();
    expect(step().getAttribute("data-open")).toBe("true");
    expect(document.activeElement).toBe(fold());
  });

  it("reveals it with Shift and Space on the focused title too", async () => {
    drawn();
    fold().focus();

    await userEvent.keyboard("{Shift>}{ }{/Shift}");

    await expect.poll(() => toggle()).not.toBeNull();
    expect(step().getAttribute("data-open")).toBe("true");
  });

  it("is the page's own toggle once revealed: it opens the filters' panel with the scope, under the title row", async () => {
    drawn();
    reveal();

    await userEvent.click(toggle());
    await expect.poll(() => rect(panel()).height > 0).toBe(true);

    expect(panel().classList.contains("filters-panel")).toBe(true);
    expect(profileSelect()).toBeNull();
    expect(routeBoxes().length).toBeGreaterThan(0);
    expect(rect(panel()).top).toBeGreaterThanOrEqual(
      rect(heading()).bottom - 1,
    );
    expect(step().contains(panel())).toBe(true);
  });
});
