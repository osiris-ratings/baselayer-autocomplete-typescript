import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";

import { App } from "../../site/demo/App";
import { answerSample } from "../../site/demo/sample-api";

import "../../site/shared/brand.css";
import "../../site/shared/fonts";
import "../../site/demo/demo.css";

// The key step's Session fold in a real layout engine: closed it is one row
// and nothing else, and opened it is drawn as step 2's filters are.

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

describe("the Session fold, closed", () => {
  it("is not drawn: the panel takes no room and nothing in it can be reached", async () => {
    drawn();

    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    expect(getComputedStyle(panel()).display).toBe("none");
    expect(rect(panel()).height).toBe(0);
    // Tab from the key to Apply to the row, and on past it: never into the
    // panel's dropdown.
    await userEvent.fill(byId("demo-key"), "a-key");
    byId("demo-key").focus();
    await userEvent.tab();
    expect(document.activeElement).toBe(byId("demo-apply"));
    await userEvent.tab();
    expect(document.activeElement).toBe(toggle());
    await userEvent.tab();
    expect(panel().contains(document.activeElement)).toBe(false);
  });

  it("adds one row to the key step and moves nothing else in it", () => {
    drawn();
    const section = byId("demo-connect");
    const row = toggle().parentElement!;
    const key = byId("demo-key");
    const apply = byId("demo-apply");
    const keyTop = rect(key).top;
    const applyTop = rect(apply).top;
    const withRow = rect(section).height;

    row.style.display = "none";
    const withoutRow = rect(section).height;
    const keyWithout = rect(key).top;
    const applyWithout = rect(apply).top;
    row.style.display = "";

    // The key and its button stand where they would without the row, which
    // comes after them, and the step is as much taller as the row is.
    expect(keyTop).toBe(keyWithout);
    expect(applyTop).toBe(applyWithout);
    expect(rect(toggle()).top).toBeGreaterThanOrEqual(rect(apply).bottom);
    expect(withRow - withoutRow).toBeGreaterThan(0);
    expect(withRow - withoutRow).toBeLessThanOrEqual(
      rect(toggle()).height + 12,
    );
    // One line, as the filters' row is.
    expect(rect(toggle()).height).toBeLessThanOrEqual(
      rect(filtersToggle()).height + 1,
    );
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

  it("fits a phone, in a row", async () => {
    await page.viewport(375, 800);
    drawn();

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

  it("holds the dropdown drawn as the page's others, and a text field once custom is chosen", async () => {
    await open();
    const select = panel().querySelector<HTMLSelectElement>("select")!;
    const environment = document.querySelector<HTMLSelectElement>(
      '[data-testid="demo-connect"] select',
    )!;

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
