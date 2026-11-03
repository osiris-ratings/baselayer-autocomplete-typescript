/** @vitest-environment jsdom */

import { render, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Home } from "../../site/home/Home";

// The landing page's closing call to action names the key the demo wants, and
// says where to get one.

// jsdom has none of what the page asks of a browser for its motion.
beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    (query: string): MediaQueryList =>
      ({
        matches: false,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
        onchange: null,
      }) as MediaQueryList,
  );
  class Observer {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  vi.stubGlobal("IntersectionObserver", Observer);
  vi.stubGlobal("ResizeObserver", Observer);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function cta() {
  render(<Home />);
  return within(
    document.querySelector<HTMLElement>(
      'section[aria-labelledby="cta-title"]',
    )!,
  );
}

describe("the landing page's call to action", () => {
  it("asks for a Baselayer API key, as the demo's field does", () => {
    const section = cta();

    expect(
      section.getByText(/Paste your Baselayer API key into the demo/),
    ).toBeTruthy();
    expect(section.queryByText(/Paste an API key/)).toBeNull();
  });

  it("says where to get one: a link to book a demo", () => {
    const section = cta();

    const link = section.getByRole("link", { name: "Book a demo" });
    expect(link.getAttribute("href")).toBe("https://baselayer.com/demo/");
    expect(link.closest("p")!.textContent).toBe(
      "Don't have a Baselayer API key? Book a demo to get one.",
    );
  });

  it("keeps the buttons that lead into the demo and the reference", () => {
    const section = cta();

    expect(section.getByRole("link", { name: "Try the demo" })).toBeTruthy();
    expect(section.getByRole("link", { name: "API reference" })).toBeTruthy();
  });
});
