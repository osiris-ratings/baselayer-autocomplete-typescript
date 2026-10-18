import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";

import { App } from "../../site/demo/App";
import { answerSample } from "../../site/demo/sample-api";

import "../../site/shared/brand.css";
import "../../site/shared/fonts";
import "../../site/demo/demo.css";

// The key step's Session fold in a real layout engine: closed it is one row on
// the step's title, as step 2's filters are on its title, and nothing else;
// opened it is drawn as step 2's filters are.

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
/** The key step's title row: its heading, with the fold's button and ours. */
const heading = () => toggle().closest("h2")!;
/** The step's Environment dropdown: its first, once the panel's is set apart. */
const environmentSelect = () =>
  [...step().querySelectorAll<HTMLSelectElement>("select")].find(
    select => !panel().contains(select),
  )!;
const step = () => byId("demo-connect");
/** Step 2's title row: the title and the filters' button. */
const filtersHead = () =>
  filtersToggle().closest<HTMLElement>(".demo-card-head")!;
/** Where a card's own content ends on the right: its edge less its padding. */
const contentRight = (card: Element) =>
  rect(card).right -
  parseFloat(getComputedStyle(card).paddingRight) -
  parseFloat(getComputedStyle(card).borderRightWidth);

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

  it("is on the title row, at its end, as step 2's filters row is on its title row", () => {
    drawn();
    const title = step().querySelector<HTMLElement>(".fold-title")!;

    // On the heading's row, after the title, within the heading.
    expect(rect(toggle()).left).toBeGreaterThan(rect(title).right);
    expect(rect(toggle()).top).toBeGreaterThanOrEqual(rect(heading()).top);
    expect(rect(toggle()).bottom).toBeLessThanOrEqual(rect(heading()).bottom);
    // At the card's content edge, as the filters' row is at its card's.
    expect(contentRight(step()) - rect(toggle()).right).toBeCloseTo(
      contentRight(filtersHead().closest("section")!) -
        rect(filtersToggle()).right,
      0,
    );
    // Sharing the title's baseline, as step 2's row does: the same alignment.
    expect(getComputedStyle(heading()).alignItems).toBe(
      getComputedStyle(filtersHead()).alignItems,
    );
    expect(rect(toggle()).top).toBeGreaterThanOrEqual(rect(title).top - 1);
    expect(rect(toggle()).bottom).toBeLessThanOrEqual(rect(title).bottom + 1);
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
    // step's own title, its fold's chevron or its button.
    const fold = step().querySelector<HTMLElement>(".fold-toggle")!;
    expect(rect(toggle()).top).toBeGreaterThanOrEqual(rect(fold).bottom);
    for (const part of [
      step().querySelector(".fold-title")!,
      step().querySelector(".fold-toggle .fold-chevron")!,
    ]) {
      expect(rect(toggle()).top).toBeGreaterThanOrEqual(rect(part).bottom);
    }
  });
});

describe("the Session fold, with a profile set and the key applied", () => {
  async function set(profile: string) {
    drawn();
    await userEvent.click(toggle());
    const select = panel().querySelector<HTMLSelectElement>("select")!;
    await userEvent.selectOptions(select, "custom");
    await userEvent.fill(panel().querySelector("input")!, profile);
    await userEvent.fill(byId("demo-key"), "a-key");
    await userEvent.click(byId("demo-apply"));
    await expect.poll(() => step().getAttribute("data-open")).toBe("false");
    // The step folds up over a third of a second.
    await expect
      .poll(() => rect(step().querySelector(".fold-body")!).height)
      .toBe(0);
  }

  it("names the profile on the title row of the folded step, as step 2 names its count", async () => {
    await set("max");

    expect(toggle().textContent).toBe("Session · max");
    expect(rect(toggle()).top).toBeGreaterThanOrEqual(rect(heading()).top);
    expect(rect(toggle()).bottom).toBeLessThanOrEqual(rect(heading()).bottom);
    expect(rect(toggle()).right).toBeLessThanOrEqual(window.innerWidth);
  });

  it("keeps a phone from scrolling, whatever the profile's length", async () => {
    await page.viewport(375, 800);
    await set("x".repeat(63));

    expect(
      document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ).toBe(true);
    expect(rect(toggle()).right).toBeLessThanOrEqual(window.innerWidth);
  });
});

describe("the Session fold, open", () => {
  async function open() {
    drawn();
    await userEvent.click(toggle());
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

  it("holds the dropdown drawn as the page's others, and a text field once custom is chosen", async () => {
    await open();
    const select = panel().querySelector<HTMLSelectElement>("select")!;
    const environment = environmentSelect();

    expect(rect(select).height).toBe(rect(environment).height);
    expect(getComputedStyle(select).borderTopColor).toBe(
      getComputedStyle(environment).borderTopColor,
    );
    expect(panel().querySelector("input")).toBeNull();

    await userEvent.selectOptions(select, "custom");
    const text = panel().querySelector<HTMLInputElement>("input")!;

    expect(rect(text).height).toBe(rect(select).height);
    expect(rect(text).width).toBeGreaterThan(100);
  });

  it("keeps to the width of the step on a phone", async () => {
    await page.viewport(375, 800);
    await open();
    await userEvent.selectOptions(
      panel().querySelector<HTMLSelectElement>("select")!,
      "custom",
    );

    expect(
      document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ).toBe(true);
    expect(rect(panel()).right).toBeLessThanOrEqual(window.innerWidth);
  });

  it("folds up and goes when closed, as the filters do", async () => {
    await open();

    await userEvent.click(toggle());

    await expect.poll(() => getComputedStyle(panel()).display).toBe("none");
    expect(rect(panel()).height).toBe(0);
  });
});
