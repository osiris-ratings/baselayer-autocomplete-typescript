import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import { RowMap } from "../../site/demo/RowMap";
import { DEFAULT_STYLE } from "../../site/demo/style-state";

import "../../site/demo/demo.css";

describe("the Components fold's row, laid out", () => {
  it("lists an empty badge's options at a readable size, though its own text is hidden", () => {
    const host = document.createElement("div");
    host.style.width = "520px";
    document.body.append(host);
    const root = createRoot(host);
    flushSync(() =>
      root.render(<RowMap state={DEFAULT_STYLE} onChange={() => {}} />),
    );

    const empty = [
      ...host.querySelectorAll<HTMLElement>(
        '.row-map-place[data-badge][data-field="empty"]',
      ),
    ];
    expect(empty.length).toBeGreaterThan(0);
    for (const place of empty) {
      const select = place.querySelector("select")!;
      // The `+` stands in for the select's text, which is drawn at 0.
      expect(getComputedStyle(select).fontSize).toBe("0px");
      // A platform that draws the list in its options' size must still
      // draw them legibly.
      for (const option of select.options) {
        expect(
          parseFloat(getComputedStyle(option).fontSize),
          `${place.dataset.drop} ${option.value}`,
        ).toBeGreaterThanOrEqual(12);
      }
    }
    root.unmount();
    host.remove();
  });
});
