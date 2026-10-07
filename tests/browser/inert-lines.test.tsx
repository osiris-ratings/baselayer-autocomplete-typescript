import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { commands } from "vitest/browser";

import type {
  LookInput,
  PersonSuggestion,
  RelatedItem,
} from "@baselayer-sdk/autocomplete";
import { PersonAutocompleteView } from "@baselayer-sdk/autocomplete/react";

import "../../src/react/styles.css";

declare module "vitest/browser" {
  interface BrowserCommands {
    /** Emulates `forced-colors: active`, or lifts it. */
    forcedColors: (active: boolean) => Promise<void>;
  }
}

// Made-up people, addresses and businesses.
const related = (
  type: RelatedItem["type"],
  label: string,
  role: RelatedItem["role"],
): RelatedItem => ({
  type,
  token: `tok-${label}`,
  label,
  role,
  matched: false,
  address: type === "business" ? "1200 Tallowmere Rd, Pittsburgh, PA" : null,
  states: type === "business" ? ["PA"] : null,
  domicile_state: type === "business" ? "PA" : null,
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
      count: 1,
      matched: null,
      truncated: false,
      items: [
        related("business", "HARBOR CONCRETE PUMPING CO., INC.", "officer"),
      ],
    },
    addresses: {
      count: 1,
      matched: null,
      truncated: false,
      items: [
        related("address", "48 Linden St, Pittsburgh, PA 15206", "officer"),
      ],
    },
  },
};

function draw(look?: LookInput) {
  const host = document.createElement("div");
  host.style.width = "560px";
  document.body.append(host);
  const root = createRoot(host);
  flushSync(() =>
    root.render(
      <PersonAutocompleteView
        id="people"
        label="Person's name"
        value="dana"
        onInputChange={() => {}}
        onSelect={() => {}}
        list={["businesses", "addresses"]}
        suggestions={[DANA]}
        found={1}
        foundCapped={false}
        truncated={false}
        indexTag={null}
        roundTripMs={null}
        isSearching={false}
        error={null}
        open
        {...(look !== undefined ? { look } : {})}
      />,
    ),
  );
  return {
    head: host.querySelector<HTMLElement>('[data-testid="group-head"]')!,
    business: host.querySelector<HTMLElement>('[data-testid="business-line"]')!,
    address: host.querySelector<HTMLElement>('[data-testid="address-line"]')!,
    menu: host.querySelector<HTMLElement>(".bl-ac-menu")!,
    done() {
      root.unmount();
      host.remove();
    },
  };
}

type Rgb = [number, number, number];

function rgb(color: string): Rgb {
  const [r, g, b] = color.match(/[\d.]+/g)!.map(Number);
  return [r!, g!, b!];
}

/** A colour through `saturate(s)`, in sRGB, as the Filter Effects matrix has it. */
function saturate([r, g, b]: Rgb, s: number): Rgb {
  return [
    (0.213 + 0.787 * s) * r + (0.715 - 0.715 * s) * g + (0.072 - 0.072 * s) * b,
    (0.213 - 0.213 * s) * r + (0.715 + 0.285 * s) * g + (0.072 - 0.072 * s) * b,
    (0.213 - 0.213 * s) * r + (0.715 - 0.715 * s) * g + (0.072 + 0.928 * s) * b,
  ];
}

function luminance(color: Rgb): number {
  const [r, g, b] = color.map(channel => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: Rgb, b: Rgb): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light! + 0.05) / (dark! + 0.05);
}

/**
 * A text's colour as its line's filter and its own opacity leave it, over the
 * menu; `faded: false` reads it as an inert line would draw without fading.
 */
function effective(
  text: HTMLElement,
  line: HTMLElement,
  menu: HTMLElement,
  faded = true,
) {
  const filter = getComputedStyle(line).filter;
  const amount = (fn: string) =>
    faded
      ? Number(new RegExp(`${fn}\\(([\\d.]+)\\)`).exec(filter)?.[1] ?? 1)
      : 1;
  const s = amount("saturate");
  const o =
    amount("opacity") * (faded ? Number(getComputedStyle(text).opacity) : 1);
  const background = rgb(getComputedStyle(menu).backgroundColor);
  const ink = saturate(rgb(getComputedStyle(text).color), s);
  const shown = ink.map(
    (channel, at) => o * channel + (1 - o) * background[at]!,
  ) as Rgb;
  return contrast(shown, background);
}

const opacityOf = (element: Element) => getComputedStyle(element).opacity;

describe("a line that is not a pick", () => {
  it("fades: its colour drained, its name, icon and squares a little lighter; a pick and the head do not", () => {
    const { head, business, address, done } = draw();
    try {
      expect(getComputedStyle(address).filter).toBe("saturate(0.4)");
      expect(opacityOf(address.querySelector(".bl-ac-line-name")!)).toBe(
        "0.91",
      );
      expect(opacityOf(address.querySelector(".bl-ac-icon")!)).toBe("0.91");
      // The role, like any secondary text, is not made lighter.
      expect(opacityOf(address.querySelector(".bl-ac-role")!)).toBe("1");
      expect(getComputedStyle(business).filter).toBe("none");
      expect(opacityOf(business.querySelector(".bl-ac-line-name")!)).toBe("1");
      expect(getComputedStyle(head).filter).toBe("none");
    } finally {
      done();
    }
  });

  it("does not fade at all, nor cost a filter, with the look's inertDim at 0", () => {
    const { address, done } = draw({ inertDim: 0 });
    try {
      expect(getComputedStyle(address).filter).toBe("none");
      expect(opacityOf(address.querySelector(".bl-ac-line-name")!)).toBe("1");
    } finally {
      done();
    }
  });

  it("keeps its name at AA, and its secondary text no worse than unfaded", () => {
    const { address, menu, done } = draw();
    try {
      const name = address.querySelector<HTMLElement>(".bl-ac-line-name")!;
      const role = address.querySelector<HTMLElement>(".bl-ac-role")!;

      expect(effective(name, address, menu)).toBeGreaterThanOrEqual(4.5);
      expect(effective(role, address, menu)).toBeGreaterThanOrEqual(
        effective(role, address, menu, false),
      );
    } finally {
      done();
    }
  });

  it("draws as any other line under forced colours", async () => {
    await commands.forcedColors(true);
    const { address, done } = draw();
    try {
      expect(getComputedStyle(address).filter).toBe("none");
      expect(opacityOf(address.querySelector(".bl-ac-line-name")!)).toBe("1");
    } finally {
      done();
      await commands.forcedColors(false);
    }
  });
});
