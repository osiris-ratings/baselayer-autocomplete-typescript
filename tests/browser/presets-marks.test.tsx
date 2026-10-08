import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type {
  BusinessSuggestion,
  PersonSuggestion,
} from "@baselayer-sdk/autocomplete";
import {
  BusinessAutocompleteView,
  PersonAutocompleteView,
} from "@baselayer-sdk/autocomplete/react";

import {
  DEFAULT_STYLE,
  PRESETS,
  applyPreset,
  componentProps,
  previewCss,
} from "../../site/demo/style-state";

import {
  contrast,
  deltaE00,
  distance,
  ground,
  rgb,
  type Rgb,
} from "./support/colour";

import "../../src/react/styles.css";

/**
 * How far a matched word must stand from the same name unmatched, each floor
 * for the one cue an emphasis draws:
 *
 * - an underline at 3:1 on the card, WCAG 1.4.11's floor for a graphic that
 *   carries meaning;
 * - a fill at ΔE00 10 from the card: CIEDE2000 puts a difference side by side
 *   at about 1, and 10 is plain at a glance; a highlighter fill is pale by
 *   design, so its luminance contrast cannot be the measure;
 * - an ink at ΔE00 20 from the rest of the name, twice the fill's, since a
 *   glyph's thin strokes show their colour far less than a block does;
 * - a weight two steps (200) above the name's, and its own colour at the
 *   ink's floor besides: one step is hard to see at text sizes.
 *
 * Whatever the cue, the matched word stays text: 4.5:1 on its own ground,
 * WCAG 1.4.3's floor.
 */
const FLOOR = {
  underline: 3,
  fill: 10,
  ink: 20,
  weight: 200,
  text: 4.5,
};

/** What is wrong with the first matched name drawn: one entry a fault. */
function faults(): string[] {
  const mark = host.querySelector<HTMLElement>(".bl-ac-name .bl-ac-mark");
  if (mark === null) return ["draws no mark"];
  const name = mark.closest<HTMLElement>(".bl-ac-name")!;
  const card = ground(name);
  const own = getComputedStyle(mark);
  const rest = getComputedStyle(name);
  const fill = rgb(own.backgroundColor, card);
  const ink = rgb(own.color, fill);
  const text = rgb(rest.color, card);
  const found: string[] = [];
  const legible = contrast(ink, fill);
  if (legible < FLOOR.text) {
    found.push(`matched text at ${legible.toFixed(2)}:1 on its ground`);
  }
  const emphasis = name.dataset.emphasis;
  switch (emphasis) {
    case "underline": {
      const line = contrast(rgb(own.textDecorationColor, card), card);
      if (!own.textDecorationLine.includes("underline")) {
        found.push("draws no underline");
      } else if (line < FLOOR.underline) {
        found.push(`underline at ${line.toFixed(2)}:1 on the card`);
      }
      break;
    }
    case "background": {
      const apart = distance(fill, card);
      if (apart < FLOOR.fill) {
        found.push(`fill at ΔE00 ${apart.toFixed(1)} from the card`);
      }
      break;
    }
    case "ink": {
      const apart = distance(ink, text);
      if (apart < FLOOR.ink) {
        found.push(`ink at ΔE00 ${apart.toFixed(1)} from the rest`);
      }
      break;
    }
    case "weight": {
      const heavier = Number(own.fontWeight) - Number(rest.fontWeight);
      const apart = distance(ink, text);
      if (heavier < FLOOR.weight) {
        found.push(`weight only ${heavier} above the rest`);
      }
      if (apart < FLOOR.ink) {
        found.push(`weight's ink at ΔE00 ${apart.toFixed(1)} from the rest`);
      }
      break;
    }
    default:
      found.push(`marks nothing (${emphasis})`);
  }
  return found;
}

const BUSINESS: BusinessSuggestion = {
  type: "business",
  token: "tok-b-1",
  label: "Cinder Rigging LLC",
  matched_name: null,
  match: "strong",
  domicile_state: "MO",
  states: ["MO"],
  structure: "LLC",
  related: {
    people: { count: 0, matched: null, truncated: false, items: [] },
    addresses: { count: 0, matched: null, truncated: false, items: [] },
  },
  highlight: [
    { text: "Cinder", matched: true },
    { text: " Rigging LLC", matched: false },
  ],
};

const PERSON: PersonSuggestion = {
  type: "person",
  token: "tok-p-1",
  label: "Margarethe Whitfield",
  matched_name: null,
  match: "strong",
  highlight: [
    { text: "Margarethe", matched: true },
    { text: " Whitfield", matched: false },
  ],
  related: {
    businesses: { count: 0, matched: null, truncated: false, items: [] },
    addresses: { count: 0, matched: null, truncated: false, items: [] },
  },
};

const SHOWN = {
  found: 1,
  foundCapped: false,
  truncated: false,
  indexTag: null,
  roundTripMs: null,
  isSearching: false,
  error: null,
  open: true,
};

let host: HTMLDivElement;
let root: Root;
const sheet = document.createElement("style");

beforeAll(() => {
  // The preview's own way in: its stylesheet over `.demo-preview .bl-ac`.
  document.head.append(sheet);
  host = document.createElement("div");
  host.className = "demo-preview";
  host.style.width = "560px";
  document.body.append(host);
  root = createRoot(host);
});

afterAll(() => {
  root.unmount();
  host.remove();
  sheet.remove();
});

describe("every preset's matched words", () => {
  for (const preset of PRESETS) {
    it(`stand apart from the rest of the name in ${preset.name}`, () => {
      const style = applyPreset(DEFAULT_STYLE, preset);
      sheet.textContent = previewCss(style);
      const found: string[] = [];
      flushSync(() =>
        root.render(
          <BusinessAutocompleteView
            id="businesses"
            label="Business name"
            value="cinder"
            onInputChange={() => {}}
            onSelect={() => {}}
            suggestions={[BUSINESS]}
            look={style.look}
            {...componentProps(style, "businesses")}
            {...SHOWN}
          />,
        ),
      );
      found.push(...faults().map(fault => `businesses: ${fault}`));
      flushSync(() =>
        root.render(
          <PersonAutocompleteView
            id="people"
            label="Person's name"
            value="margarethe"
            onInputChange={() => {}}
            onSelect={() => {}}
            suggestions={[PERSON]}
            look={style.look}
            {...componentProps(style, "people")}
            // An enabled head: a disabled one fades its mark by design, and
            // the disabled lines' own tests hold it.
            enabledLines={["person", "business", "address"]}
            {...SHOWN}
          />,
        ),
      );
      found.push(...faults().map(fault => `people: ${fault}`));
      expect(found).toEqual([]);
    });
  }

  it("are measured by a CIEDE2000 that matches the published worked pairs", () => {
    // Sharma, Wu and Dalal (2005), table 1: pairs 1, 9, 7 and 19.
    for (const [a, b, want] of [
      [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
      [[50, 2.49, -0.001], [50, -2.49, 0.0009], 7.1792],
      [[50, 0, 0], [50, -1, 2], 2.3669],
      [[50, 2.5, 0], [56, -27, -3], 31.903],
    ] as [Rgb, Rgb, number][]) {
      expect(deltaE00(a, b)).toBeCloseTo(want, 3);
    }
  });
});
