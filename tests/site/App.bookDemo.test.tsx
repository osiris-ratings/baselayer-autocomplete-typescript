/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { App } from "../../site/demo/App";
import { useDemoPage } from "./support/demo-page";

// The introduction ends with a way to book a demo of Baselayer.

useDemoPage();

describe("the Book a demo button", () => {
  it("is under the introduction's lede and leads to the demo booking page", () => {
    render(<App />);
    const link = screen.getByRole("link", { name: "Book a demo" });
    expect(link.getAttribute("href")).toBe("https://baselayer.com/demo/");
    const lede = screen.getByText(/real and billable on your organization/);
    expect(
      lede.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("opens in a new tab, so the key and session this page holds stay", () => {
    render(<App />);
    const link = screen.getByRole("link", { name: "Book a demo" });
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noreferrer noopener");
  });
});
