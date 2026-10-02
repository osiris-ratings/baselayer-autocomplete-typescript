import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import { ROW_FIELDS } from "@baselayer-sdk/autocomplete";

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

  /** The map in a 520px column, as the fold lays it out. */
  function mount() {
    const host = document.createElement("div");
    host.style.width = "520px";
    document.body.append(host);
    const root = createRoot(host);
    flushSync(() =>
      root.render(<RowMap state={DEFAULT_STYLE} onChange={() => {}} />),
    );
    return {
      host,
      done() {
        root.unmount();
        host.remove();
      },
    };
  }

  it("lists the wire fields each field reads, in a table with its headings at the left", () => {
    const { host, done } = mount();
    const table = host.querySelector<HTMLElement>(".row-map-reads")!;
    const rows = [...table.querySelectorAll<HTMLElement>("tbody tr")];

    expect(rows.map(row => row.dataset.field)).toEqual([...ROW_FIELDS]);
    const reads = (field: string) =>
      [
        ...rows
          .find(row => row.dataset.field === field)!
          .querySelectorAll("code"),
      ].map(code => code.textContent);
    // The marks a filter earns read the flags on the people and the addresses,
    // and the state filter, which the service flags nowhere.
    expect(reads("people")).toContain("related.people.items[].matched");
    expect(reads("address")).toContain("related.addresses.items[0].matched");
    expect(reads("states")).toContain("state filter");
    for (const heading of table.querySelectorAll("th")) {
      expect(["left", "start"]).toContain(getComputedStyle(heading).textAlign);
      // Hairlines between rows, never an accent down one side.
      expect(getComputedStyle(heading).borderLeftWidth).toBe("0px");
    }
    const wrap = host.querySelector<HTMLElement>(".row-map-wrap")!;
    expect(wrap.scrollWidth).toBeLessThanOrEqual(wrap.clientWidth);
    done();
  });
});
