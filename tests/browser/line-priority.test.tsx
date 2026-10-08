import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import type {
  PersonRowLayoutInput,
  PersonSuggestion,
  RelatedItem,
} from "@baselayer-sdk/autocomplete";
import { PersonAutocompleteView } from "@baselayer-sdk/autocomplete/react";

import "../../src/react/styles.css";

// Made-up businesses with long names and addresses, so something must give.
const business = (
  label: string,
  states: string[],
  address: string,
): RelatedItem => ({
  type: "business",
  token: `tok-${label}`,
  label,
  role: "officer",
  matched: false,
  address,
  states,
  domicile_state: states[0]!,
});

const DANA: PersonSuggestion = {
  type: "person",
  token: "tok-dana",
  label: "Dana Whitfield",
  matched_name: null,
  match: "strong",
  highlight: [],
  related: {
    businesses: {
      count: 3,
      matched: null,
      truncated: false,
      items: [
        business(
          "HARBOR CONCRETE PUMPING CO., INC.",
          ["PA", "MD", "NY", "OH", "WV"],
          "1200 Tallowmere Rd, Pittsburgh, PA 15212",
        ),
        business(
          "BAYSIDE HARBOR CONCRETE, INC.",
          ["CA", "AZ", "NV", "OR"],
          "55 Tidecaster Way, Oakland, CA 94607",
        ),
        business(
          "NORTHSHORE PUMPING, LLC",
          ["OH"],
          "88 Velloway St, Akron, OH",
        ),
      ],
    },
    addresses: {
      count: 3,
      matched: null,
      truncated: false,
      items: [
        {
          ...business("x", [], ""),
          type: "address",
          label: "1200 Tallowmere Rd, Pittsburgh, PA 15212",
          address: null,
          states: null,
          domicile_state: null,
        },
      ],
    },
  },
};

const LAYOUTS: [string, PersonRowLayoutInput][] = [
  ["the default", {}],
  [
    "states after the name and the address at the right",
    {
      businessBadge: "states",
      businessTrailingBadge: "address",
      businessTrailing: "role",
    },
  ],
  [
    "the address first after the name, the role before the states",
    {
      businessBadge: "address",
      businessTrailingBadge: "role",
      businessTrailing: "states",
    },
  ],
];

function draw(width: number, layout: PersonRowLayoutInput) {
  const host = document.createElement("div");
  host.style.width = `${width}px`;
  host.style.fontFamily = "sans-serif";
  document.body.append(host);
  const root = createRoot(host);
  flushSync(() =>
    root.render(
      <PersonAutocompleteView
        id="people"
        value="dana"
        onInputChange={() => {}}
        onSelect={() => {}}
        suggestions={[DANA]}
        found={1}
        foundCapped={false}
        truncated={false}
        indexTag={null}
        roundTripMs={null}
        isSearching={false}
        error={null}
        open
        layout={layout}
        iconSegments={["name", "businessName", "address", "firstAddress"]}
      />,
    ),
  );
  return {
    lines: [
      ...host.querySelectorAll<HTMLElement>(
        ".bl-ac-group-head, .bl-ac-group-line",
      ),
    ],
    done() {
      root.unmount();
      host.remove();
    },
  };
}

/** A line's segments in reading order: each child of its two corners. */
function segments(line: HTMLElement): HTMLElement[] {
  return [
    ...line.querySelectorAll<HTMLElement>(
      ":scope > [data-corner] > *, :scope > .bl-ac-group-lead > *",
    ),
  ].filter((segment, at, all) => all.indexOf(segment) === at);
}

/** Whether a text segment shows less than its text: an ellipsis, or nothing. */
const cut = (segment: HTMLElement) =>
  segment.scrollWidth > segment.clientWidth + 0.5;

const isName = (segment: HTMLElement) =>
  segment.matches(".bl-ac-name, .bl-ac-line-name");
/**
 * Text that gives way before the name: the addresses and the counts, and the
 * role too where the line is too narrow for its column.
 */
const givesWayFirst = (segment: HTMLElement, width: number) =>
  segment.matches(
    width <= 360
      ? ".bl-ac-address, .bl-ac-group-count, .bl-ac-role"
      : ".bl-ac-address, .bl-ac-group-count",
  );

