import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_LOOK,
  resolveLook,
  type BusinessSuggestion,
  type Look,
} from "@baselayer-sdk/autocomplete";
import { BusinessAutocompleteView } from "@baselayer-sdk/autocomplete/react";

import "../../src/react/styles.css";
import { PRESETS } from "../../site/demo/style-state";

// A letter the search corrected is the stored word's where the typed word had
// another. The underline emphasis draws it dotted in the match's own color, the
// background emphasis striped in the match's own fill; weight and ink mark
// nothing for a fuzzy match, and the word looks like any other match.

const ROW: BusinessSuggestion = {
  type: "business",
  token: "tok-halcyon",
  label: "HALCYON FERRY WORKS LLC",
  matched_name: null,
  match: "strong",
  domicile_state: "WA",
  states: ["WA"],
  structure: "LLC",
  // "halcyin" typed: the O is the stored word's.
  highlight: [
    { text: "HALCY", matched: true },
    { text: "O", matched: false, corrected: true },
    { text: "N", matched: true },
    { text: " FERRY WORKS LLC", matched: false },
  ],
  related: {
    people: { count: null, matched: null, truncated: false, items: [] },
    addresses: { count: null, matched: null, truncated: false, items: [] },
  },
};

/** A computed color, `rgb(...)` or `color(srgb ...)`, as its channels. */
function rgbOf(color: string): [number, number, number] {
  const srgb = /^color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)/.exec(color);
  if (srgb !== null) {
    return [1, 2, 3].map(at => Math.round(Number(srgb[at]) * 255)) as [
      number,
      number,
      number,
    ];
  }
  const [r, g, b] = color.match(/[\d.]+/g)!.map(Number);
  return [r!, g!, b!];
}

/** `text` split at the commas outside any parentheses. */
function topLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let from = 0;
  for (let at = 0; at < text.length; at += 1) {
    if (text[at] === "(") depth += 1;
    else if (text[at] === ")") depth -= 1;
    else if (text[at] === "," && depth === 0) {
      parts.push(text.slice(from, at).trim());
      from = at + 1;
    }
  }
  return [...parts, text.slice(from).trim()];
}

/**
 * A color expression as its channels: a computed color, or a `color-mix` of
 * two in srgb, which a browser keeps unresolved inside a gradient.
 */
function colorOf(expression: string): [number, number, number] {
  const mix = /^color-mix\((.*)\)$/.exec(expression);
  if (mix === null) {
    return rgbOf(expression);
  }
  const [, first, second] = topLevel(mix[1]!);
  const weighted = (stop: string, other?: number) => {
    const share = /\s(\d+(?:\.\d+)?)%$/.exec(stop);
    return {
      color: colorOf(stop.replace(/\s+\d+(?:\.\d+)?%$/, "")),
      share: share === null ? (other ?? 0.5) : Number(share[1]) / 100,
    };
  };
  const a = weighted(first!);
  const b = weighted(second!, 1 - a.share);
  const total = a.share + b.share;
  return [0, 1, 2].map(at =>
    Math.round((a.color[at]! * a.share + b.color[at]! * b.share) / total),
  ) as [number, number, number];
}

/** The colors a striped element's gradient alternates between. */
function stripesOf(element: HTMLElement): [number, number, number][] {
  const image = getComputedStyle(element).backgroundImage;
  const inside = /^repeating-linear-gradient\((.*)\)$/.exec(image)![1]!;
  const stops = topLevel(inside)
    .slice(1)
    .map(stop => colorOf(stop.replace(/(\s+-?[\d.]+(?:px|%)){1,2}$/, "")));
  // A browser lists each stripe's color at both of its ends.
  return stops.filter(
    (color, at) => at === 0 || color.join() !== stops[at - 1]!.join(),
  );
}

