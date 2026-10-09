import { useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import { StylingPanel } from "../../site/demo/StylingPanel";
import { INITIAL_STYLE, type StyleState } from "../../site/demo/style-state";

import "../../site/shared/brand.css";
import "../../site/shared/fonts";
import "../../site/demo/demo.css";

function mount(width: number) {
  const host = document.createElement("div");
  host.className = "demo";
  host.style.width = `${width}px`;
  document.body.append(host);
  const root = createRoot(host);
  function Kept() {
    const [state, setState] = useState<StyleState>(INITIAL_STYLE);
    return <StylingPanel state={state} onChange={setState} />;
  }
  flushSync(() => root.render(<Kept />));
  return {
    host,
    done() {
      root.unmount();
      host.remove();
    },
  };
}

const frame = () =>
  new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));

/** Every fold's head, its height and where it starts, and what it says. */
function heads(host: HTMLElement) {
  return [...host.querySelectorAll<HTMLElement>(".fold-nested")].map(fold => {
    const head = fold.querySelector<HTMLElement>(":scope > .fold-heading")!;
    const box = head.getBoundingClientRect();
    return {
      title: fold.querySelector(".fold-title")!.textContent,
      height: box.height,
      line: parseFloat(
        getComputedStyle(fold.querySelector(".fold-title")!).lineHeight,
      ),
      top: fold.getBoundingClientRect().top,
      summary: fold.querySelector(".fold-summary")?.textContent?.trim() ?? "",
    };
  });
}

describe("the Styling panel's fold heads", () => {
  for (const width of [560, 320]) {
    it(`keep one height, and the folds below them their place, as a count comes and goes, in ${width}px`, async () => {
      await document.fonts.ready;
      const { host, done } = mount(width);
      try {
        const before = heads(host);
        expect(before.length).toBeGreaterThan(3);
        // No taller than its title's own line: a summary adds nothing.
        for (const head of before) {
          expect(head.height, head.title!).toBe(head.line);
        }
        expect(before.every(head => !/changed/.test(head.summary))).toBe(true);

        const baselayer = [
          ...host.querySelectorAll<HTMLButtonElement>(".preset"),
        ].find(preset => preset.textContent?.includes("Baselayer"))!;
        baselayer.click();
        await frame();
        const counted = heads(host);
        // The preset changes some folds: their counts show.
        expect(
          counted.filter(head => /\d+ changed/.test(head.summary)).length,
        ).toBeGreaterThan(0);
        counted.forEach((head, at) => {
          expect(head.height, `${head.title} with "${head.summary}"`).toBe(
            before[at]!.height,
          );
          expect(head.top, `${head.title}'s top`).toBe(before[at]!.top);
        });

        const reset = [
          ...host.querySelectorAll<HTMLButtonElement>("button"),
        ].find(button => /^Reset/.test(button.textContent ?? ""))!;
        reset.click();
        await frame();
        const cleared = heads(host);
        expect(cleared.every(head => !/changed/.test(head.summary))).toBe(true);
        cleared.forEach((head, at) => {
          expect(head.height, `${head.title} cleared`).toBe(before[at]!.height);
          expect(head.top, `${head.title}'s top, cleared`).toBe(
            before[at]!.top,
          );
        });
      } finally {
        done();
      }
    });
  }
});
