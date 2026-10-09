import newsreader from "@fontsource-variable/newsreader/files/newsreader-latin-wght-normal.woff2?url";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import type {
  AddressSuggestion,
  RelatedItem,
} from "@baselayer-sdk/autocomplete";
import { AddressAutocompleteView } from "@baselayer-sdk/autocomplete/react";

import "../../src/react/styles.css";

// A made-up address its businesses hold as an agent's office and a principal one.
const business = (label: string, role: RelatedItem["role"]): RelatedItem => ({
  type: "business",
  token: `tok-${label}`,
  label,
  role,
  matched: false,
  address: "1200 Tallowmere Rd, Pittsburgh, PA 15212",
  states: ["OR", "WA"],
  domicile_state: "OR",
});

const ANSWER: AddressSuggestion = {
  type: "address",
  token: "tok-quill",
  label: "77 QUILLBACK LN, FARRELTON, OR 97433",
  matched_name: null,
  match: "strong",
  highlight: [],
  components: {
    line1: "77 QUILLBACK LN",
    line2: null,
    city: "FARRELTON",
    state: "OR",
    postal_code: "97433",
  },
  related: {
    businesses: {
      count: 3,
      matched: null,
      truncated: false,
      items: [
        business("QUILLBACK HOLDINGS 1, LLC", "agent"),
        business("QUILLBACK HOLDINGS 2, LLC", "principal"),
        business("QUILLBACK HOLDINGS 3, LLC", "agent"),
      ],
    },
    people: { count: null, matched: null, truncated: false, items: [] },
  },
};

/** The address's menu, open, in `family`. */
function draw(family: string) {
  const host = document.createElement("div");
  host.style.width = "560px";
  host.style.fontFamily = family;
  document.body.append(host);
  const root = createRoot(host);
  flushSync(() =>
    root.render(
      <AddressAutocompleteView
        id="addresses"
        value="x"
        suggestions={[ANSWER]}
        onInputChange={() => {}}
        onSelect={() => {}}
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
    done() {
      root.unmount();
      host.remove();
    },
  };
}

/** Where a role's words are drawn, not its column's box. */
function words(role: Element): DOMRect {
  const range = document.createRange();
  range.selectNodeContents(role);
  return range.getBoundingClientRect();
}

/** The column as drawn: its width, and its widest role's words. */
function column(host: Element) {
  const roles = [
    ...host.querySelectorAll<HTMLElement>(
      ".bl-ac-group-trailing > .bl-ac-role",
    ),
  ];
  return {
    width: roles[0]!.getBoundingClientRect().width,
    widest: Math.max(...roles.map(role => words(role).width)),
  };
}

const fits = ({ width, widest }: { width: number; widest: number }) =>
  Math.abs(width - widest) <= 0.5;

/** A stylesheet declaring `family` from the font file at `url`. */
function declare(family: string, url: string): HTMLStyleElement {
  const style = document.createElement("style");
  style.textContent = `@font-face { font-family: "${family}"; src: url(${url}) format("woff2"); font-display: swap; }`;
  document.head.append(style);
  return style;
}

describe("the role column when a web font comes in", () => {
  it("fits the roles again once a font face the menu is set in is added and loads", async () => {
    const { host, done } = draw("'Added Face', monospace");
    const face = new FontFace("Added Face", `url(${newsreader})`);
    try {
      const before = column(host);
      expect(fits(before)).toBe(true);
      document.fonts.add(face);
      await face.load();
      await expect
        .poll(
          () => {
            const now = column(host);
            return Math.abs(now.widest - before.widest) > 2 && fits(now);
          },
          { timeout: 3000 },
        )
        .toBe(true);
    } finally {
      document.fonts.delete(face);
      done();
    }
  });

  it("fits the roles again once a font the page's stylesheet declares loads", async () => {
    const style = declare("Declared Face", newsreader);
    const { host, done } = draw("'Declared Face', monospace");
    try {
      const before = column(host);
      await document.fonts.load("13px 'Declared Face'");
      await document.fonts.ready;
      await new Promise(resolve => setTimeout(resolve, 300));
      const after = column(host);
      expect(Math.abs(after.widest - before.widest)).toBeGreaterThan(2);
      expect(fits(after), `${after.width} for ${after.widest}`).toBe(true);
    } finally {
      style.remove();
      done();
    }
  });

  it("fits the roles once a stylesheet's font the browser fetches by itself comes in", async () => {
    const style = declare("Fetched Face", `${newsreader}?fetched`);
    const { host, done } = draw("'Fetched Face', monospace");
    try {
      await new Promise(resolve => setTimeout(resolve, 1500));
      const after = column(host);
      expect(fits(after), `${after.width} for ${after.widest}`).toBe(true);
    } finally {
      style.remove();
      done();
    }
  });
});
