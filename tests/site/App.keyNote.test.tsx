/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { App } from "../../site/demo/App";
import { useDemoPage } from "./support/demo-page";

// The connection panel says whose key it asks for, and what to do without one.

useDemoPage();

describe("the key field", () => {
  it("is labelled as the visitor's own Baselayer API key", () => {
    render(<App />);

    const field = screen.getByLabelText("Your Baselayer API key");
    expect(field).toBe(screen.getByTestId("demo-key"));
    expect(screen.queryByLabelText("API key")).toBeNull();
  });
});

describe("the note for a visitor with no key", () => {
  const note = () =>
    screen.getByText(/Don't have a Baselayer API key\?/).closest("p")!;

  it("asks them to book a demo to get one, in the connection panel's hint row", () => {
    render(<App />);

    expect(note().textContent).toBe(
      "Don't have a Baselayer API key? Book a demo to get one.",
    );
    // Beside the Apply button, where the other hint is.
    const row = screen.getByTestId("demo-apply").closest(".apply-row")!;
    expect(row.contains(note())).toBe(true);
    expect(note().className).toContain("hint");
  });

  it("links to the page that books a demo, and follows the key field", () => {
    render(<App />);

    const link = note().querySelector("a")!;
    expect(link.textContent).toBe("Book a demo");
    expect(link.getAttribute("href")).toBe("https://baselayer.com/demo/");
    const field = screen.getByTestId("demo-key");
    expect(
      field.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("opens in a new tab, so the key typed so far and the session stay", () => {
    render(<App />);

    const link = note().querySelector("a")!;
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noreferrer noopener");
  });

  it("leaves what Apply does as it was said", () => {
    render(<App />);

    expect(
      screen.getByText(
        "Apply mints one session to test the key, and the demo uses it.",
      ),
    ).toBeTruthy();
    expect(screen.getByTestId("demo-apply").textContent).toBe("Apply API key");
  });
});
