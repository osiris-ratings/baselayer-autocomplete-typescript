/** @vitest-environment jsdom */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { App } from "../../site/demo/App";
import { answerSample } from "../../site/demo/sample-api";
import { useDemoPage } from "./support/demo-page";

// Switching the search in the title with a menu open carries the menu over:
// the new search's field takes the focus with its own kept text and answer.

useDemoPage();

const ALL = ["businesses", "people", "addresses"] as const;

/** A `fetch` the made-up API answers, each call kept to be counted. */
function sampleFetch() {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const path = url.slice(url.indexOf("/_baselayer") + "/_baselayer".length);
    const headers = Object.fromEntries(
      [...new Headers(init?.headers).entries()].map(([k, v]) => [k, v]),
    );
    const reply = answerSample(
      {
        method: init?.method ?? "GET",
        path,
        headers: { ...headers, origin: "http://localhost:3000" },
        body: typeof init?.body === "string" ? init.body : null,
      },
      { routes: ALL },
    );
    if (reply === null) {
      throw new Error(`the page called something unexpected: ${url}`);
    }
    return new Response(JSON.stringify(reply.body), {
      status: reply.status,
      headers: { "content-type": "application/json" },
    });
  });
}

async function connect() {
  const fetch = sampleFetch();
  vi.stubGlobal("fetch", fetch);
  const user = userEvent.setup();
  render(<App />);
  await user.type(screen.getByTestId("demo-key"), "any-key");
  await user.click(screen.getByTestId("demo-apply"));
  await screen.findByText(/key accepted/i);
  /** How many searches have gone to a route. */
  const asked = (route: string) =>
    fetch.mock.calls.filter(([input]) =>
      String(input).includes(`/autocomplete/${route}?`),
    ).length;
  return { user, asked };
}

const field = (id: string): HTMLInputElement =>
  document.getElementById(`${id}-input`) as HTMLInputElement;
const tab = (word: string) => screen.getByRole("tab", { name: word });
/** The options a field's open menu shows. */
const rows = (id: string) => {
  const list = document.getElementById(
    field(id).getAttribute("aria-controls") ?? "",
  );
  return list === null ? [] : within(list).queryAllByRole("option");
};

describe("switching the search with its menu open", () => {
  it("opens the new search's menu in its focused field, its kept answer asked for again nowhere", async () => {
    const { user, asked } = await connect();
    // The person search first, its text answered.
    await user.click(tab("a person"));
    await user.click(field("demo-person"));
    await user.type(field("demo-person"), "dana");
    await waitFor(() => expect(rows("demo-person").length).toBeGreaterThan(0));
    // Then a business, its menu open.
    await user.click(tab("a business"));
    await user.click(field("demo-business"));
    await user.type(field("demo-business"), "harbor");
    await waitFor(() =>
      expect(field("demo-business").getAttribute("aria-expanded")).toBe("true"),
    );
    const before = asked("people");

    await user.click(tab("a person"));

    await waitFor(() =>
      expect(document.activeElement).toBe(field("demo-person")),
    );
    expect(field("demo-person").value).toBe("dana");
    expect(field("demo-person").getAttribute("aria-expanded")).toBe("true");
    expect(rows("demo-person").length).toBeGreaterThan(0);
    await new Promise(resolve => setTimeout(resolve, 400));
    expect(asked("people")).toBe(before);
  });

  it("leaves the new search's menu closed, and its field unfocused, when the menu was closed", async () => {
    const { user } = await connect();
    await user.click(tab("a person"));
    await user.click(field("demo-person"));
    await user.type(field("demo-person"), "dana");
    await waitFor(() => expect(rows("demo-person").length).toBeGreaterThan(0));
    await user.click(tab("a business"));
    // Away from the field: nothing is open.
    await user.click(document.body);
    expect(field("demo-business").getAttribute("aria-expanded")).not.toBe(
      "true",
    );

    await user.click(tab("a person"));

    expect(document.activeElement).not.toBe(field("demo-person"));
    expect(field("demo-person").getAttribute("aria-expanded")).not.toBe("true");
  });

  it("leaves the focus on a Row of tab in Styling, which switches the search but carries no menu", async () => {
    const { user } = await connect();
    const styleHere = screen
      .queryAllByRole("button")
      .find(button => /Style here/.test(button.textContent ?? ""));
    await user.click(styleHere ?? screen.getByTestId("demo-switch-styling"));
    const components = screen
      .getAllByRole("button")
      .find(button => /Components/.test(button.textContent ?? ""))!;
    if (components.getAttribute("aria-expanded") === "false") {
      await user.click(components);
    }
    await user.click(field("demo-business"));
    await user.type(field("demo-business"), "harbor");
    const person = within(
      screen.getByRole("tablist", { name: "Row of" }),
    ).getByRole("tab", { name: "Person" });
    await user.click(person);
    expect(person.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(person);
  });

  it("keeps a hidden search on the filters it last searched with, so a filter set for the search in sight asks it nothing", async () => {
    const { user, asked } = await connect();
    await user.click(tab("a person"));
    await user.click(field("demo-person"));
    await user.type(field("demo-person"), "dana");
    await waitFor(() => expect(rows("demo-person").length).toBeGreaterThan(0));
    await user.click(tab("a business"));
    const before = asked("people");
    await user.click(screen.getByRole("button", { name: /Add filters/ }));
    await user.type(screen.getByPlaceholderText("PA, OH"), "PA");
    await new Promise(resolve => setTimeout(resolve, 400));
    expect(asked("people")).toBe(before);
  });

  it("forgets a focused field once a click lands elsewhere, so a later switch from the keyboard carries nothing", async () => {
    const { user } = await connect();
    await user.click(field("demo-business"));
    await user.type(field("demo-business"), "harbor");
    await user.click(document.body);
    tab("a business").focus();
    await user.keyboard("{ArrowRight}");
    expect(tab("a person").getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(tab("a person"));
    expect(field("demo-person").getAttribute("aria-expanded")).not.toBe("true");
  });

  it("switches from the keyboard as before, the focus kept on the words", async () => {
    const { user } = await connect();
    tab("a business").focus();
    await user.keyboard("{ArrowRight}");

    expect(tab("a person").getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(tab("a person"));
    expect(field("demo-person").getAttribute("aria-expanded")).not.toBe("true");
  });
});
