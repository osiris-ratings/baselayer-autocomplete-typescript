import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";

import { App } from "../../site/demo/App";
import { answerSample } from "../../site/demo/sample-api";

import "../../site/shared/brand.css";
import "../../site/demo/demo.css";

// The demo against the made-up API `DEMO_API=sample` serves.
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

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

let done: (() => void) | null = null;
afterEach(() => {
  done?.();
  done = null;
  vi.unstubAllGlobals();
});

function mountApp() {
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

/** Opens Styling and its Components fold, as a visitor does. */
async function openComponents() {
  await userEvent.click(
    document.querySelector<HTMLElement>('[data-testid="demo-styling-open"]')!,
  );
  const fold = () =>
    [
      ...document.querySelectorAll<HTMLButtonElement>("button[aria-expanded]"),
    ].find(button => button.textContent?.trim().startsWith("Components"));
  await expect.poll(fold).toBeDefined();
  if (fold()!.getAttribute("aria-expanded") !== "true") {
    await userEvent.click(fold()!);
  }
  await expect
    .poll(() => document.querySelector(".row-map-icon"))
    .not.toBeNull();
}

const tab = (name: string) =>
  [...document.querySelectorAll<HTMLElement>('[role="tab"]')].find(
    each => each.textContent === name,
  )!;

/**
 * Puts each icon a row map's chip can put on or off, on a search's tab, and
 * counts the glyphs drawn in `where` before and after each.
 */
async function toggleEach(name: string, where: () => Element | null) {
  const toggles = [
    ...document.querySelectorAll<HTMLButtonElement>(".row-map-icon"),
  ].filter(toggle => !toggle.disabled);
  expect(toggles.length, name).toBeGreaterThan(0);
  for (const toggle of toggles) {
    const count = () => where()!.querySelectorAll("[data-glyph]").length;
    const before = count();
    const was = toggle.getAttribute("aria-pressed");
    await userEvent.click(toggle);
    await wait(50);
    expect(toggle.getAttribute("aria-pressed")).not.toBe(was);
    expect(count(), `${name} ${toggle.dataset.segment}`).not.toBe(before);
  }
}

describe("a segment's icon, put on or off from the row map", () => {
  it("draws on or off in the sample rows, on every search's row", async () => {
    mountApp();
    await openComponents();
    for (const name of ["Business", "Person", "Address"]) {
      await userEvent.click(tab(name));
      await wait(100);
      await toggleEach(name, () => document.querySelector(".demo-sample"));
    }
  });

  it("draws on or off in the live menu, on every search's row", async () => {
    mountApp();
    await userEvent.type(
      document.querySelector<HTMLElement>('[data-testid="demo-key"]')!,
      "any-key",
    );
    await userEvent.click(
      document.querySelector<HTMLElement>('[data-testid="demo-apply"]')!,
    );
    await wait(400);
    await openComponents();
    // The tabs share one field: each search is typed just before its icons
    // are put on and off.
    const field: Record<string, [string, string]> = {
      Business: ["demo-business", "harbor"],
      Person: ["demo-person", "dana"],
      Address: ["demo-address", "tallowmere"],
    };
    for (const name of ["Business", "Person", "Address"]) {
      await userEvent.click(tab(name));
      await wait(150);
      const [id, query] = field[name]!;
      const input = document.getElementById(`${id}-input`) as HTMLInputElement;
      await userEvent.clear(input);
      await userEvent.type(input, query);
      await wait(700);
      await toggleEach(name, () => document.getElementById(`${id}-menu`));
    }
  });
});
