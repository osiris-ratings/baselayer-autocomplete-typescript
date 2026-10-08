import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { commands, page } from "vitest/browser";

import type {
  AddressSuggestion,
  BusinessSuggestion,
  EntityType,
  LookInput,
  PersonSuggestion,
  RelatedItem,
} from "@baselayer-sdk/autocomplete";
import {
  AddressAutocompleteView,
  BusinessAutocompleteView,
  PersonAutocompleteView,
} from "@baselayer-sdk/autocomplete/react";

import { PRESETS } from "../../site/demo/style-state";
import "../../src/react/styles.css";

declare module "vitest/browser" {
  interface BrowserCommands {
    /** Emulates `forced-colors: active`, or lifts it. */
    forcedColors: (active: boolean) => Promise<void>;
  }
}

// Made-up people and businesses: one business with a token, which is enabled,
// and one without, which is disabled, each drawing the same fields.
const business = (label: string, token: string | null): RelatedItem => ({
  type: "business",
  token,
  label,
  role: "officer",
  matched: false,
  address: "1200 Tallowmere Rd, Pittsburgh, PA 15212",
  states: ["OH", "PA"],
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
      matched: null,
      truncated: false,
      items: [
        business("HARBOR CONCRETE PUMPING, LLC", "tok-harbor"),
        business("NORTHSHORE CRANE HIRE, LLC", null),
      ],
    },
    addresses: { count: null, matched: null, truncated: false, items: [] },
  },
};

function draw(look?: LookInput) {
  const host = document.createElement("div");
  host.style.width = "760px";
  host.style.fontFamily = "sans-serif";
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
  const [enabled, disabled] = host.querySelectorAll<HTMLElement>(
    '[data-testid="business-line"]',
  );
  return {
    head: host.querySelector<HTMLElement>('[data-testid="group-head"]')!,
    enabled: enabled!,
    disabled: disabled!,
    done() {
      root.unmount();
      host.remove();
    },
  };
}

type Rgb = [number, number, number];

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
 * A text's contrast as it is drawn, read from a screenshot of its element:
 * the ground is its commonest pixel, and the ink the strongest tenth of its
 * pixels against it, so antialiasing a thin stroke costs what it costs.
 */
