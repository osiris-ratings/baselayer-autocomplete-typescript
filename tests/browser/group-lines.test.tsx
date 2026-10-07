import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import type {
  PersonSuggestion,
  RelatedItem,
} from "@baselayer-sdk/autocomplete";
import { PersonAutocompleteView } from "@baselayer-sdk/autocomplete/react";

import "../../src/react/styles.css";

// Made-up people and businesses: one, five and two states, and two roles.
const business = (
  label: string,
  states: string[],
  role: RelatedItem["role"],
): RelatedItem => ({
  type: "business",
  token: `tok-${label}`,
  label,
  role,
  matched: false,
  address: "1200 Tallowmere Rd, Pittsburgh, PA 15212",
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
        business("HARBOR CONCRETE SUPPLY, INC.", ["NJ"], "officer"),
        business(
          "BAYSIDE HARBOR CONCRETE, INC.",
          ["CA", "AZ", "NV", "OR", "WA"],
          "agent",
        ),
        business("NORTHSHORE PUMPING, LLC", ["OH", "PA"], "officer"),
      ],
    },
    addresses: { count: null, matched: null, truncated: false, items: [] },
  },
};

function draw(width: number) {
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
      />,
    ),
  );
  return {
    host,
    lines: [
      ...host.querySelectorAll<HTMLElement>('[data-testid="business-line"]'),
    ],
    done() {
      root.unmount();
      host.remove();
    },
  };
}

const px = (value: string) => parseFloat(value);

describe("the lines under a person", () => {
  for (const width of [560, 400] as const) {
    it(`line their state squares up down the group at ${width}px, whatever the role`, () => {
      const { lines, done } = draw(width);
      try {
        const starts = lines.map(line =>
          Math.round(
            line.querySelector(".bl-ac-states")!.getBoundingClientRect().left,
          ),
        );
        expect(new Set(starts).size).toBe(1);
      } finally {
        done();
      }
    });
  }

  it("draw the role quieter than the name", () => {
    const { lines, done } = draw(560);
    try {
      const role = getComputedStyle(lines[0]!.querySelector(".bl-ac-role")!);
      const name = getComputedStyle(
        lines[0]!.querySelector(".bl-ac-line-name")!,
      );
      expect(px(role.fontSize)).toBeLessThan(px(name.fontSize));
    } finally {
      done();
    }
  });

  it("draw a business's name a step lighter than the person's own", () => {
    const { host, lines, done } = draw(560);
    try {
      const head = getComputedStyle(
        host.querySelector(".bl-ac-group-head .bl-ac-name")!,
      );
      const name = getComputedStyle(
        lines[0]!.querySelector(".bl-ac-line-name")!,
      );
      expect(px(name.fontSize)).toBeLessThan(px(head.fontSize));
    } finally {
      done();
    }
  });
});
