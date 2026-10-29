import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";

import { App } from "../../site/demo/App";

import "../../src/react/styles.css";
import "../../site/shared/brand.css";
import "../../site/demo/demo.css";

// The Styling panel's Menu width: the preview's menu is drawn as the choice
// says, and the code the panel exports names it.

const EM = 16;

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

const fold = (title: string) =>
  [
    ...document.querySelectorAll<HTMLButtonElement>("button[aria-expanded]"),
  ].find(button => button.textContent?.trim().startsWith(title));

/** Opens Styling, its Components fold, where the preview is, and its Shape and size fold. */
async function openShape() {
  await userEvent.click(
    document.querySelector<HTMLElement>('[data-testid="demo-styling-open"]')!,
  );
  for (const title of ["Components", "Shape and size"]) {
    await expect.poll(() => fold(title)).toBeDefined();
    if (fold(title)!.getAttribute("aria-expanded") !== "true") {
      await userEvent.click(fold(title)!);
    }
  }
  await expect
    .poll(() => document.querySelector(".demo-sample .bl-ac")?.clientWidth)
    .toBeGreaterThan(200);
}

const widthSelect = () =>
  [...document.querySelectorAll<HTMLLabelElement>("label.field-row")]
    .find(row => row.textContent?.startsWith("Menu width"))
    ?.querySelector("select");

/** The preview's field, whose width is the input's, and the menu it draws. */
const sample = () => ({
  input: document.querySelector(".demo-sample .bl-ac")!.getBoundingClientRect()
    .width,
  menu: document
    .querySelector('.demo-sample [data-testid="autocomplete-menu"]')!
    .getBoundingClientRect().width,
});

describe("the Styling panel's menu width", () => {
  it("is the input's by default, and is a choice among the presets and a width of its own", async () => {
    mountApp();
    await openShape();

    const select = widthSelect()!;
    expect(select.value).toBe("input");
    expect([...select.options].map(option => option.value)).toEqual([
      "input",
      "wide",
      "fixed",
      "custom",
    ]);
    const { input, menu } = sample();
    expect(input).toBeGreaterThan(200);
    expect(menu).toBe(input);
  });

  it("draws the preview's menu wider than its field for 'wide', and 560px for 'fixed'", async () => {
    mountApp();
    await openShape();
    const room = () => {
      const { input, menu } = sample();
      return menu - input;
    };

    await userEvent.selectOptions(widthSelect()!, "wide");
    await expect.poll(room).toBe(3.5 * EM);

    await userEvent.selectOptions(widthSelect()!, "fixed");
    await expect.poll(() => sample().menu).toBe(560);

    await userEvent.selectOptions(widthSelect()!, "input");
    await expect.poll(room).toBe(0);
  });

  it("leaves the menu room in the card, and no menu is wider than the card", async () => {
    mountApp();
    await openShape();
    const card = () =>
      document.querySelector(".demo-preview")!.getBoundingClientRect();
    const { input } = sample();

    await userEvent.selectOptions(widthSelect()!, "wide");
    // The field gives up the room the wide menu takes, so it is not clipped.
    await expect.poll(() => sample().input).toBe(input - 4 * EM);
    expect(sample().menu).toBeLessThanOrEqual(card().width);

    await userEvent.selectOptions(widthSelect()!, "custom");
    await userEvent.fill(
      document.querySelector<HTMLInputElement>(
        "label.field-row:has(.field-label) input[placeholder='calc(100% + 56px)']",
      )!,
      "100rem",
    );
    await expect.poll(() => sample().menu).toBe(sample().input + 4 * EM);
    expect(sample().menu).toBeLessThanOrEqual(card().width);
  });

  it("takes a width of its own from a field that shows only then", async () => {
    mountApp();
    await openShape();
    const field = () =>
      [...document.querySelectorAll<HTMLLabelElement>("label.field-row")]
        .find(row => row.querySelector(".field-label")?.textContent === "Width")
        ?.querySelector("input");
    expect(field()).toBeUndefined();

    await userEvent.selectOptions(widthSelect()!, "custom");
    await expect.poll(field).toBeDefined();
    // The one it starts with: the field's width and 56px more.
    await expect.poll(() => sample().menu - sample().input).toBe(56);

    await userEvent.fill(field()!, "420");
    await expect.poll(() => sample().menu).toBe(420);

    await userEvent.fill(field()!, "30rem");
    await expect.poll(() => sample().menu).toBe(30 * EM);
  });

  it("says so when what was typed is not a width, and the menu stays the input's", async () => {
    mountApp();
    await openShape();
    const field = () =>
      [...document.querySelectorAll<HTMLLabelElement>("label.field-row")]
        .find(row => row.querySelector(".field-label")?.textContent === "Width")
        ?.querySelector("input");
    await userEvent.selectOptions(widthSelect()!, "custom");
    await expect.poll(field).toBeDefined();
    expect(field()!.getAttribute("aria-invalid")).toBeNull();

    await userEvent.fill(field()!, "calc(100% + 56)");

    await expect.poll(() => field()!.getAttribute("aria-invalid")).toBe("true");
    expect(field()!.closest("label")!.textContent).toContain("not a width");
    await expect.poll(() => sample().menu - sample().input).toBe(0);
    const exported = [...document.querySelectorAll("pre")]
      .map(pre => pre.textContent)
      .join("\n");
    expect(exported).not.toContain("menuWidth");
  });

  it("adds the width field after every other, so choosing a width of its own moves nothing", async () => {
    mountApp();
    await openShape();
    const fold = widthSelect()!.closest("section.fold")!;
    const tops = () =>
      [...fold.querySelectorAll<HTMLElement>("label.field-row")].map(
        row => row.getBoundingClientRect().top,
      );
    const before = tops();
    expect(before.length).toBeGreaterThan(3);

    await userEvent.selectOptions(widthSelect()!, "custom");
    await expect.poll(() => tops().length).toBe(before.length + 1);

    expect(tops().slice(0, before.length)).toEqual(before);
    // And it is the fold's last, with the select it belongs to just before it.
    const rows = [...fold.querySelectorAll("label.field-row")];
    expect(rows.at(-2)).toBe(widthSelect()!.closest("label"));
    expect(rows.at(-1)!.querySelector(".field-label")!.textContent).toBe(
      "Width",
    );
  });

  it("names the width in the code it exports", async () => {
    mountApp();
    await openShape();
    const exported = () =>
      [...document.querySelectorAll("pre")]
        .map(pre => pre.textContent)
        .join("\n");

    await userEvent.selectOptions(widthSelect()!, "wide");
    await expect.poll(exported).toContain('menuWidth="wide"');
  });
});
