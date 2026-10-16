/** @vitest-environment jsdom */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { App } from "../../site/demo/App";
import { answerSample } from "../../site/demo/sample-api";
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

const corrected = () =>
  [...document.querySelectorAll("[data-corrected]")].map(
    node => node.textContent,
  );

describe("typing a word with one wrong letter in the demo", () => {
  it("finds the name and draws the letter the search corrected apart from the typed ones", async () => {
    const user = await connect();

    await user.type(document.getElementById("demo-business-input")!, "harbur");

    await waitFor(() => expect(corrected()).not.toEqual([]));
    expect(new Set(corrected())).toEqual(new Set(["O"]));
    const row = document.querySelector<HTMLElement>(
      '[data-testid="business-suggestion"]',
    );
    expect(row?.textContent).toContain("HARBOR CONCRETE PUMPING CO., INC.");
  });

  it("draws no corrected letter for the same word typed right", async () => {
    const user = await connect();

    await user.type(document.getElementById("demo-business-input")!, "harbor");

    await waitFor(() =>
      expect(
        document.querySelectorAll('[data-testid="business-suggestion"]').length,
      ).toBeGreaterThan(0),
    );
    expect(corrected()).toEqual([]);
  });
});
