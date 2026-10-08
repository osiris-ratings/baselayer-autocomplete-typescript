import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import type {
  BusinessSuggestion,
  RelatedItem,
  RelatedSet,
  RowLayoutInput,
} from "@baselayer-sdk/autocomplete";
import { BusinessAutocompleteView } from "@baselayer-sdk/autocomplete/react";

import "../../src/react/styles.css";

// The business typeahead a host gets with no layout, lists or picks of its
// own must draw exactly as it always has, and so must one a host has laid
// out with today's props. What it draws is its markup, every stylesheet rule
// that matches each element as written (in any state, and for its
// pseudo-elements), and the styles each computes to; with all three
// unchanged, every pixel is too, on any platform, which a stored screenshot
// could not say across systems. The snapshots were taken before rows learned
// to list lines under them.

/** What decides how an element draws, but not what its text measures. */
const STYLES = [
  "display",
  "position",
  "flex",
  "flex-wrap",
  "flex-direction",
  "grid-auto-flow",
  "grid-auto-columns",
  "column-gap",
  "row-gap",
  "align-items",
  "align-self",
  "justify-content",
  "margin",
  "padding",
  "border",
  "border-radius",
  "box-shadow",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "letter-spacing",
  "line-height",
  "color",
  "background-color",
  "text-decoration-line",
  "text-decoration-color",
  "text-underline-offset",
  "text-transform",
  "white-space",
  "overflow",
  "text-overflow",
  "min-width",
  "max-width",
  "cursor",
  "visibility",
  "opacity",
  "text-align",
  "box-sizing",
  "max-height",
  "min-height",
  "z-index",
  "outline-style",
  "outline-width",
  "outline-color",
  "outline-offset",
  "transform",
  "vertical-align",
] as const;

/** The SDK's own rules, as written, each with the conditions it sits under. */
function sdkRules(): { selector: string; text: string }[] {
  const found: { selector: string; text: string }[] = [];
  const walk = (rules: CSSRuleList, context: string) => {
    for (const rule of rules) {
      if (rule instanceof CSSStyleRule) {
        if (rule.selectorText.includes("bl-ac")) {
          found.push({
            selector: rule.selectorText,
            text: context + rule.cssText,
          });
        }
      } else if (rule instanceof CSSMediaRule) {
        walk(rule.cssRules, `${context}@media ${rule.conditionText} `);
      } else if (rule instanceof CSSSupportsRule) {
        walk(rule.cssRules, `${context}@supports ${rule.conditionText} `);
      }
    }
  };
  for (const sheet of document.styleSheets) {
    walk(sheet.cssRules, "");
  }
  return found;
}

/** A selector list split at its top-level commas. */
function selectors(list: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let at = 0; at < list.length; at++) {
    const char = list[at];
    if (char === "(") depth++;
    else if (char === ")") depth--;
    else if (char === "," && depth === 0) {
      parts.push(list.slice(start, at));
      start = at + 1;
    }
  }
  parts.push(list.slice(start));
  return parts.map(part => part.trim());
}

/** Whether a selector draws on an element: in any state, or on its pseudo-elements. */
function drawsOn(element: Element, selector: string): boolean {
  const plain = selector
    .replace(/::?(before|after|placeholder|marker)\b/g, "")
    .replace(/:(hover|focus-visible|focus-within|focus|active)\b/g, "");
  try {
    return plain !== "" && element.matches(plain);
  } catch {
    return false;
  }
}

// Made-up businesses, people and addresses, one of each field among them.
function item(
  type: RelatedItem["type"],
  label: string,
  role: RelatedItem["role"],
  matched = false,
): RelatedItem {
  return {
    type,
    token: `tok-${label}`,
    label,
    role,
    matched,
    address: null,
    states: null,
    domicile_state: null,
  };
}

function set(items: RelatedItem[], count = items.length): RelatedSet {
  return {
    count,
    matched: items.some(each => each.matched) ? 1 : null,
    truncated: false,
    items,
  };
}

