/// <reference types="vite/client" />

// The demo page in a test: the real App with a fake API behind it, and a way to
// connect and pick a business on it. Call `useDemoPage()` once at the top of a
// test file.

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, vi } from "vitest";

import { App } from "../../../site/demo/App";

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

/** The API behind the page: it mints a session, and finds the same business for any name. */
export const fakeApi = vi.fn(async (input: RequestInfo | URL) => {
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

/** Puts the fake API and the browser's missing parts in place, and takes them away. */
export function useDemoPage(): void {
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
}

// Not by role or label: the environment select is a combobox too, and the
// name's label labels its list as well.
export const nameField = (): HTMLInputElement => {
  const input = document.getElementById("demo-business-input");
  if (!(input instanceof HTMLInputElement)) {
    throw new Error("the business name field is not on the page");
  }
  return input;
};

/** The third step's slot, which is on the page whether or not the step is. */
export const stepWrapper = (): HTMLElement =>
  screen.getByTestId("demo-step-exit");

/** The third step itself, or null when there is none. */
export const step = (): HTMLElement | null =>
  screen.queryByTestId("demo-search");

/** Whether the slot is open: "true" or "false". */
export const isOpen = (): string | undefined => stepWrapper().dataset["open"];

/** Connects, opens the filters, types a name and picks the row it finds. */
export async function pickABusiness() {
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
