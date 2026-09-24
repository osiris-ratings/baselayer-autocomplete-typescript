/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { landOnHash } from "../../site/shared/landing";

let fontsLoaded: () => void;

beforeEach(() => {
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: {
      ready: new Promise<void>(resolve => {
        fontsLoaded = resolve;
      }),
    },
  });
  document.body.innerHTML = '<section id="quick-start"></section>';
});

afterEach(() => {
  window.location.hash = "";
  document.body.innerHTML = "";
});

function section() {
  const element = document.getElementById("quick-start")!;
  const scrolled = vi.fn<Element["scrollIntoView"]>();
  element.scrollIntoView = scrolled;
  return scrolled;
}

describe("landOnHash", () => {
  it("scrolls a page drawn after load to its link's section", () => {
    window.location.hash = "#quick-start";
    const scrolled = section();

    landOnHash();

    expect(scrolled).toHaveBeenCalledTimes(1);
    expect(scrolled).toHaveBeenCalledWith({ block: "start" });
  });

  it("jumps there rather than gliding, and puts the page's smooth scroll back", () => {
    window.location.hash = "#quick-start";
    document.documentElement.style.scrollBehavior = "";
    const behaviors: string[] = [];
    section().mockImplementation(() => {
      behaviors.push(document.documentElement.style.scrollBehavior);
    });

    landOnHash();

    expect(behaviors).toEqual(["auto"]);
    expect(document.documentElement.style.scrollBehavior).toBe("");
  });

  it("lands again once the fonts are in and the page has reflowed", async () => {
    window.location.hash = "#quick-start";
    const scrolled = section();

    landOnHash();
    fontsLoaded();
    await document.fonts.ready;

    expect(scrolled).toHaveBeenCalledTimes(2);
  });

  it("leaves a reader who has scrolled since where they are", async () => {
    window.location.hash = "#quick-start";
    const scrolled = section();

    landOnHash();
    window.dispatchEvent(new Event("wheel"));
    fontsLoaded();
    await document.fonts.ready;

    expect(scrolled).toHaveBeenCalledTimes(1);
  });

  it("does nothing without a fragment, or for one that names nothing", () => {
    const scrolled = section();

    landOnHash();
    window.location.hash = "#nowhere";
    landOnHash();

    expect(scrolled).not.toHaveBeenCalled();
  });
});
