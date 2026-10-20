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

type Rgb = [number, number, number];

/** A computed color, `rgb()`, `rgba()` or `color(srgb ...)`, as channels and opacity. */
function colorOf(color: string): { rgb: Rgb; opacity: number } {
  const srgb =
    /^color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)/.exec(color);
  if (srgb !== null) {
    return {
      rgb: [1, 2, 3].map(at => Math.round(Number(srgb[at]) * 255)) as Rgb,
      opacity: srgb[4] === undefined ? 1 : Number(srgb[4]),
    };
  }
  const [r, g, b, a] = color.match(/[\d.]+/g)!.map(Number);
  return { rgb: [r!, g!, b!], opacity: a ?? 1 };
}

const rgbOf = (color: string): Rgb => colorOf(color).rgb;

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

/** The colors a striped element's gradient alternates between, as computed. */
function rawStripesOf(element: HTMLElement) {
  const image = getComputedStyle(element).backgroundImage;
  const inside = /^repeating-linear-gradient\((.*)\)$/.exec(image)![1]!;
  const stops = topLevel(inside)
    .slice(1)
    .map(stop => colorOf(stop.replace(/(\s+-?[\d.]+(?:px|%)){1,2}$/, "")));
  // A browser lists each stripe's color at both of its ends: two stripes, four
  // stops, even where the two are the same color.
  return [stops[0]!, stops[2]!];
}

/** What is behind `element`: the first background that is not clear, else white. */
function groundOf(element: HTMLElement): Rgb {
  for (
    let node: HTMLElement | null = element.parentElement;
    node !== null;
    node = node.parentElement
  ) {
    const { rgb, opacity } = colorOf(getComputedStyle(node).backgroundColor);
    if (opacity > 0) {
      return rgb;
    }
  }
  return [255, 255, 255];
}

/** The stripes as drawn: each over what is behind the element. */
function stripesOf(element: HTMLElement): Rgb[] {
  const ground = groundOf(element);
  return rawStripesOf(element).map(
    ({ rgb, opacity }) =>
      rgb.map((channel, at) =>
        Math.round(ground[at]! + (channel - ground[at]!) * opacity),
      ) as Rgb,
  );
}

