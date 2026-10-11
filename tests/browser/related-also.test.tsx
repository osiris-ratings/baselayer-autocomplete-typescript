import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_LOOK,
  type EntityType,
  type PersonSuggestion,
  type RelatedItem,
} from "@baselayer-sdk/autocomplete";
import { PersonAutocompleteView } from "@baselayer-sdk/autocomplete/react";

import "../../src/react/styles.css";

// Made-up people and businesses: the first matched on the other name it goes
// by, the second on its label.
const business = (label: string, matched_name: string | null): RelatedItem => ({
  type: "business",
  token: `tok-${label}`,
  label,
  role: "officer",
  matched: true,
  matched_name,
  highlight: null,
  address: "1200 Tallowmere Rd, Pittsburgh, PA 15212",
  states: ["PA"],
  domicile_state: "PA",
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
      count: 2,
      matched: 2,
      truncated: false,
      items: [
        business("HARBOR CONCRETE SUPPLY, INC.", "TIDEWATER PUMPS"),
        business("NORTHSHORE PUMPING, LLC", null),
      ],
    },
    addresses: { count: null, matched: null, truncated: false, items: [] },
  },
};

function draw(width: number, enabledLines?: EntityType[]) {
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
        {...(enabledLines !== undefined ? { enabledLines } : {})}
      />,
    ),
  );
  const [aliased, plain] = host.querySelectorAll<HTMLElement>(
    '[data-testid="business-line"]',
  );
  const part = (selector: string) => aliased!.querySelector(selector)!;
  return {
    aliased: aliased!,
    plain: plain!,
    name: part(".bl-ac-line-name"),
    also: part(".bl-ac-also"),
    address: part(".bl-ac-address"),
    done() {
      root.unmount();
      host.remove();
    },
  };
}

describe("a business line that matched on its other name", () => {
  for (const width of [560, 400, 320] as const) {
    it(`says it between its name and its address, on the one line, at ${width}px`, () => {
      const { aliased, plain, name, also, address, done } = draw(width);
      try {
        const n = name.getBoundingClientRect();
        const a = also.getBoundingClientRect();
        const d = address.getBoundingClientRect();
        expect(a.left).toBeGreaterThanOrEqual(n.right);
        expect(d.left).toBeGreaterThanOrEqual(a.right);
        // One line: it shares the name's row, and the line is no taller than
        // one that says nothing more.
        expect(Math.abs(a.top - n.top)).toBeLessThan(4);
        expect(aliased.getBoundingClientRect().height).toBe(
          plain.getBoundingClientRect().height,
        );
      } finally {
        done();
      }
    });
  }

  it("keeps it whole where there is room", () => {
    const { also, done } = draw(760);
    try {
      expect(also.scrollWidth).toBeLessThanOrEqual(also.clientWidth);
    } finally {
      done();
    }
  });

  it("lets the address give way before it", () => {
    const { also, address, done } = draw(560);
    try {
      expect(address.scrollWidth).toBeGreaterThan(address.clientWidth);
      expect(also.clientWidth).toBeGreaterThan(address.clientWidth);
    } finally {
      done();
    }
  });

  it("draws it muted, as the address beside it", () => {
    const { name, also, address, done } = draw(560);
    try {
      expect(getComputedStyle(also).color).toBe(
        getComputedStyle(address).color,
      );
      expect(getComputedStyle(also).color).not.toBe(
        getComputedStyle(name).color,
      );
    } finally {
      done();
    }
  });

  it("fades it with the address on a line that is not a pick", () => {
    const { also, address, done } = draw(560, []);
    try {
      expect(getComputedStyle(also).color).toBe(
        getComputedStyle(address).color,
      );
    } finally {
      done();
    }
  });
});

describe("a related line's highlight", () => {
  it("underlines the parts the service sent as a row's name is underlined", () => {
    const parted: PersonSuggestion = structuredClone(DANA);
    parted.related.businesses.items[1]!.highlight = [
      { text: "NORTHSHORE", matched: true },
      { text: " PUMPING, LLC", matched: false },
    ];
    const host = document.createElement("div");
    host.style.width = "560px";
    document.body.append(host);
    const root = createRoot(host);
    flushSync(() =>
      root.render(
        <PersonAutocompleteView
          id="people"
          value="dana"
          onInputChange={() => {}}
          onSelect={() => {}}
          suggestions={[parted]}
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
    try {
      const mark = host.querySelector<HTMLElement>(
        '[data-testid="business-line"] .bl-ac-line-name .bl-ac-mark',
      )!;
      expect(mark.textContent).toBe("NORTHSHORE");
      const style = getComputedStyle(mark);
      expect(style.textDecorationLine).toBe("underline");
      expect(style.textDecorationThickness).toBe("1.5px");
      expect(style.textUnderlineOffset).toBe("3px");
    } finally {
      root.unmount();
      host.remove();
    }
  });
});

describe("a person's first address with parts", () => {
  /** The mark's colour on Dana's first address, the head a pick or not. */
  function markColour(headEnabled: boolean) {
    const parted: PersonSuggestion = structuredClone(DANA);
    parted.related.addresses = {
      count: 1,
      matched: 1,
      truncated: false,
      items: [
        {
          type: "address",
          token: "tok-fern",
          label: "12 Fernhallow Ln, Dover, DE 19901",
          role: "officer",
          matched: true,
          matched_name: null,
          highlight: [
            { text: "12 Fernhallow", matched: true },
            { text: " Ln, Dover, DE 19901", matched: false },
          ],
          address: null,
          states: null,
          domicile_state: null,
        },
      ],
    };
    const host = document.createElement("div");
    host.style.width = "560px";
    document.body.append(host);
    const root = createRoot(host);
    flushSync(() =>
      root.render(
        <PersonAutocompleteView
          id="people"
          value="dana"
          onInputChange={() => {}}
          onSelect={() => {}}
          suggestions={[parted]}
          found={1}
          foundCapped={false}
          truncated={false}
          indexTag={null}
          roundTripMs={null}
          isSearching={false}
          error={null}
          look={{ ...DEFAULT_LOOK, matchEmphasis: "ink" }}
          enabledLines={headEnabled ? ["person", "business"] : ["business"]}
          open
        />,
      ),
    );
    try {
      const mark = host.querySelector<HTMLElement>(
        '[data-testid="grouped-firstAddress"] .bl-ac-mark',
      )!;
      expect(mark.textContent).toBe("12 Fernhallow");
      return getComputedStyle(mark).color;
    } finally {
      root.unmount();
      host.remove();
    }
  }

  it("fades its ink mark on a head that is not a pick, as the address text fades", () => {
    expect(markColour(false)).not.toBe(markColour(true));
  });
});