async function drawnContrast(element: Element): Promise<number> {
  // Something to read: a text squeezed to nothing would measure its ground.
  expect(element.getBoundingClientRect().width).toBeGreaterThan(30);
  const base64 = await page.screenshot({ element, save: false });
  const image = new Image();
  image.src = `data:image/png;base64,${base64}`;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d")!;
  context.drawImage(image, 0, 0);
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  const pixels: Rgb[] = [];
  const seen = new Map<string, number>();
  for (let at = 0; at < data.length; at += 4) {
    const pixel: Rgb = [data[at]!, data[at + 1]!, data[at + 2]!];
    pixels.push(pixel);
    const key = pixel.join();
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  const [groundKey] = [...seen].sort((a, b) => b[1] - a[1])[0]!;
  const ground = groundKey.split(",").map(Number) as Rgb;
  const strongest = pixels
    .map(pixel => contrast(pixel, ground))
    .sort((a, b) => b - a)
    .slice(0, Math.max(1, Math.round(pixels.length / 10)));
  return strongest.reduce((sum, each) => sum + each, 0) / strongest.length;
}

const part = (line: HTMLElement, selector: string) =>
  line.querySelector<HTMLElement>(selector)!;

describe("a disabled line", () => {
  it("has its squares and icons drained of colour, its text faded toward the ground and its squares dimmed; an enabled line has not", () => {
    const { head, enabled, disabled, done } = draw();
    try {
      // No filter on the line itself, which would grey a match mark too.
      expect(getComputedStyle(disabled).filter).toBe("none");
      for (const colour of [".bl-ac-states", ".bl-ac-icon"]) {
        expect(getComputedStyle(part(disabled, colour)).filter, colour).toBe(
          "saturate(0)",
        );
        expect(getComputedStyle(part(enabled, colour)).filter, colour).toBe(
          "none",
        );
      }
      expect(
        getComputedStyle(part(disabled, ".bl-ac-states")).opacity,
      ).not.toBe("1");
      expect(
        getComputedStyle(part(disabled, ".bl-ac-line-name")).color,
      ).not.toBe(getComputedStyle(part(enabled, ".bl-ac-line-name")).color);
      expect(getComputedStyle(part(disabled, ".bl-ac-role")).color).not.toBe(
        getComputedStyle(part(enabled, ".bl-ac-role")).color,
      );
      expect(getComputedStyle(enabled).filter).toBe("none");
      // The head, a person's, is not a pick by default: it fades too, its
      // icon drained of colour and nothing else.
      expect(getComputedStyle(head).filter).toBe("none");
      expect(getComputedStyle(part(head, ".bl-ac-icon")).filter).toBe(
        "saturate(0)",
      );
      expect(getComputedStyle(part(enabled, ".bl-ac-states")).opacity).toBe(
        "1",
      );
    } finally {
      done();
    }
  });

  for (const preset of PRESETS) {
    it(`reads as inactive on ${preset.name}: its name at 3:1 or more and well below an enabled one's, its secondary text 40% or more below and still there`, async () => {
      const { enabled, disabled, done } = draw(preset.look);
      try {
        const drawn = async (selector: string) => ({
          enabled: await drawnContrast(part(enabled, selector)),
          disabled: await drawnContrast(part(disabled, selector)),
        });
        const name = await drawn(".bl-ac-line-name");
        expect(name.disabled, "name").toBeGreaterThanOrEqual(3);
        expect(name.disabled, "name").toBeLessThanOrEqual(0.6 * name.enabled);
        for (const selector of [".bl-ac-address", ".bl-ac-role"]) {
          const secondary = await drawn(selector);
          expect(secondary.disabled, selector).toBeLessThanOrEqual(
            0.6 * secondary.enabled,
          );
          // Faded, but still there to be read.
          expect(secondary.disabled, selector).toBeGreaterThanOrEqual(1.5);
        }
      } finally {
        done();
      }
    });
  }

  it("does not fade at all, nor cost a filter, with the look's disabledDim at 0", () => {
    const { enabled, disabled, done } = draw({ disabledDim: 0 });
    try {
      expect(getComputedStyle(disabled).filter).toBe("none");
      expect(getComputedStyle(part(disabled, ".bl-ac-states")).opacity).toBe(
        "1",
      );
      expect(getComputedStyle(part(disabled, ".bl-ac-line-name")).color).toBe(
        getComputedStyle(part(enabled, ".bl-ac-line-name")).color,
      );
    } finally {
      done();
    }
  });

  it("draws as any other line under forced colours", async () => {
    await commands.forcedColors(true);
    const { disabled, done } = draw();
    try {
      expect(getComputedStyle(disabled).filter).toBe("none");
      expect(getComputedStyle(part(disabled, ".bl-ac-states")).opacity).toBe(
        "1",
      );
    } finally {
      done();
      await commands.forcedColors(false);
    }
  });
});

// A row of each search, its head enabled or not.
const PIER: AddressSuggestion = {
  type: "address",
  token: "tok-pier",
  label: "77 Quillfeather Ln, Dover, DE 19904",
  matched_name: null,
  match: "strong",
  // Marked as "77 quill" is typed: much of an address's label is the mark.
  highlight: [
    { text: "77 Quill", matched: true },
    { text: "feather Ln, Dover, DE 19904", matched: false },
  ],
  components: {
    line1: "77 Quillfeather Ln",
    line2: null,
    city: "Dover",
    state: "DE",
    postal_code: "19904",
  },
  related: {
    businesses: DANA.related.businesses,
    people: { count: null, matched: null, truncated: false, items: [] },
  },
};

const HARBOR: BusinessSuggestion = {
  type: "business",
  token: "tok-harbor",
  label: "HARBOR CONCRETE PUMPING, LLC",
  matched_name: null,
  match: "strong",
  domicile_state: "PA",
  states: ["OH", "PA"],
  structure: "LLC",
  highlight: [],
  related: {
    people: {
      count: 1,
      matched: null,
      truncated: false,
      items: [{ ...business("Dana Whitfield", "tok-dana"), type: "person" }],
    },
    addresses: {
      count: 1,
      matched: null,
      truncated: false,
      items: [
        {
          ...business("1200 Tallowmere Rd, Pittsburgh, PA 15212", null),
          type: "address",
          address: null,
          states: null,
          domicile_state: null,
        },
      ],
    },
  },
};

const viewProps = {
  value: "harbor",
  onInputChange: () => {},
  onSelect: () => {},
  found: 1,
  foundCapped: false,
  truncated: false,
  indexTag: null,
  roundTripMs: null,
  isSearching: false,
  error: null,
  open: true,
};

/** A search's row with its head enabled or not: the head, its name and its secondary text. */
function head(
  search: "person" | "address" | "business",
  enabled: boolean,
  look: LookInput,
) {
  const host = document.createElement("div");
  host.style.width = "760px";
  host.style.fontFamily = "sans-serif";
  document.body.append(host);
  const root = createRoot(host);
  const lines: EntityType[] = enabled
    ? ["business", "person", "address"]
    : search === "business"
      ? ["person"]
      : ["business"];
  flushSync(() =>
    root.render(
      search === "person" ? (
        <PersonAutocompleteView
          {...viewProps}
          id="person"
          suggestions={[DANA]}
          enabledLines={lines}
          look={look}
        />
      ) : search === "address" ? (
        <AddressAutocompleteView
          {...viewProps}
          id="address"
          suggestions={[PIER]}
          enabledLines={lines}
          look={look}
        />
      ) : (
        <BusinessAutocompleteView
          {...viewProps}
          id="business"
          suggestions={[HARBOR]}
          list={["people"]}
          enabledLines={lines}
          look={look}
        />
      ),
    ),
  );
  const group = host.querySelector<HTMLElement>('[role="group"]')!;
  const line = group.firstElementChild as HTMLElement;
  return {
    head: line,
    name: part(line, ".bl-ac-name"),
    // A person's and an address's head says its counts; a business's head,
    // its address.
    secondary: part(
      line,
      search === "business" ? ".bl-ac-address" : ".bl-ac-group-count",
    ),
    done() {
      root.unmount();
      host.remove();
    },
  };
}

describe("a row's head that is not a pick", () => {
  for (const preset of PRESETS.filter(
    each => each.name === "Light" || each.name === "Midnight",
  )) {
    for (const search of ["person", "address", "business"] as const) {
      const article = search === "address" ? "an" : "a";
      it(`fades on ${article} ${search}'s row as a disabled line does, its name and its secondary text, on ${preset.name}, and not when it is a pick`, async () => {
        const enabled = head(search, true, preset.look);
        const enabledName = await drawnContrast(enabled.name);
        const enabledSecondary = await drawnContrast(enabled.secondary);
        enabled.done();
        const disabled = head(search, false, preset.look);
        try {
          expect(disabled.head).toHaveAttribute("aria-disabled", "true");
          const disabledName = await drawnContrast(disabled.name);
          expect(disabledName, "name").toBeGreaterThanOrEqual(3);
          expect(disabledName, "name").toBeLessThanOrEqual(0.6 * enabledName);
          const disabledSecondary = await drawnContrast(disabled.secondary);
          expect(disabledSecondary, "secondary").toBeLessThanOrEqual(
            0.6 * enabledSecondary,
          );
          // Faded, but still there to be read.
          expect(disabledSecondary, "secondary").toBeGreaterThanOrEqual(1.5);
        } finally {
          disabled.done();
        }
      });
    }
  }
});

/** Every element from `element` up to the menu draws without a filter. */
function unfiltered(element: Element): boolean {
  for (let at: Element | null = element; at !== null; at = at.parentElement) {
    if (getComputedStyle(at).filter !== "none") return false;
    if (at.classList.contains("bl-ac-menu")) break;
  }
  return true;
}

describe("a match mark on a head that is not a pick", () => {
  const marked = {
    person: {
      ...DANA,
      highlight: [
        { text: "Dana", matched: true },
        { text: " Whitfield", matched: false },
      ],
    },
    business: {
      ...HARBOR,
      highlight: [
        { text: "HARBOR", matched: true },
        { text: " CONCRETE PUMPING, LLC", matched: false },
      ],
    },
  };

  function drawMarked(
    search: "person" | "business",
    enabled: boolean,
    look: LookInput,
  ) {
    const host = document.createElement("div");
    host.style.width = "760px";
    document.body.append(host);
    const root = createRoot(host);
    const lines: EntityType[] = enabled
      ? ["business", "person", "address"]
      : search === "business"
        ? ["person"]
        : ["business"];
    flushSync(() =>
      root.render(
        search === "person" ? (
          <PersonAutocompleteView
            {...viewProps}
            value="dana"
            id="person"
            suggestions={[marked.person]}
            enabledLines={lines}
            look={look}
          />
        ) : (
          <BusinessAutocompleteView
            {...viewProps}
            value="harbor"
            id="business"
            suggestions={[marked.business]}
            list={["people"]}
            enabledLines={lines}
            look={look}
          />
        ),
      ),
    );
    return {
      mark: host.querySelector<HTMLElement>('[role="group"] .bl-ac-mark')!,
      ground: rgbOf(
        getComputedStyle(host.querySelector(".bl-ac-menu")!).backgroundColor,
      ),
      done() {
        root.unmount();
        host.remove();
      },
    };
  }

  /** The mark's colour that the emphasis draws in. */
  const markColour = (mark: HTMLElement, emphasis: string) => {
    const style = getComputedStyle(mark);
    return rgbOf(
      emphasis === "underline"
        ? style.textDecorationColor
        : emphasis === "background"
          ? style.backgroundColor
          : style.color,
    );
  };

  const cases: [string, LookInput, "person" | "business"][] = [];
  for (const preset of PRESETS.filter(
    each => each.name === "Light" || each.name === "Midnight",
  )) {
    for (const search of ["person", "business"] as const) {
      cases.push([preset.name, preset.look, search]);
    }
  }
  const light = PRESETS.find(each => each.name === "Light")!.look;
  for (const emphasis of ["background", "ink"] as const) {
    cases.push([
      `Light, ${emphasis}`,
      { ...light, matchEmphasis: emphasis },
      "person",
    ]);
  }

  for (const [name, look, search] of cases) {
    it(`keeps its hue, a little faded, on a ${search}'s head, on ${name}`, () => {
      const emphasis = String(look.matchEmphasis ?? "underline");
      const enabled = drawMarked(search, true, look);
      const was = markColour(enabled.mark, emphasis);
      const ground = enabled.ground;
      enabled.done();
      const disabled = drawMarked(search, false, look);
      try {
        const now = markColour(disabled.mark, emphasis);
        expect(Math.abs(hueDistance(hue(now), hue(was)))).toBeLessThan(12);
        // Lighter: at least a fifth of its contrast above the flat ground gone.
        const lost =
          (contrast(was, ground) - contrast(now, ground)) /
          (contrast(was, ground) - 1);
        expect(lost).toBeGreaterThan(0.2);
        if (emphasis !== "background") {
          expect(contrast(now, ground)).toBeGreaterThanOrEqual(2);
        }
        // Nothing between it and the menu greys what it is drawn in.
        expect(unfiltered(disabled.mark)).toBe(true);
      } finally {
        disabled.done();
      }
    });
  }
});

/** A computed colour, `rgb()`, `rgba()` or `color(srgb …)`, as 0–255 channels. */
function rgbOf(color: string): Rgb {
  const srgb = /color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)/.exec(color);
  if (srgb !== null) {
    return [1, 2, 3].map(at => Number(srgb[at]) * 255) as Rgb;
  }
  const [r, g, b] = color.match(/[\d.]+/g)!.map(Number);
  return [r!, g!, b!];
}

/** An sRGB colour's hue, in degrees. */
function hue([r, g, b]: Rgb): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  const h =
    max === r
      ? ((g - b) / d) % 6
      : max === g
        ? (b - r) / d + 2
        : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}