function luminance([r, g, b]: Rgb): number {
  const [lr, lg, lb] = [r, g, b].map(channel => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lr! + 0.7152 * lg! + 0.0722 * lb!;
}

function ratio(a: Rgb, b: Rgb) {
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

  it("are one continuous shape with the marks either side: they touch, the inner corners are square, only the ends are rounded", () => {
    const { host, corrected, done } = draw("background");
    const spans = [
      ...host.querySelectorAll<HTMLElement>(
        '[data-testid="business-suggestion-name"] > [data-join]',
      ),
    ];
    const [before, letter, after] = spans;

    // HALCY, O, N: three spans in a row.
    expect(spans.map(span => span.textContent)).toEqual(["HALCY", "O", "N"]);
    expect(letter).toBe(corrected);
    const boxes = spans.map(span => span.getBoundingClientRect());
    // They abut exactly: no reach into one another, no gap.
    expect(boxes[0]!.right).toBeCloseTo(boxes[1]!.left, 1);
    expect(boxes[1]!.right).toBeCloseTo(boxes[2]!.left, 1);
    const style = (span: HTMLElement | undefined) => getComputedStyle(span!);
    // Inside the run nothing reaches or rounds...
    expect(style(before).paddingRight).toBe("0px");
    expect(style(before).borderTopRightRadius).toBe("0px");
    expect(style(before).borderBottomRightRadius).toBe("0px");
    for (const side of ["Left", "Right"] as const) {
      expect(style(letter)[`padding${side}`]).toBe("0px");
      expect(
        style(letter)[`borderTop${side}Radius` as "borderTopLeftRadius"],
      ).toBe("0px");
      expect(
        style(letter)[`borderBottom${side}Radius` as "borderBottomLeftRadius"],
      ).toBe("0px");
    }
    expect(style(after).paddingLeft).toBe("0px");
    expect(style(after).borderTopLeftRadius).toBe("0px");
    // ...and the two ends of the run are the pill's: they reach, and they round.
    expect(style(before).paddingLeft).toBe("2px");
    expect(style(before).borderTopLeftRadius).toBe("4px");
    expect(style(after).paddingRight).toBe("2px");
    expect(style(after).borderTopRightRadius).toBe("4px");
    done();
  });

  it("round the end of a run that a corrected letter ends, as a mark does", () => {
    // `harbu`: the letter typed wrong is the last of the run, the R after it plain.
    const row: BusinessSuggestion = {
      ...ROW,
      highlight: [
        { text: "HALCY", matched: true },
        { text: "O", matched: false, corrected: true },
        { text: "N FERRY WORKS LLC", matched: false },
      ],
    };
    const { corrected, done } = draw("background", row);
    const style = getComputedStyle(corrected!);

    expect(corrected!.getAttribute("data-join")).toBe("left");
    expect(style.paddingLeft).toBe("0px");
    expect(style.borderTopLeftRadius).toBe("0px");
    expect(style.paddingRight).toBe("2px");
    expect(style.borderTopRightRadius).toBe("4px");
    done();
  });

  it("stripe in the match color and the menu's ground on the default marker, the letters keeping their ink", () => {
    const { corrected, matched, done } = draw("background");
    const [first, second] = rawStripesOf(corrected!);

    expect(first!.rgb).toEqual(
      rgbOf(getComputedStyle(matched!).backgroundColor),
    );
    expect(first!.opacity).toBe(1);
    // Nothing of the color: the menu's ground shows through whole.
    expect(second!.opacity).toBe(0);
    // The letters are the neighbouring letters' own: the solid mark's.
    expect(getComputedStyle(corrected!).color).toBe(
      getComputedStyle(matched!).color,
    );
    done();
  });

  describe("are the pill's color and the menu's ground, in the letters the solid pill has", () => {
    // Klemen: the letters stay as they are on the fully highlighted background,
    // and the stripes are never another color than the pill's: the second is
    // the bare background (masked) where the letters read on it, and fainter,
    // the pill's color over it, only as far as the letters need.
    function expectStripes(
      corrected: HTMLElement,
      matched: HTMLElement,
      label: string,
    ) {
      const letters = rgbOf(getComputedStyle(corrected).color);
      const [first, second] = stripesOf(corrected);
      const [rawFirst, rawSecond] = rawStripesOf(corrected);
      const ground = groundOf(corrected);

      expect(stripesOf(corrected), label).toHaveLength(2);
      // The first is the pill's own color, whole.
      expect(rawFirst!.opacity, `${label}: the first is the pill's own`).toBe(
        1,
      );
      expect(rawFirst!.rgb, label).toEqual(
        rgbOf(getComputedStyle(matched).backgroundColor),
      );
      // The letters are the solid pill's, never picked again for the stripes.
      expect(getComputedStyle(corrected).color, `${label}: the letters`).toBe(
        getComputedStyle(matched).color,
      );
      // Never another color: the pill's own, more or less of it over the ground.
      expect(rawSecond!.opacity, label).toBeGreaterThanOrEqual(0);
      expect(rawSecond!.opacity, label).toBeLessThanOrEqual(1);
      if (rawSecond!.opacity > 0) {
        expect(rawSecond!.rgb, `${label}: the same color`).toEqual(
          rawFirst!.rgb,
        );
      }
      // Bare where the letters read on the ground; else legible on the stripe.
      if (ratio(letters, ground) >= 4.5) {
        expect(rawSecond!.opacity, `${label}: bare`).toBe(0);
        expect(second, label).toEqual(ground);
      } else if (ratio(letters, first!) >= 2) {
        expect(
          ratio(letters, second!),
          `${label}: ${letters} on ${second}`,
        ).toBeGreaterThanOrEqual(2);
      }
    }

    // The three that were hard to read, and the colors a mid-tone pill had
    // its stripes lost to: the same letters as the pill, whichever they are.
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
      [
        "a mid-tone orange pill, white letters",
        "#ff6a00",
        "rgb(255, 255, 255)",
      ],
      ["a mid-tone grey pill, white letters", "#929292", "rgb(255, 255, 255)"],
      ["a burnt orange pill, white letters", "#d95000", "rgb(255, 255, 255)"],
      ["a pink pill, white letters", "#e63b7a", "rgb(255, 255, 255)"],
      ["a light orange pill, dark letters", "#ff8647", "rgb(26, 32, 44)"],
    ] as const;

    it.each(COMBINATIONS)("%s", (_, color, letters) => {
      const { corrected, matched, done } = draw("background", ROW, {
        matchEmphasisColor: color,
      });

      expect(getComputedStyle(matched!).color).toBe(letters);
      expectStripes(corrected!, matched!, color);
      done();
    });

    // The stripes of a mid-tone pill were one, at the threshold where the
    // letters go from dark to white: a lighter second stripe took the white
    // letters under 3:1, so it was pushed back to the pill's own color. Drawn
    // by the browser, they are two, the second the pill's color over the white
    // menu and no more opaque than the letters need.
    it.each(["#ff6a00", "#929292", "#d95000", "#e63b7a", "#7c3aed"])(
      "the stripes of a %s pill, white letters, are seen: the second is not the pill's own color",
      color => {
        const { corrected, matched, done } = draw("background", ROW, {
          matchEmphasisColor: color,
        });
        const [first, second] = stripesOf(corrected!);

        expectStripes(corrected!, matched!, color);
        expect(rawStripesOf(corrected!)[1]!.opacity, color).toBeLessThan(1);
        expect(ratio(first!, second!), color).toBeGreaterThanOrEqual(1.2);
        // Lighter than the pill, over a white menu: never darker.
        expect(luminance(second!), color).toBeGreaterThan(luminance(first!));
        done();
      },
    );

    // On a dark menu white and the title are both light, so a light pill takes
    // the menu's own dark for its letters, and the corrected letters keep them.
    it("keeps the menu's dark for the letters on a light pill over a dark menu", () => {
      const { corrected, matched, done } = draw("background", ROW, {
        matchEmphasisColor: "#ffb5af",
        backgroundColor: "#0f1424",
        titleColor: "#f4f5f7",
        subtitleColor: "#9aa0aa",
      });
      const pill = rgbOf(getComputedStyle(matched!).backgroundColor);
      const letters = rgbOf(getComputedStyle(matched!).color);

      expect(letters).toEqual([15, 20, 36]);
      expect(ratio(letters, pill)).toBeGreaterThanOrEqual(4.5);
      expectStripes(corrected!, matched!, "#ffb5af (dark)");
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
        const { corrected, matched, done } = draw("background", ROW, {
          matchEmphasisColor: color,
          ...(dark
            ? {
                backgroundColor: "#111418",
                titleColor: "#f4f5f7",
                subtitleColor: "#9aa0aa",
              }
            : {}),
        });

        expectStripes(corrected!, matched!, `${color}${dark ? " (dark)" : ""}`);
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
        const { corrected, matched, done } = draw(
          "background",
          ROW,
          look,
          preset.vars,
        );

        expectStripes(corrected!, matched!, preset.name);
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
