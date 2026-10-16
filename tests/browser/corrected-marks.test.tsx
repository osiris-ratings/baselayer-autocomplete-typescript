import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_LOOK,
  type BusinessSuggestion,
} from "@baselayer-sdk/autocomplete";
import { BusinessAutocompleteView } from "@baselayer-sdk/autocomplete/react";

import "../../src/react/styles.css";

// A letter the search corrected is drawn with a dotted underline, whichever
// way the emphasis draws a match: it is the letter you did not type, and the
// two must not be taken for one another.

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
  it.each(EMPHASES)(
    "are underlined dotted under the %s emphasis, with no fill of their own",
    emphasis => {
      const { corrected, done } = draw(emphasis);
      const style = getComputedStyle(corrected!);

      expect(style.textDecorationLine).toBe("underline");
      expect(style.textDecorationStyle).toBe("dotted");
      expect(style.textDecorationThickness).toBe("1.5px");
      expect(style.backgroundColor).toBe("rgba(0, 0, 0, 0)");
      done();
    },
  );

  it("are told from the underline emphasis's solid mark", () => {
    const { corrected, matched, done } = draw("underline");

    expect(getComputedStyle(matched!).textDecorationLine).toBe("underline");
    expect(getComputedStyle(matched!).textDecorationStyle).toBe("solid");
    expect(getComputedStyle(corrected!).textDecorationStyle).toBe("dotted");
    done();
  });

  it("take the text's color for the dots, or --bl-ac-corrected when a host sets it", () => {
    const plain = draw("underline");
    const text = getComputedStyle(plain.corrected!).color;
    expect(getComputedStyle(plain.corrected!).textDecorationColor).toBe(text);
    plain.done();

    const themed = draw("underline");
    (themed.host.firstElementChild as HTMLElement).style.setProperty(
      "--bl-ac-corrected",
      "rgb(200, 30, 60)",
    );
    expect(getComputedStyle(themed.corrected!).textDecorationColor).toBe(
      "rgb(200, 30, 60)",
    );
    themed.done();
  });

  it("leave a row the search did not correct as it was: no dotted underline anywhere", () => {
    const exact: BusinessSuggestion = {
      ...ROW,
      highlight: [
        { text: "HALCYON", matched: true },
        { text: " FERRY WORKS LLC", matched: false },
      ],
    };
    const { host, done } = draw("underline", exact);

    expect(host.querySelector("[data-corrected]")).toBeNull();
    for (const node of host.querySelectorAll<HTMLElement>("*")) {
      expect(getComputedStyle(node).textDecorationStyle).not.toBe("dotted");
    }
    done();
  });
});
