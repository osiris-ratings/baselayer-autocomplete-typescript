/** @vitest-environment jsdom */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { App } from "../../site/demo/App";
import { answerSample } from "../../site/demo/sample-api";
import typoGolden from "../core/fixtures/typo-highlights.json";
import { useDemoPage } from "./support/demo-page";

// What a person trying the demo on the made-up API sees when they mistype a
// word: the name is found, and the letter the search corrected is drawn apart
// from the letters they typed.

useDemoPage();

const ALL = ["businesses", "people", "addresses"] as const;

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
  vi.stubGlobal("fetch", sampleFetch());
  const user = userEvent.setup();
  render(<App />);
  await user.type(screen.getByTestId("demo-key"), "any-key");
  await user.click(screen.getByTestId("demo-apply"));
  await screen.findByText(/key accepted/i);
  return user;
}

const correctedOf = () =>
  [...document.querySelectorAll("[data-corrected]")].map(
    node => node.textContent,
  );
const marksOf = () =>
  [
    ...document.querySelectorAll(
      '[data-testid="business-suggestion-name"] [data-testid="business-suggestion-match"]',
    ),
  ].map(node => node.textContent);

async function typeInBusiness(
  user: ReturnType<typeof userEvent.setup>,
  typed: string,
) {
  await user.type(document.getElementById("demo-business-input")!, typed);
  await waitFor(() =>
    expect(
      document.querySelectorAll('[data-testid="business-suggestion"]').length,
    ).toBeGreaterThan(0),
  );
}

describe("typing each kind of typo in the demo", () => {
  // The kinds Klemen can try, and the letters the service tags for each.
  it.each([
    ["harbur", "substitution", ["O"]],
    ["harbr", "deletion", ["O"]],
    ["harbro", "swap", ["OR"]],
    ["harbbor", "an extra letter", []],
    ["harb", "a prefix still being typed", []],
    ["harbor", "typed right", []],
  ] as const)("%s (%s) tags %j", async (typed, _kind, expected) => {
    const user = await connect();

    await typeInBusiness(user, typed);

    expect(new Set(correctedOf())).toEqual(new Set(expected));
  });

  it("covers every typed text the service was asked about", () => {
    expect(typoGolden.cases.map(entry => entry.typed)).toEqual(
      expect.arrayContaining(["harbur", "harbr", "harbro", "harbbor", "harb"]),
    );
  });

  it("draws a deletion with all six letters of HARBOR typed, the O marked, never HARBO", async () => {
    const user = await connect();

    await typeInBusiness(user, "harbr");

    // The default region is the typed characters: five typed cover the six
    // letters, the one left out between them.
    expect(correctedOf()).toContain("O");
    const first = document.querySelector(
      '[data-testid="business-suggestion-name"]',
    )!;
    expect(first.textContent).toContain("HARBOR");
    expect(marksOf()).toContain("HARB");
    expect(marksOf()).toContain("R");
  });
});

/** Styling's Highlights fold, where the emphasis and the region are set. */
async function openHighlights(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId("demo-styling-open"));
  await user.click(screen.getByRole("button", { name: /^Highlights/ }));
}

describe("switching the emphasis and the region live in the demo", () => {
  it("draws a corrected letter as an ordinary match under weight and ink, and its own mark under underline and background", async () => {
    const user = await connect();
    await typeInBusiness(user, "harbur");
    expect(correctedOf()).toContain("O");
    await openHighlights(user);

    for (const emphasis of ["weight", "ink"]) {
      await user.selectOptions(screen.getByLabelText(/^Emphasis/), emphasis);
      await waitFor(() => expect(correctedOf()).toEqual([]));
      expect(marksOf()).toContain("HARBOR");
    }
    for (const emphasis of ["underline", "background"]) {
      await user.selectOptions(screen.getByLabelText(/^Emphasis/), emphasis);
      await waitFor(() => expect(correctedOf()).toContain("O"));
    }
  });

  it("covers the typed characters or the whole word, as the region says", async () => {
    const user = await connect();
    await typeInBusiness(user, "harbu");
    await openHighlights(user);
    await user.selectOptions(screen.getByLabelText(/^Region/), "substring");

    // Five typed: HARB and the O corrected; the R is not yet typed, so plain.
    await waitFor(() => expect(correctedOf()).toContain("O"));
    expect(marksOf()).toContain("HARB");
    expect(marksOf()).not.toContain("R");

    await user.selectOptions(screen.getByLabelText(/^Region/), "token");
    // The whole word the service marked: the R is in it too.
    await waitFor(() => expect(marksOf()).toContain("R"));
    expect(correctedOf()).toContain("O");
  });
});
