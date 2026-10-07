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

  it("finds a business through a person, stays on Person with their name and the business under it, and names the officer in How it matched", async () => {
    const user = await connect(["businesses", "people", "addresses"]);

    await user.click(screen.getByRole("radio", { name: "Person" }));
    await user.type(field("demo-person"), "dana");
    const dana = await screen.findByRole("group", { name: "Dana Whitfield" });
    expect(within(dana).getByTestId("grouped-counts").textContent).toBe(
      "7 businesses · 3 addresses",
    );
    expect(within(dana).getByTestId("grouped-firstAddress").textContent).toBe(
      "1200 Tallowmere Rd, Pittsburgh, PA 15212 +2",
    );
    await user.click(
      within(dana).getByRole("option", {
        name: /HARBOR CONCRETE SUPPLY, INC\./,
      }),
    );

    // The pick stays where it was made: the person's name in the field, and
    // the business under it.
    expect(checked("Person")).toBe("true");
    expect(field("demo-person").value).toBe("Dana Whitfield");
    expect(screen.getByTestId("grouped-selection").textContent).toBe(
      "HARBOR CONCRETE SUPPLY, INC.",
    );
    expect(screen.queryByTestId("demo-through")).toBeNull();
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

  it("finds a business through an address, stays on Address with the address, and names it in How it matched", async () => {
    const user = await connect(["businesses", "people", "addresses"]);

    await user.click(screen.getByRole("radio", { name: "Address" }));
    await user.type(field("demo-address"), "77 quill");
    // Matched by the part typing leaves whole: the typed prefix of a word is
    // a mark of its own, which jsdom names apart from the rest of the word.
    const office = await screen.findByRole("group", {
      name: /Ln Ste 300, Dover, DE 19904$/,
    });
    expect(within(office).getByTestId("grouped-counts").textContent).toBe(
      "412 businesses · 1 person",
    );
    await user.click(
      within(office).getByRole("option", { name: /NORTHSHORE PUMPING, LLC/ }),
    );

    expect(checked("Address")).toBe("true");
    expect(field("demo-address").value).toBe(
      "77 Quillfeather Ln Ste 300, Dover, DE 19904",
    );
    expect(screen.getByTestId("grouped-selection").textContent).toBe(
      "NORTHSHORE PUMPING, LLC",
    );
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

  it("lets the pick go once the field is edited", async () => {
    const user = await connect(["businesses", "people", "addresses"]);
    await user.click(screen.getByRole("radio", { name: "Person" }));
    await user.type(field("demo-person"), "dana");
    await user.click(
      await screen.findByRole("option", { name: /BAYSIDE HARBOR CONCRETE/ }),
    );
    await waitFor(() => expect(step()).not.toBeNull());

    await user.type(field("demo-person"), "{Backspace}");

    expect(screen.queryByTestId("grouped-selection")).toBeNull();
    await waitFor(() => expect(step()).toBeNull(), { timeout: 1500 });
  });
});

describe("a person's or an address's row, as Styling sets it", () => {
  it("lists a person's addresses, and picks one as the person's, with no search to run", async () => {
    const user = await connect(["businesses", "people", "addresses"]);
    await user.click(screen.getByRole("radio", { name: "Person" }));
    await user.click(screen.getByTestId("demo-styling-open"));
    await user.click(
      within(
        screen.getByRole("group", { name: "Listed under each person" }),
      ).getByRole("checkbox", { name: "Their addresses" }),
    );
    await user.click(
      within(screen.getByRole("group", { name: "Can be picked" })).getByRole(
        "checkbox",
        { name: "Their addresses" },
      ),
    );

    await user.type(field("demo-person"), "dana");
    const dana = await screen.findByRole("group", { name: "Dana Whitfield" });
    const [tallowmere] = within(dana).getAllByTestId("address-line");
    expect(tallowmere!.textContent).toBe(
      "1200 Tallowmere Rd, Pittsburgh, PA 15212officer",
    );
    await user.click(tallowmere!);

    expect(field("demo-person").value).toBe("Dana Whitfield");
    const selection = screen.getByTestId("grouped-selection");
    expect(selection.textContent).toBe(
      "1200 Tallowmere Rd, Pittsburgh, PA 15212",
    );
    expect(selection.getAttribute("data-type")).toBe("address");
    // Nothing redeems an address's token: there is no business to search.
    expect(step()).toBeNull();
  });

  it("follows the form's search from the Components fold's tabs", async () => {
    const user = await connect(["businesses", "people", "addresses"]);
    await user.click(screen.getByTestId("demo-styling-open"));

    await user.click(screen.getByRole("tab", { name: "Address" }));

    expect(checked("Address")).toBe("true");
    expect(
      document.querySelector('[data-drop="personTrailing"]'),
    ).not.toBeNull();
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
      within(sample[0]!).getAllByTestId("business-line").length,
    ).toBeGreaterThan(0);
    expect(screen.getByText(/Sample rows for/).textContent).toContain("dana");

    await user.click(screen.getByRole("radio", { name: "Address" }));
    expect(screen.getAllByTestId("address-suggestion").length).toBeGreaterThan(
      1,
    );
    expect(screen.getByText("412 businesses · 1 person")).toBeTruthy();
  });
});
