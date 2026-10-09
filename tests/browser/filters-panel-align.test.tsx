import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";

import { App } from "../../site/demo/App";
import { answerSample } from "../../site/demo/sample-api";

import "../../site/shared/brand.css";
import "../../site/shared/fonts";
import "../../site/demo/demo.css";

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
afterEach(async () => {
  done?.();
  done = null;
  vi.unstubAllGlobals();
  await page.viewport(1280, 900);
});

async function connected() {
  vi.stubGlobal("fetch", sampleFetch());
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  flushSync(() => root.render(<App />));
  done = () => {
    root.unmount();
    host.remove();
  };
  await userEvent.fill(
    document.querySelector<HTMLInputElement>('[data-testid="demo-key"]')!,
    "any-key",
  );
  await userEvent.click(
    document.querySelector<HTMLElement>('[data-testid="demo-apply"]')!,
  );
  await expect
    .poll(() => document.body.textContent?.match(/key accepted/i))
    .not.toBeNull();
  await userEvent.click(
    [...document.querySelectorAll<HTMLButtonElement>("button")].find(button =>
      /Add filters/.test(button.textContent ?? ""),
    )!,
  );
}

const tab = (name: string) =>
  [...document.querySelectorAll<HTMLElement>('[role="tab"]')].find(
    each => each.textContent === name,
  )!;

/** The panel's fields in lines, each line the fields side by side. */
function lines(): HTMLElement[][] {
  const fields = [
    ...document.querySelectorAll<HTMLElement>("#demo-filters > .field-row"),
  ];
  const byTop = new Map<number, HTMLElement[]>();
  for (const field of fields) {
    const top = Math.round(field.getBoundingClientRect().top);
    byTop.set(top, [...(byTop.get(top) ?? []), field]);
  }
  return [...byTop.values()];
}

const top = (element: Element | null) => element!.getBoundingClientRect().top;

describe("the Add filters panel", () => {
  for (const width of [1280, 1024, 800]) {
    it(`starts every input side by side on one line, and every hint on the next, in each search's panel at ${width}px`, async () => {
      await page.viewport(width, 900);
      await connected();
      const panel = document.getElementById("demo-filters")!;
      for (const search of ["a business", "a person", "an address"]) {
        await userEvent.click(tab(search));
        await expect
          .poll(() => panel.querySelectorAll(".field-row").length)
          .toBe(3);
        expect(panel.getBoundingClientRect().width).toBeGreaterThanOrEqual(560);
        const sideBySide = lines().filter(line => line.length > 1);
        expect(sideBySide.length, search).toBeGreaterThan(0);
        for (const line of sideBySide) {
          const names = line.map(
            field => field.querySelector(".field-label")!.textContent,
          );
          const inputs = line.map(field => top(field.querySelector("input")));
          expect(
            Math.max(...inputs) - Math.min(...inputs),
            `${search}: ${names.join(" | ")} inputs at ${inputs.join(", ")}`,
          ).toBeLessThanOrEqual(0.5);
          const hints = line
            .map(field => field.querySelector(".field-hint"))
            .filter(hint => hint !== null)
            .map(top);
          if (hints.length > 1) {
            expect(
              Math.max(...hints) - Math.min(...hints),
              `${search}: hints at ${hints.join(", ")}`,
            ).toBeLessThanOrEqual(0.5);
          }
        }
      }
    });
  }
});
