import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { App } from "../../site/demo/App";

import "../../site/shared/brand.css";
import "../../site/demo/demo.css";

let done: (() => void) | null = null;
afterEach(() => {
  done?.();
  done = null;
});

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
  it("is a masked text field the browsers and the password managers leave alone", () => {
    const key = drawn();

    // This engine masks a text field, so the key is not a password field.
    expect(key.type).toBe("text");
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
});
