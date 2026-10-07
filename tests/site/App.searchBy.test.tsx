/** @vitest-environment jsdom */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { App } from "../../site/demo/App";
import { answerSample } from "../../site/demo/sample-api";
import { step, useDemoPage } from "./support/demo-page";

// The demo against the made-up API `DEMO_API=sample` serves: a business found
// through a person or an address, then searched for in step 03.

useDemoPage();

/** A `fetch` the made-up API answers, its sessions held to `routes`. */
function sampleFetch(routes: readonly string[]) {
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
      { routes },
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

async function connect(routes: readonly string[]) {
  vi.stubGlobal("fetch", sampleFetch(routes));
  const user = userEvent.setup();
  render(<App />);
  await user.type(screen.getByTestId("demo-key"), "any-key");
  await user.click(screen.getByTestId("demo-apply"));
  await screen.findByText(/key accepted/i);
  return user;
}

const field = (id: string): HTMLInputElement =>
  document.getElementById(`${id}-input`) as HTMLInputElement;

const checked = (name: string) =>
  screen.getByRole("radio", { name }).getAttribute("aria-checked");

describe("searching by person or address", () => {
  it("offers only the searches the session's scope allows", async () => {
    await connect(["businesses"]);

    expect(screen.queryByRole("radiogroup", { name: "Search by" })).toBeNull();
  });

  it("offers Business, Person and Address when the session may search all three", async () => {
    await connect(["businesses", "people", "addresses"]);

    const searchBy = screen.getByRole("radiogroup", { name: "Search by" });
    expect(
      within(searchBy)
        .getAllByRole("radio")
        .map(radio => radio.textContent),
    ).toEqual(["Business", "Person", "Address"]);
    expect(checked("Business")).toBe("true");
  });

  it("finds a business through a person, hands it to the business name, and names the officer in How it matched", async () => {
    const user = await connect(["businesses", "people", "addresses"]);

    await user.click(screen.getByRole("radio", { name: "Person" }));
    await user.type(field("demo-person"), "dana");
    const dana = await screen.findByRole("group", { name: "Dana Whitfield" });
    expect(within(dana).getByText("7 businesses")).toBeTruthy();
    await user.click(
      within(dana).getByRole("option", {
        name: /HARBOR CONCRETE SUPPLY, INC\./,
      }),
    );

    // The pick is a business: the switch is back on Business, holding it.
    expect(checked("Business")).toBe("true");
    expect(field("demo-business").value).toBe("HARBOR CONCRETE SUPPLY, INC.");
    expect(screen.getByTestId("demo-through").textContent).toBe(
      "via Dana Whitfield",
    );
    await waitFor(() => expect(step()).not.toBeNull());
    expect(step()!.textContent).toContain(
      "Found through Dana Whitfield, an officer.",
    );

    await user.click(
      within(step()!).getByRole("button", { name: "Run business search" }),
    );
    const matched = await within(step()!).findByRole("table");
    expect(
      within(matched).getByRole("row", { name: /Officer/ }).textContent,
    ).toContain("Dana Whitfield");
    expect(step()!.textContent).toContain(
      "Picked from the businesses of Dana Whitfield.",
    );
  });

  it("finds a business through an address, and names the address in How it matched", async () => {
    const user = await connect(["businesses", "people", "addresses"]);

    await user.click(screen.getByRole("radio", { name: "Address" }));
    await user.type(field("demo-address"), "77 quill");
    // Matched by the part typing leaves whole: the typed prefix of a word is
    // a mark of its own, which jsdom names apart from the rest of the word.
    const office = await screen.findByRole("group", {
      name: /Ln Ste 300, Dover, DE 19904$/,
    });
    expect(within(office).getByText("412 businesses here")).toBeTruthy();
    await user.click(
      within(office).getByRole("option", { name: /NORTHSHORE PUMPING, LLC/ }),
    );

    expect(field("demo-business").value).toBe("NORTHSHORE PUMPING, LLC");
    await waitFor(() => expect(step()).not.toBeNull());
    expect(step()!.textContent).toContain(
      "Found at 77 Quillfeather Ln Ste 300, Dover, DE 19904, its registered agent's office.",
    );

    await user.click(
      within(step()!).getByRole("button", { name: "Run business search" }),
    );
    const matched = await within(step()!).findByRole("table");
    expect(
      within(matched).getByRole("row", { name: /Address/ }).textContent,
    ).toContain("77 Quillfeather");
    expect(step()!.textContent).toContain(
      "Picked from the businesses at 77 Quillfeather Ln Ste 300, Dover, DE 19904.",
    );
  });

  it("lets the handed-over name go once it is edited", async () => {
    const user = await connect(["businesses", "people", "addresses"]);
    await user.click(screen.getByRole("radio", { name: "Person" }));
    await user.type(field("demo-person"), "dana");
    await user.click(
      await screen.findByRole("option", { name: /BAYSIDE HARBOR CONCRETE/ }),
    );

    await user.type(field("demo-business"), "{Backspace}");

    expect(screen.queryByTestId("demo-through")).toBeNull();
    await waitFor(() => expect(step()).toBeNull(), { timeout: 1500 });
  });
});

describe("Styling's sample rows", () => {
  it("show made-up people and addresses as well, before anything is connected", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByTestId("demo-styling-open"));
    expect(screen.getAllByTestId("business-suggestion").length).toBeGreaterThan(
      0,
    );

    await user.click(screen.getByRole("radio", { name: "Person" }));
    const sample = screen.getAllByTestId("person-suggestion");
    expect(sample.length).toBeGreaterThan(1);
    expect(
      within(sample[0]!).getAllByTestId("business-option").length,
    ).toBeGreaterThan(0);
    expect(screen.getByText(/Sample rows for/).textContent).toContain("dana");

    await user.click(screen.getByRole("radio", { name: "Address" }));
    expect(screen.getAllByTestId("address-suggestion").length).toBeGreaterThan(
      1,
    );
    expect(screen.getByText(/412 businesses here/)).toBeTruthy();
  });
});
