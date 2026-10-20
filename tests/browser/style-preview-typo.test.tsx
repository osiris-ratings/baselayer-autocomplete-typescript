import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";

import { App } from "../../site/demo/App";

import "../../src/react/styles.css";
import "../../site/shared/brand.css";
import "../../site/demo/demo.css";

// The Styling preview draws sample rows under the empty field, so a highlight
// can be styled before anything is typed. One row of each of the businesses and
// people previews is a typo the search found a name through, two letters of it
// swapped, so the two letters it corrected, side by side, can be styled too: the dotted underline, the stripes.

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

let done: (() => void) | null = null;
afterEach(() => {
  done?.();
  done = null;
  vi.unstubAllGlobals();
});

function mountApp() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("{}", { status: 404 })),
  );
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  flushSync(() => root.render(<App />));
  done = () => {
    root.unmount();
    host.remove();
  };
}

const tab = (name: string) =>
  [...document.querySelectorAll<HTMLElement>('[role="tab"]')].find(
    each => each.textContent === name,
  )!;

/** Opens Styling and its Components fold, where the searches' tabs are. */
async function openStyling() {
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
    .poll(() => document.querySelector(".demo-sample"))
    .not.toBeNull();
}

/** The corrected letters in the sample rows, each with the row it is in. */
const corrected = () =>
  [
    ...document.querySelectorAll<HTMLElement>(
      ".demo-sample .bl-ac-corrected[data-corrected='true']",
    ),
  ].map(letter => ({
    letter: letter.textContent,
    row: letter.closest("[role='option']")?.textContent ?? "",
  }));

describe("the Styling preview's typo", () => {
  it("is a corrected letter in the businesses' sample rows, with no key and nothing typed", async () => {
    mountApp();
    await openStyling();

    const found = corrected();
    expect(found).toHaveLength(1);
    expect(found[0]!.letter).toBe("RO");
    expect(found[0]!.row).toContain("HARBRO CONCRETE SUPPLY, INC.");
  });

  it("is a corrected letter in the people's sample rows", async () => {
    mountApp();
    await openStyling();
    await userEvent.click(tab("Person"));
    await wait(100);

    const found = corrected();
    expect(found).toHaveLength(1);
    expect(found[0]!.letter).toBe("an");
    expect(found[0]!.row).toContain("Daan Okafor");
  });

  it("is drawn as the underline emphasis draws it, dotted, which is the default", async () => {
    mountApp();
    await openStyling();
    const letter = document.querySelector<HTMLElement>(
      ".demo-sample .bl-ac-corrected",
    );

    expect(letter).not.toBeNull();
    expect(getComputedStyle(letter!).textDecorationStyle).toBe("dotted");
  });
});