describe("a line's segments, when the line runs out of room", () => {
  for (const width of [560, 400, 320]) {
    for (const [name, layout] of LAYOUTS) {
      it(`give way after the name, and never overlap, at ${width}px with ${name}`, () => {
        const { lines, done } = draw(width, layout);
        try {
          expect(lines.length).toBeGreaterThan(2);
          for (const line of lines) {
            const parts = segments(line);
            const where = `${width}px, ${name}: ${line.textContent}`;
            // (a) The name is the last text to be cut: once it is, every
            // later text segment is too.
            const nameAt = parts.findIndex(isName);
            expect(nameAt, where).toBeGreaterThanOrEqual(0);
            const nameSegment = parts[nameAt]!;
            const style = getComputedStyle(line);
            const room =
              line.clientWidth -
              parseFloat(style.paddingLeft) -
              parseFloat(style.paddingRight);
            // Cut below its cap, 60% of the line, because the line ran out.
            if (
              cut(nameSegment) &&
              nameSegment.getBoundingClientRect().width < 0.59 * room
            ) {
              for (const later of parts
                .slice(nameAt + 1)
                .filter(part => givesWayFirst(part, width))) {
                expect(cut(later), `${where}: ${later.className}`).toBe(true);
              }
            }
            // (b) No segment's box, nor an icon in it, reaches into the one
            // before it.
            const boxes = parts
              .map(part => part.getBoundingClientRect())
              .filter(box => box.width > 0);
            for (let at = 1; at < boxes.length; at++) {
              expect(boxes[at]!.left, where).toBeGreaterThanOrEqual(
                boxes[at - 1]!.right - 0.5,
              );
            }
            for (const icon of line.querySelectorAll<HTMLElement>(
              ".bl-ac-address > .bl-ac-icon",
            )) {
              const own = icon.parentElement!.getBoundingClientRect();
              const box = icon.getBoundingClientRect();
              expect(box.left, `${where}: icon`).toBeGreaterThanOrEqual(
                own.left - 0.5,
              );
            }
          }
        } finally {
          done();
        }
      });
    }
  }

  it("keep the name whole while a later segment can give way", () => {
    const { lines, done } = draw(560, LAYOUTS[1]![1]);
    try {
      const [, harbor] = lines;
      const name = harbor!.querySelector<HTMLElement>(".bl-ac-line-name")!;
      const address = harbor!.querySelector<HTMLElement>(".bl-ac-address")!;
      expect(cut(name)).toBe(false);
      expect(cut(address)).toBe(true);
    } finally {
      done();
    }
  });

  it("cut a name longer than 60% of the line at that cap, and leave short text after it whole", () => {
    const longest = {
      ...DANA,
      related: {
        ...DANA.related,
        businesses: {
          count: 1,
          matched: null,
          truncated: false,
          items: [
            business(
              "THE VERY LONG NAME OF A MADE-UP CONCRETE PUMPING AND HAULING COMPANY OF PENNSYLVANIA, INC.",
              ["PA"],
              "1 Elm St",
            ),
          ],
        },
      },
    };
    const host = document.createElement("div");
    host.style.width = "560px";
    host.style.fontFamily = "sans-serif";
    document.body.append(host);
    const root = createRoot(host);
    flushSync(() =>
      root.render(
        <PersonAutocompleteView
          id="people"
          value="dana"
          onInputChange={() => {}}
          onSelect={() => {}}
          suggestions={[longest]}
          found={1}
          foundCapped={false}
          truncated={false}
          indexTag={null}
          roundTripMs={null}
          isSearching={false}
          error={null}
          open
          // The name and the address alone, so only the cap decides.
          layout={{ businessTrailingBadge: null, businessTrailing: null }}
        />,
      ),
    );
    try {
      const line = host.querySelector<HTMLElement>(".bl-ac-group-line")!;
      const name = line.querySelector<HTMLElement>(".bl-ac-line-name")!;
      const address = line.querySelector<HTMLElement>(".bl-ac-address")!;
      const style = getComputedStyle(line);
      const room =
        line.clientWidth -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight);
      expect(cut(name)).toBe(true);
      expect(name.getBoundingClientRect().width).toBeLessThanOrEqual(
        0.6 * room + 0.5,
      );
      expect(cut(address)).toBe(false);
    } finally {
      root.unmount();
      host.remove();
    }
  });
});