function luminance([r, g, b]: [number, number, number]): number {
  const [lr, lg, lb] = [r, g, b].map(channel => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lr! + 0.7152 * lg! + 0.0722 * lb!;
}

function ratio(a: [number, number, number], b: [number, number, number]) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const EMPHASES = ["underline", "background", "ink", "weight"] as const;

function draw(
  emphasis: (typeof EMPHASES)[number],
  row = ROW,
  look: Partial<Look> = {},
  vars: Record<string, string> = {},
) {
  const host = document.createElement("div");
  host.style.width = "900px";
  document.body.append(host);
  const root = createRoot(host);
  flushSync(() =>
    root.render(
      <BusinessAutocompleteView
        id="b"
        value="halcyin"
        onInputChange={() => {}}
        onSelect={() => {}}
        suggestions={[row]}
        found={1}
        foundCapped={false}
        truncated={false}
        indexTag={null}
        roundTripMs={null}
        isSearching={false}
        error={null}
        open
        look={{ ...DEFAULT_LOOK, ...look, matchEmphasis: emphasis }}
      />,
    ),
  );
  // What a preset sets beside its look: the stylesheet's own variables.
  for (const [name, value] of Object.entries(vars)) {
    (host.firstElementChild as HTMLElement).style.setProperty(name, value);
  }
  const corrected = host.querySelector<HTMLElement>("[data-corrected]");
  const matched = host.querySelector<HTMLElement>(".bl-ac-mark");
  return {
    host,
    corrected,
    matched,
    done() {
      root.unmount();
      host.remove();
    },
  };
}

describe("the letters the search corrected", () => {
  it("are dotted under the underline emphasis, in the solid mark's own color and line", () => {
    const { corrected, matched, done } = draw("underline");
    const dotted = getComputedStyle(corrected!);
    const solid = getComputedStyle(matched!);

    expect(solid.textDecorationLine).toBe("underline");
    expect(solid.textDecorationStyle).toBe("solid");
    expect(dotted.textDecorationLine).toBe("underline");
    expect(dotted.textDecorationStyle).toBe("dotted");
    expect(dotted.textDecorationColor).toBe(solid.textDecorationColor);
    expect(dotted.textDecorationThickness).toBe(solid.textDecorationThickness);
    expect(dotted.textUnderlineOffset).toBe(solid.textUnderlineOffset);
    expect(dotted.backgroundColor).toBe("rgba(0, 0, 0, 0)");
    done();
  });

  it("follow a host's --bl-ac-mark, as the solid mark does", () => {
    const themed = draw("underline");
    (themed.host.firstElementChild as HTMLElement).style.setProperty(
      "--bl-ac-mark",
      "rgb(200, 30, 60)",
    );

    expect(getComputedStyle(themed.matched!).textDecorationColor).toBe(
      "rgb(200, 30, 60)",
    );
    expect(getComputedStyle(themed.corrected!).textDecorationColor).toBe(
      "rgb(200, 30, 60)",
    );
    themed.done();
  });

  it("are striped under the background emphasis, where a match is solid", () => {
    const { corrected, matched, done } = draw("background");
    const striped = getComputedStyle(corrected!);

    expect(getComputedStyle(matched!).backgroundImage).toBe("none");
    expect(getComputedStyle(matched!).backgroundColor).not.toBe(
      "rgba(0, 0, 0, 0)",
    );
    expect(striped.backgroundImage).toContain("repeating-linear-gradient(");
    expect(striped.backgroundImage).toContain("-45deg");
    expect(striped.backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(striped.textDecorationLine).toBe("none");
    done();
  });

  it("stripe in the match color and a tint of it on the default marker, the letters keeping their ink", () => {
    const { corrected, matched, done } = draw("background");
    const [first, second] = stripesOf(corrected!);

    expect(first).toEqual(rgbOf(getComputedStyle(matched!).backgroundColor));
    expect(second).not.toEqual(first);
    // The letters are the neighbouring letters' own: the solid mark's.
    expect(getComputedStyle(corrected!).color).toBe(
      getComputedStyle(matched!).color,
    );
    done();
  });

  describe("read on both stripes, in the letter color the solid match gives its text (WCAG AA)", () => {
    // Klemen's three: white letters on a saturated purple and on a dark olive
    // green, dark letters on a light green.
    const COMBINATIONS = [
      [
        "a saturated purple pill, white letters",
        "#7c3aed",
        "rgb(255, 255, 255)",
      ],
      ["a light green pill, dark letters", "#c6f6d5", "rgb(26, 32, 44)"],
      [
        "a dark olive green pill, white letters",
        "#556b2f",
        "rgb(255, 255, 255)",
      ],
    ] as const;

    it.each(COMBINATIONS)("%s", (_, color, letters) => {
      const { corrected, matched, done } = draw("background", ROW, {
        matchEmphasisColor: color,
      });

      expect(getComputedStyle(matched!).color).toBe(letters);
      expect(getComputedStyle(corrected!).color).toBe(letters);
      expect(stripesOf(corrected!)).toHaveLength(2);
      for (const stripe of stripesOf(corrected!)) {
        expect(
          ratio(rgbOf(getComputedStyle(corrected!).color), stripe),
        ).toBeGreaterThanOrEqual(4.5);
      }
      done();
    });

    it.each([
      "#000000",
      "#ffffff",
      "#fafafa",
      "#050505",
      "#7f7f7f",
      "#767676",
      "#ffff00",
      "#800000",
    ])("a custom %s, on a white menu and on a dark one", color => {
      for (const dark of [false, true]) {
        const { corrected, done } = draw("background", ROW, {
          matchEmphasisColor: color,
          ...(dark
            ? {
                backgroundColor: "#111418",
                titleColor: "#f4f5f7",
                subtitleColor: "#9aa0aa",
              }
            : {}),
        });

        for (const stripe of stripesOf(corrected!)) {
          expect(
            ratio(rgbOf(getComputedStyle(corrected!).color), stripe),
            `${color}${dark ? " (dark)" : ""}`,
          ).toBeGreaterThanOrEqual(4.5);
        }
        done();
      }
    });

    it.each(PRESETS.map(preset => [preset.name, preset] as const))(
      "the %s preset",
      (_, preset) => {
        const look = resolveLook({
          ...preset.look,
          ...preset.highlight,
          matchEmphasis: "background",
        });
        const { corrected, done } = draw("background", ROW, look, preset.vars);

        for (const stripe of stripesOf(corrected!)) {
          expect(
            ratio(rgbOf(getComputedStyle(corrected!).color), stripe),
          ).toBeGreaterThanOrEqual(4.5);
        }
        done();
      },
    );
  });

  it.each(["weight", "ink"] as const)(
    "are an ordinary match under the %s emphasis: no mark of their own, the word one match",
    emphasis => {
      const { host, corrected, done } = draw(emphasis);

      expect(corrected).toBeNull();
      expect(
        [...host.querySelectorAll(".bl-ac-mark")].map(mark => mark.textContent),
      ).toEqual(["HALCYON"]);
      for (const node of host.querySelectorAll<HTMLElement>("*")) {
        expect(getComputedStyle(node).textDecorationStyle).not.toBe("dotted");
        expect(getComputedStyle(node).backgroundImage).not.toContain(
          "repeating-linear-gradient(",
        );
      }
      done();
    },
  );

  it("leave a row the search did not correct as it was: no dotted line, no stripes anywhere", () => {
    const exact: BusinessSuggestion = {
      ...ROW,
      highlight: [
        { text: "HALCYON", matched: true },
        { text: " FERRY WORKS LLC", matched: false },
      ],
    };
    for (const emphasis of EMPHASES) {
      const { host, done } = draw(emphasis, exact);

      expect(host.querySelector("[data-corrected]")).toBeNull();
      for (const node of host.querySelectorAll<HTMLElement>("*")) {
        expect(getComputedStyle(node).textDecorationStyle).not.toBe("dotted");
        expect(getComputedStyle(node).backgroundImage).not.toContain(
          "repeating-linear-gradient(",
        );
      }
      done();
    }
  });
});