const ROWS: BusinessSuggestion[] = [
  {
    type: "business",
    token: "tok-a",
    label: "HARBOR CONCRETE PUMPING CO., INC.",
    matched_name: null,
    match: "strong",
    domicile_state: "PA",
    states: ["MD", "NY", "OH", "PA", "WV"],
    structure: "C_CORPORATION",
    related: {
      people: set(
        [
          item("person", "Dana Whitfield", "officer"),
          item("person", "Luis Ortega", "officer"),
        ],
        4,
      ),
      addresses: set([
        item(
          "address",
          "1200 Tallowmere Rd, Pittsburgh, PA 15212",
          "principal",
        ),
      ]),
    },
    highlight: [
      { text: "HARBOR", matched: true },
      { text: " ", matched: false },
      { text: "CONCRETE", matched: true },
      { text: " PUMPING CO., INC.", matched: false },
    ],
  },
  {
    type: "business",
    token: "tok-b",
    label: "NORTHSHORE PUMPING, LLC",
    matched_name: "HARBOR CONCRETE PUMPS",
    match: "partial",
    domicile_state: "OH",
    states: ["OH", "PA"],
    structure: "LLC",
    related: {
      people: set([item("person", "MERIDIAN REGISTERED AGENTS, LLC", "agent")]),
      addresses: set([
        item("address", "88 Velloway St, Akron, OH 44308", "officer", true),
      ]),
    },
    highlight: [
      { text: "HARBOR", matched: true },
      { text: " ", matched: false },
      { text: "CONCRETE", matched: true },
      { text: " PUMPS", matched: false },
    ],
  },
  {
    type: "business",
    token: "tok-c",
    label: "HARBOR CONCRETE SUPPLY, INC.",
    matched_name: null,
    match: "strong",
    domicile_state: "NJ",
    states: ["NJ"],
    structure: null,
    related: { people: set([]), addresses: set([]) },
    highlight: [
      { text: "HARBOR", matched: true },
      { text: " ", matched: false },
      { text: "CONCRETE", matched: true },
      { text: " SUPPLY, INC.", matched: false },
    ],
  },
];

interface Drawn {
  tag: string;
  attributes: Record<string, string>;
  rules: string[];
  style: Record<string, string>;
  pseudo: Record<string, string>;
  children: (Drawn | string)[];
}

/** An element as it draws: its markup, its rules, its text and its styles. */
function drawn(
  element: Element,
  rules: { selector: string; text: string }[],
): Drawn {
  const computed = getComputedStyle(element);
  return {
    tag: element.tagName.toLowerCase(),
    attributes: Object.fromEntries(
      [...element.attributes]
        // Ids are minted per render; what refers to them is checked by role.
        .filter(({ name }) => name !== "id" && !name.startsWith("aria-"))
        .map(({ name, value }) => [name, value]),
    ),
    rules: rules
      .filter(({ selector }) =>
        selectors(selector).some(part => drawsOn(element, part)),
      )
      .map(({ text }) => text),
    style: Object.fromEntries(
      STYLES.map(name => [name, computed.getPropertyValue(name)]),
    ),
    pseudo: Object.fromEntries(
      (["::before", "::after"] as const).flatMap(pseudo => {
        const content = getComputedStyle(element, pseudo).content;
        return content === "none" || content === "normal"
          ? []
          : [[pseudo, content]];
      }),
    ),
    children: [...element.childNodes].flatMap((node): (Drawn | string)[] =>
      node.nodeType === Node.ELEMENT_NODE
        ? [drawn(node as Element, rules)]
        : node.nodeType === Node.TEXT_NODE && node.textContent !== ""
          ? [node.textContent ?? ""]
          : [],
    ),
  };
}

/** The view as a host draws it, held open, with its own layout or none. */
async function pinned(file: string, layout?: RowLayoutInput) {
  const host = document.createElement("div");
  host.style.width = "560px";
  host.style.fontFamily = "sans-serif";
  document.body.append(host);
  const root = createRoot(host);
  flushSync(() =>
    root.render(
      <BusinessAutocompleteView
        id="pinned"
        label="Business name"
        value="harbor concr"
        onInputChange={() => {}}
        onSelect={() => {}}
        suggestions={ROWS}
        found={27}
        foundCapped={false}
        truncated={false}
        indexTag="sample"
        roundTripMs={42}
        isSearching={false}
        error={null}
        open
        {...(layout !== undefined ? { layout } : {})}
      />,
    ),
  );
  try {
    await expect(
      JSON.stringify(drawn(host.querySelector(".bl-ac")!, sdkRules()), null, 1),
    ).toMatchFileSnapshot(`./__snapshots__/${file}`);
  } finally {
    root.unmount();
    host.remove();
  }
}

describe("the business typeahead with nothing of the host's own", () => {
  it("draws its menu exactly as it always has", async () => {
    await pinned("business-default.json");
  });

  it("draws a host's own layout exactly as it always has, every corner rule reached", async () => {
    // Text at the title's right, and a flag pinned beside the subtitle's
    // text: the corners the default never fills.
    await pinned("business-laid-out.json", {
      titleTrailing: "people",
      subtitleBadge: "structure",
    });
  });
});
