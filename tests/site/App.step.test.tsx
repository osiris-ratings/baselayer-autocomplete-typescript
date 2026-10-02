/** @vitest-environment jsdom */
/// <reference types="vite/client" />

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../../site/demo/App";

// The third step belongs to the pick it was made from. Change the name or a
// filter and the pick is gone, so the step closes up and goes (and with it any
// search in flight). Run against the real page, with a fake API behind it.

const GRANT = {
  session_token: "session-token",
  expires_in: 300,
  request_budget: 50,
  pivot_allowance: 5,
  filter_min_stem: 3,
};

const ROW = {
  type: "business",
  token: "tok-cinder",
  label: "CINDER RIGGING, INC.",
  matched_name: null,
  match: "strong",
  domicile_state: "DE",
  states: ["DE"],
  structure: "C_CORPORATION",
  related: {
    people: { count: 0, matched: null, truncated: false, items: [] },
    addresses: { count: 0, matched: null, truncated: false, items: [] },
    liens: { count: null, matched: null, truncated: false, items: [] },
  },
  highlight: [],
};

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const fakeApi = vi.fn(async (input: RequestInfo | URL) => {
  const url = String(input);
  if (url.includes("/autocomplete/sessions")) {
    return reply(201, GRANT);
  }
  if (url.includes("/autocomplete/businesses")) {
    return reply(200, {
      query: new URL(url, "http://localhost").searchParams.get("q"),
      found: 1,
      found_capped: false,
      truncated: false,
      sources: {
        people: { status: "ok" },
        addresses: { status: "ok" },
        liens: { status: "not_requested" },
      },
      suggestions: [ROW],
    });
  }
  throw new Error(`the page called something unexpected: ${url}`);
});

beforeEach(() => {
  vi.stubGlobal("fetch", fakeApi);
  // jsdom has no layout, so none of the things a layout engine tells a page.
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({
        matches: false,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  );
  Element.prototype.scrollIntoView = () => {};
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fakeApi.mockClear();
});

// Not by role or label: the environment select is a combobox too, and the
// name's label labels its list as well.
const nameField = () => {
  const input = document.getElementById("demo-business-input");
  if (!(input instanceof HTMLInputElement)) {
    throw new Error("the business name field is not on the page");
  }
  return input;
};
const stepWrapper = () => screen.getByTestId("demo-step-exit");
const step = () => screen.queryByTestId("demo-search");
const isOpen = () => stepWrapper().dataset["open"];

/** Connects, opens the filters, types a name and picks the row it finds. */
async function pickABusiness() {
  const user = userEvent.setup();
  render(<App />);
  await user.type(screen.getByTestId("demo-key"), "a-key");
  await user.click(screen.getByTestId("demo-apply"));
  await screen.findByText(/key accepted/i);
  await user.click(screen.getByRole("button", { name: /add filters/i }));
  await user.type(nameField(), "cinder");
  await user.click(await screen.findByText("CINDER RIGGING, INC."));
  await waitFor(() => expect(step()).not.toBeNull());
  return user;
}

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
