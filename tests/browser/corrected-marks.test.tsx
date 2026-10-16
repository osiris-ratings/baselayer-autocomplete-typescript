import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_LOOK,
  type BusinessSuggestion,
} from "@baselayer-sdk/autocomplete";
import { BusinessAutocompleteView } from "@baselayer-sdk/autocomplete/react";

import "../../src/react/styles.css";

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

const EMPHASES = ["underline", "background", "ink", "weight"] as const;

function draw(emphasis: (typeof EMPHASES)[number], row = ROW) {
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
        look={{ ...DEFAULT_LOOK, matchEmphasis: emphasis }}
      />,
    ),
  );
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

  it("are striped under the background emphasis, in the fill's color, where a match is solid", () => {
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

  it("stripe in the host's --bl-ac-mark, the color a match is filled in", () => {
    const themed = draw("background");
    (themed.host.firstElementChild as HTMLElement).style.setProperty(
      "--bl-ac-mark",
      "rgb(10, 120, 200)",
    );

    expect(getComputedStyle(themed.matched!).backgroundColor).toBe(
      "rgb(10, 120, 200)",
    );
    expect(getComputedStyle(themed.corrected!).backgroundImage).toContain(
      "rgb(10, 120, 200)",
    );
    themed.done();
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
