import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { commands, page } from "vitest/browser";

import type {
  LookInput,
  PersonSuggestion,
  RelatedItem,
} from "@baselayer-sdk/autocomplete";
import { PersonAutocompleteView } from "@baselayer-sdk/autocomplete/react";

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
  it("is drained of colour, its text faded toward the ground and its squares dimmed; an enabled line and the head are not", () => {
    const { head, enabled, disabled, done } = draw();
    try {
      expect(getComputedStyle(disabled).filter).toBe("saturate(0)");
      expect(
        getComputedStyle(part(disabled, ".bl-ac-states")).opacity,
      ).not.toBe("1");
      expect(
        getComputedStyle(part(disabled, ".bl-ac-line-name")).color,
      ).not.toBe(getComputedStyle(part(enabled, ".bl-ac-line-name")).color);
      expect(getComputedStyle(part(disabled, ".bl-ac-role")).color).not.toBe(
        getComputedStyle(part(enabled, ".bl-ac-role")).color,
      );
      for (const untouched of [enabled, head]) {
        expect(getComputedStyle(untouched).filter).toBe("none");
      }
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
