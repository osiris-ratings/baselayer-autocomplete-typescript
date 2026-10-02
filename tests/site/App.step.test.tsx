/** @vitest-environment jsdom */

import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { App } from "../../site/demo/App";
import {
  isOpen,
  nameField,
  pickABusiness,
  step,
  stepWrapper,
  useDemoPage,
} from "./support/demo-page";

// The third step belongs to the pick it was made from. Change the name or a
// filter and the pick is gone, so the step closes up and goes (and with it any
// search in flight). Run against the real page, with a fake API behind it.

useDemoPage();

describe("the third step, when what it was made from changes", () => {
  it("has its slot on the page before any pick, closed and empty", () => {
    render(<App />);

    expect(isOpen()).toBe("false");
    expect(stepWrapper().hasAttribute("inert")).toBe(true);
    expect(step()).toBeNull();
  });

  it("is there once a business is picked, and stays while nothing changes", async () => {
    await pickABusiness();

    await new Promise(resolve => setTimeout(resolve, 450));

    expect(step()).not.toBeNull();
    expect(isOpen()).toBe("true");
    expect(stepWrapper().hasAttribute("inert")).toBe(false);
  });

  it.each([
    ["the officer filter", "dana"],
    ["the states filter", "PA, OH"],
    ["the address filter", "1200 River Rd"],
  ])("closes up and goes when %s is typed in", async (_name, placeholder) => {
    const user = await pickABusiness();

    await user.type(screen.getByPlaceholderText(placeholder), "x");

    // It is still there, closing; then it is gone.
    expect(isOpen()).toBe("false");
    expect(step()).not.toBeNull();
    await waitFor(() => expect(step()).toBeNull(), { timeout: 1500 });
  });

  it("closes up and goes when the name is edited", async () => {
    const user = await pickABusiness();

    await user.type(nameField(), "{Backspace}");

    expect(isOpen()).toBe("false");
    await waitFor(() => expect(step()).toBeNull(), { timeout: 1500 });
  });

  it("puts the closing step out of reach of the keyboard and of screen readers", async () => {
    const user = await pickABusiness();

    await user.type(screen.getByPlaceholderText("dana"), "x");

    expect(stepWrapper().getAttribute("aria-hidden")).toBe("true");
    expect(stepWrapper().hasAttribute("inert")).toBe(true);
  });

  it("leaves its slot, empty, when the step is taken away, so that the column does not change", async () => {
    const user = await pickABusiness();

    await user.type(screen.getByPlaceholderText("dana"), "x");
    await waitFor(() => expect(step()).toBeNull(), { timeout: 1500 });

    expect(stepWrapper().firstElementChild?.childElementCount).toBe(0);
    expect(isOpen()).toBe("false");
  });

  it("comes back, whole, for the next pick", async () => {
    const user = await pickABusiness();
    await user.type(screen.getByPlaceholderText("dana"), "x");
    await waitFor(() => expect(step()).toBeNull(), { timeout: 1500 });

    // The filter stays set, as the typed name does: pick again.
    await user.clear(nameField());
    await user.type(nameField(), "cinder");
    await user.click(await screen.findByText("CINDER RIGGING, INC."));

    await waitFor(() => expect(step()).not.toBeNull());
    expect(isOpen()).toBe("true");
    expect(stepWrapper().hasAttribute("inert")).toBe(false);
  });

  it("can be picked again once a filter is put back, without touching the name", async () => {
    const user = await pickABusiness();
    await user.type(screen.getByPlaceholderText("dana"), "x");
    await user.clear(screen.getByPlaceholderText("dana"));
    await waitFor(() => expect(step()).toBeNull(), { timeout: 1500 });

    // The name is as it was picked, and its rows are back to pick from.
    const rows = await screen.findAllByTestId("business-suggestion");
    await user.click(rows[0]!);

    await waitFor(() => expect(step()).not.toBeNull());
    expect(isOpen()).toBe("true");
  });

  it("is dropped, not kept, if the filter is put back as it was", async () => {
    const user = await pickABusiness();

    await user.type(screen.getByPlaceholderText("dana"), "x");
    await user.clear(screen.getByPlaceholderText("dana"));

    await waitFor(() => expect(step()).toBeNull(), { timeout: 1500 });
    expect(isOpen()).toBe("false");
  });
});
