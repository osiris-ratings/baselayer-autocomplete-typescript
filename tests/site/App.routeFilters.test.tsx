/** @vitest-environment jsdom */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { App } from "../../site/demo/App";
import { answerSample } from "../../site/demo/sample-api";
import { useDemoPage } from "./support/demo-page";

// The filters each search takes, in the demo's Add filters panel, against the
// made-up API `DEMO_API=sample` serves.

useDemoPage();

const ALL = ["businesses", "people", "addresses"] as const;

/** A `fetch` the made-up API answers, each URL asked kept. */
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
  /** The last search a route was asked, as its parameters. */
  const last = (route: string) => {
    const asked = fetch.mock.calls
      .map(([input]) => String(input))
      .filter(url => url.includes(`/autocomplete/${route}?`));
    return asked.length === 0
      ? null
      : Object.fromEntries(new URL(asked.at(-1)!).searchParams);
  };
  return { user, last };
}

const field = (id: string): HTMLInputElement =>
  document.getElementById(`${id}-input`) as HTMLInputElement;

/**
 * A filter's field by its label, in the Add filters panel: every search
 * stays mounted, so the page has a business search's own "Business name" too.
 */
const filter = (label: RegExp): HTMLInputElement =>
  within(document.getElementById("demo-filters")!).getByLabelText(label);

/** The filter fields the panel shows, by their labels. */
const filterLabels = () =>
  [...document.querySelectorAll<HTMLElement>("#demo-filters .field-label")].map(
    label => label.firstChild?.textContent,
  );

async function openFilters(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /Add filters/ }));
}

describe("the filters each search takes", () => {
  it("offers a person search their businesses' states, a business's name and an address", async () => {
    const { user } = await connect();
    await user.click(screen.getByRole("tab", { name: "a person" }));
    await openFilters(user);

    expect(filterLabels()).toEqual([
      "Their businesses' states",
      "Business name",
      "Address",
    ]);
  });

  it("offers an address search a person's name, its states and a business's name", async () => {
    const { user } = await connect();
    await user.click(screen.getByRole("tab", { name: "an address" }));
    await openFilters(user);

    expect(filterLabels()).toEqual([
      "Person's name",
      "States",
      "Business name",
    ]);
  });

  it("offers a business search its officer, its states and its address, as before", async () => {
    const { user } = await connect();
    await openFilters(user);

    expect(filterLabels()).toEqual([
      "Officer or agent name",
      "States",
      "Address",
    ]);
  });

  it("narrows a person search to those on a business whose name fits", async () => {
    const { user, last } = await connect();
    await user.click(screen.getByRole("tab", { name: "a person" }));
    await openFilters(user);
    await user.type(filter(/Business name/), "northshore");
    await user.click(field("demo-person"));
    await user.type(field("demo-person"), "dana");

    await screen.findByRole("group", { name: "Dana Kessler" });
    expect(screen.queryByRole("group", { name: "Dana Whitfield" })).toBeNull();
    expect(last("people")).toMatchObject({ "business.name": "northshore" });
  });

  it("narrows a person search to those who filed from an address", async () => {
    const { user, last } = await connect();
    await user.click(screen.getByRole("tab", { name: "a person" }));
    await openFilters(user);
    await user.type(filter(/^Address/), "48 corriway");
    await user.click(field("demo-person"));
    await user.type(field("demo-person"), "dana");

    await screen.findByRole("group", { name: "Dana Whitfield" });
    expect(screen.queryByRole("group", { name: "Dana Kessler" })).toBeNull();
    expect(last("people")).toMatchObject({ "address.text": "48 corriway" });
    expect(last("people")).not.toHaveProperty("business.name");
  });

  it("narrows an address search to where a person whose name fits filed from", async () => {
    const { user, last } = await connect();
    await user.click(screen.getByRole("tab", { name: "an address" }));
    await openFilters(user);
    await user.type(filter(/Person's name/), "luis");
    await user.click(field("demo-address"));
    await user.type(field("demo-address"), "1200");

    await screen.findByRole("group", {
      name: "1200 Tallowmere Rd, Pittsburgh, PA 15212",
    });
    expect(last("addresses")).toMatchObject({ "person.name": "luis" });
  });

  it("narrows an address search to a business's own office, dropping one no business named so has there", async () => {
    const { user, last } = await connect();
    await user.click(screen.getByRole("tab", { name: "an address" }));
    await user.click(field("demo-address"));
    await user.type(field("demo-address"), "1200");
    const tallowmere = {
      name: "1200 Tallowmere Rd, Pittsburgh, PA 15212",
    };
    await screen.findByRole("group", tallowmere);

    await openFilters(user);
    await user.type(filter(/Business name/), "bayside");

    await waitFor(() =>
      expect(screen.queryByRole("group", tallowmere)).toBeNull(),
    );
    expect(last("addresses")).toMatchObject({
      q: "1200",
      "business.name": "bayside",
    });
  });

  it("holds each name and address to the service's 256 characters", async () => {
    const { user } = await connect();
    await user.click(screen.getByRole("tab", { name: "a person" }));
    await openFilters(user);

    for (const label of [/Business name/, /^Address/]) {
      expect(filter(label).maxLength).toBe(256);
    }
  });
});
