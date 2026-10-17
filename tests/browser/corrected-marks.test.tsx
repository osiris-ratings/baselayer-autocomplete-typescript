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
  // A browser lists each stripe's color at both of its ends.
  return stops.filter(
    (stop, at) =>
      at === 0 ||
      `${stop.rgb}/${stop.opacity}` !==
        `${stops[at - 1]!.rgb}/${stops[at - 1]!.opacity}`,
  );
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

  it("stripe in the match color and the same color more transparent on the default marker, the letters keeping their ink", () => {
    const { corrected, matched, done } = draw("background");
    const [first, second] = rawStripesOf(corrected!);

    expect(first!.rgb).toEqual(
      rgbOf(getComputedStyle(matched!).backgroundColor),
    );
    expect(first!.opacity).toBe(1);
    // The same color at 40%: the menu's ground shows through.
    expect(second!.rgb).toEqual(first!.rgb);
    expect(second!.opacity).toBeCloseTo(0.4, 2);
    // The letters are the neighbouring letters' own: the solid mark's.
    expect(getComputedStyle(corrected!).color).toBe(
      getComputedStyle(matched!).color,
    );
    done();
  });

  describe("read on both stripes, in the letter color the solid match gives its text", () => {
    /**
     * The first stripe is the pill's own color, so the letters read on it as
     * they do on the pill; the second is the same color more transparent, and
     * keeps at least `floor` (3:1, or AA where asked) over the menu's ground
     * wherever the pill reads at all.
     */
    function expectStripes(
      corrected: HTMLElement,
      label: string,
      floor?: number,
    ) {
      const letters = rgbOf(getComputedStyle(corrected).color);
      const [first, second] = stripesOf(corrected);
      const [rawFirst, rawSecond] = rawStripesOf(corrected);

      expect(stripesOf(corrected), label).toHaveLength(2);
      expect(rawFirst!.opacity, `${label}: the first is the pill's own`).toBe(
        1,
      );
      expect(rawSecond!.rgb, `${label}: the same color`).toEqual(rawFirst!.rgb);
      expect(rawSecond!.opacity, label).toBeLessThanOrEqual(1);
      expect(rawSecond!.opacity, label).toBeGreaterThanOrEqual(0.35);
      if (ratio(letters, first!) >= 3) {
        expect(
          ratio(letters, second!),
          `${label}: ${letters} on ${second}`,
        ).toBeGreaterThanOrEqual(floor ?? 3);
      }
    }

    // Klemen's three: white letters on a saturated purple and on a dark olive
    // green, dark letters on a light green. Over a white menu white letters
    // leave a stripe that can be seen only 3:1; dark ones keep AA.
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
      // The first stripe is the pill's own color.
      expect(stripesOf(corrected!)[0]).toEqual(
        rgbOf(getComputedStyle(matched!).backgroundColor),
      );
      // White letters over this white menu: the stripe is as transparent as
      // 3:1 lets it be; dark ones keep AA at the most transparent.
      expectStripes(
        corrected!,
        color,
        letters === "rgb(255, 255, 255)" ? 3 : 4.5,
      );
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

        expectStripes(corrected!, `${color}${dark ? " (dark)" : ""}`);
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

        expectStripes(corrected!, preset.name);
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
