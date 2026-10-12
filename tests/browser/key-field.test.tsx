import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";

import { App } from "../../site/demo/App";
import { answerSample } from "../../site/demo/sample-api";

import "../../site/shared/brand.css";
import "../../site/demo/demo.css";

let done: (() => void) | null = null;
afterEach(() => {
  done?.();
  done = null;
  vi.unstubAllGlobals();
});

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

function drawn() {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  flushSync(() => root.render(<App />));
  done = () => {
    root.unmount();
    host.remove();
  };
  return document.querySelector<HTMLInputElement>('[data-testid="demo-key"]')!;
}

// The key is no password to a browser: Chrome and Safari offer to keep a
// password field's value and to fill it, and so do the password managers.
describe("the API key field", () => {
  it("is a masked search field the browsers and the password managers leave alone", () => {
    const key = drawn();

    // This engine masks a field, so the key is not a password field; nor a
    // plain text one, which Safari takes for a password field once it is
    // masked. A search field it leaves alone.
    expect(key.type).toBe("search");
    expect(key.getAttribute("role")).toBe("textbox");
    expect(
      getComputedStyle(key).getPropertyValue("-webkit-text-security"),
    ).toBe("disc");
    expect(key.autocomplete).toBe("off");
    expect(key.getAttribute("autocapitalize")).toBe("off");
    expect(key.getAttribute("autocorrect")).toBe("off");
    expect(key.spellcheck).toBe(false);
    for (const attribute of [
      "data-1p-ignore",
      "data-lpignore",
      "data-bwignore",
    ]) {
      expect(key.hasAttribute(attribute)).toBe(true);
    }
    expect(key.closest("form")).toBeNull();
  });

  it("is not the only field a browser is told to leave alone: the three searches and the filters are too", async () => {
    vi.stubGlobal("fetch", sampleFetch());
    drawn();
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

    const fields = [
      ...document.querySelectorAll<HTMLInputElement>(
        "#demo-business-input, #demo-person-input, #demo-address-input, #demo-filters input",
      ),
    ];
    // The three searches and the three filters a search leaves out of its own.
    expect(fields.length).toBeGreaterThanOrEqual(6);
    for (const field of fields) {
      const named = `${field.id || field.placeholder}`;
      expect([named, field.autocomplete]).toEqual([named, "off"]);
      expect([named, field.getAttribute("autocorrect")]).toEqual([
        named,
        "off",
      ]);
      expect([named, field.getAttribute("autocapitalize")]).toEqual([
        named,
        "off",
      ]);
      expect([named, field.spellcheck]).toEqual([named, false]);
      expect([named, field.hasAttribute("data-1p-ignore")]).toEqual([
        named,
        true,
      ]);
    }
  });
});
