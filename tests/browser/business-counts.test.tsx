import axe from "axe-core";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";

import {
  ROW_PLACES,
  resolveLook,
  type BusinessSuggestion,
  type LookInput,
  type RelatedItem,
  type RowLayoutInput,
} from "@baselayer-sdk/autocomplete";
import { BusinessAutocompleteView } from "@baselayer-sdk/autocomplete/react";

import { PRESETS } from "../../site/demo/style-state";
import { disabledInks } from "../../src/react/disabled";
import "../../src/react/styles.css";

// A made-up business with a long name, an address, officers and counts, so a
// narrow row has to give way.
const person = (label: string): RelatedItem => ({
  type: "person",
  token: `tok-${label}`,
  label,
  role: "officer",
  matched: false,
  address: null,
  states: null,
  domicile_state: null,
});

const HARBOR: BusinessSuggestion = {
  type: "business",
  token: "tok-harbor",
  label: "HARBOR CONCRETE PUMPING AND HAULING CO., INC.",
  matched_name: null,
  match: "strong",
  domicile_state: "PA",
  states: ["PA", "MD", "NY", "OH", "WV"],
  structure: "C_CORPORATION",
  highlight: [],
  related: {
    people: {
      count: 12,
      matched: null,
      truncated: false,
      items: [person("Dana Whitfield"), person("Ines Marlowe")],
    },
    addresses: {
      count: 34,
      matched: null,
      truncated: false,
      items: [
        {
          ...person("x"),
          type: "address",
          token: "tok-tallowmere",
          label: "1200 Tallowmere Rd, Pittsburgh, PA 15212",
          role: "principal",
        },
      ],
    },
  },
};

const viewProps = {
  id: "business",
  label: "Business name",
  value: "harbor",
  onInputChange: () => {},
  onSelect: () => {},
  found: 1,
  foundCapped: false,
  truncated: false,
  indexTag: null,
  roundTripMs: null,
  isSearching: false,
  error: null,
  open: true,
};

function draw(width: number, element: ReactElement) {
  const host = document.createElement("div");
  host.style.width = `${width}px`;
  host.style.fontFamily = "sans-serif";
  document.body.append(host);
  const root = createRoot(host);
  flushSync(() => root.render(element));
  return {
    host,
    done() {
      root.unmount();
      host.remove();
    },
  };
}

const row = (layout: RowLayoutInput) => (
  <BusinessAutocompleteView
    {...viewProps}
    suggestions={[HARBOR]}
    layout={layout}
  />
);

/** Every segment a line draws: the name, `also …`, and each placed field. */
function segments(line: Element): HTMLElement[] {
  return [
    ...line.querySelectorAll<HTMLElement>(
      ".bl-ac-name, .bl-ac-also, [data-place]",
    ),
  ].filter(segment => segment.parentElement?.closest("[data-place]") === null);
}

describe("a business row's counts, in each place the head has", () => {
  for (const width of [560, 400, 320]) {
    for (const place of ROW_PLACES) {
      it(`stay in the row and overlap nothing in ${place}, at ${width}px`, () => {
        const { host, done } = draw(width, row({ [place]: "counts" }));
        try {
          const counts = host.querySelector<HTMLElement>(".bl-ac-group-count");
          expect(counts, "counts drawn").not.toBeNull();
          expect(counts).toHaveAttribute("data-place", place);
          const option = host.querySelector<HTMLElement>('[role="option"]')!;
          const within = option.getBoundingClientRect();
          const box = counts!.getBoundingClientRect();
          expect(box.left).toBeGreaterThanOrEqual(within.left - 0.5);
          expect(box.right).toBeLessThanOrEqual(within.right + 0.5);
          for (const line of option.querySelectorAll(".bl-ac-line")) {
            const boxes = segments(line)
              .map(segment => ({
                name: segment.className,
                box: segment.getBoundingClientRect(),
              }))
              .filter(({ box }) => box.width > 0);
            for (const [at, a] of boxes.entries()) {
              for (const b of boxes.slice(at + 1)) {
                const apart =
                  a.box.right <= b.box.left + 0.5 ||
                  b.box.right <= a.box.left + 0.5;
                expect(apart, `${a.name} and ${b.name}`).toBe(true);
              }
            }
          }
        } finally {
          done();
        }
      });
    }
  }

  it("pass axe, placed and not", async () => {
    for (const layout of [{}, { subtitleTrailing: "counts" } as const]) {
      const { host, done } = draw(560, row(layout));
      try {
        const { violations } = await axe.run(host, {
          // The look's colours are the host's; the structure is the SDK's.
          rules: { "color-contrast": { enabled: false } },
        });
        expect(
          violations.map(
            ({ id, nodes }) =>
              `${id}: ${nodes.map(node => node.target.join(" ")).join(", ")}`,
          ),
        ).toEqual([]);
      } finally {
        done();
      }
    }
  });
});

describe("a disabled business head's counts", () => {
  for (const preset of PRESETS.filter(
    each => each.name === "Light" || each.name === "Midnight",
  )) {
    it(`take the disabled text's ink, on ${preset.name}`, () => {
      const look: LookInput = preset.look;
      const { host, done } = draw(
        760,
        <BusinessAutocompleteView
          {...viewProps}
          suggestions={[HARBOR]}
          layout={{ subtitleTrailing: "counts" }}
          list={["people"]}
          enabledLines={["person"]}
          look={look}
        />,
      );
      try {
        const head = host.querySelector('[role="group"]')!.firstElementChild!;
        expect(head).toHaveAttribute("aria-disabled", "true");
        const counts = head.querySelector<HTMLElement>(".bl-ac-group-count")!;
        const ink = disabledInks(resolveLook(look)).text;
        const drawn = getComputedStyle(counts)
          .color.match(/[\d.]+/g)!
          .map(Number);
        const [r, g, b] = /color\(srgb/.test(getComputedStyle(counts).color)
          ? drawn.map(channel => channel * 255)
          : drawn;
        [r, g, b].forEach((channel, at) =>
          expect(
            Math.abs(
              channel! - parseInt(ink.slice(1 + 2 * at, 3 + 2 * at), 16),
            ),
            `channel ${at} of ${ink}`,
          ).toBeLessThanOrEqual(1),
        );
      } finally {
        done();
      }
    });
  }
});
