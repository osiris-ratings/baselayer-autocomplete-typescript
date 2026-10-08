import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { StylingPanel } from "../../site/demo/StylingPanel";
import { INITIAL_STYLE, PRESETS } from "../../site/demo/style-state";

import "../../site/shared/brand.css";
import "../../site/shared/fonts";
import "../../site/demo/demo.css";

/** The faces the presets name, loaded before anything is measured. */
const FACES = ['"Uncut Sans"', '"Newsreader Variable"', '"Geist Mono"'];

function mount(width: number) {
  const host = document.createElement("div");
  host.className = "demo";
  host.style.width = `${width}px`;
  document.body.append(host);
  const root = createRoot(host);
  flushSync(() =>
    root.render(<StylingPanel state={INITIAL_STYLE} onChange={() => {}} />),
  );
  return {
    host,
    done() {
      root.unmount();
      host.remove();
    },
  };
}

/** The element whose text is the preset's name. */
function textOf(name: HTMLElement): HTMLElement {
  const text = document.createTreeWalker(name, NodeFilter.SHOW_TEXT).nextNode();
  return text!.parentElement!;
}

/** The y of the line's alphabetic baseline: an empty inline-block's bottom
    edge is its baseline, and it sits on the line's. */
function baseline(text: HTMLElement): number {
  const probe = document.createElement("span");
  probe.style.cssText =
    "display:inline-block;width:0;height:0;vertical-align:baseline";
  text.append(probe);
  const y = probe.getBoundingClientRect().bottom;
  probe.remove();
  return y;
}

/** A font stack as both engines read it back: Safari drops the quotes. */
const stack = (family: string) =>
  family
    .replace(/["']/g, "")
    .replace(/\s*,\s*/g, ", ")
    .trim();

describe("the presets' names", () => {
  for (const width of [560, 320]) {
    it(`sit on one baseline, each in its preset's font, under swatches whose tops align, at ${width}px`, async () => {
      for (const face of FACES) await document.fonts.load(`11.5px ${face}`);
      for (const face of FACES) {
        expect(document.fonts.check(`11.5px ${face}`)).toBe(true);
      }
      const { host, done } = mount(width);
      try {
        const names = [...host.querySelectorAll<HTMLElement>(".preset-name")];
        expect(names).toHaveLength(PRESETS.length);

        names.forEach((name, at) => {
          const font = PRESETS[at]!.vars["--bl-ac-font"];
          if (font) {
            expect(stack(getComputedStyle(textOf(name)).fontFamily)).toBe(
              stack(font),
            );
          }
        });

        const baselines = names.map(name => baseline(textOf(name)));
        for (const [at, y] of baselines.entries()) {
          expect(
            Math.abs(y - baselines[0]!),
            `${PRESETS[at]!.name}'s baseline`,
          ).toBeLessThanOrEqual(0.5);
        }

        const heights = names.map(name => name.getBoundingClientRect().height);
        expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(
          0.5,
        );

        const tops = [...host.querySelectorAll(".preset-swatch")].map(
          swatch => swatch.getBoundingClientRect().top,
        );
        expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(0.5);
      } finally {
        done();
      }
    });
  }

  // Faces far taller or deeper than any preset's: the line is the mono's
  // whatever face the name is set in.
  const faces = document.createElement("style");
  faces.textContent = ["Tall:170%:15%", "Deep:40%:120%"]
    .map(spec => {
      const [name, ascent, descent] = spec.split(":");
      return `@font-face {
        font-family: "Preset ${name}";
        src: local("Liberation Serif"), local("DejaVu Serif"),
          local("Times New Roman"), local("Georgia"), local("Times");
        ascent-override: ${ascent};
        descent-override: ${descent};
      }`;
    })
    .join("\n");
  beforeAll(async () => {
    document.head.append(faces);
    await document.fonts.load('11.5px "Preset Tall"');
    await document.fonts.load('11.5px "Preset Deep"');
  });
  afterAll(() => {
    faces.remove();
  });

  for (const face of ['"Preset Tall"', '"Preset Deep"']) {
    it(`keep that baseline, and the line's height, in a face like ${face}`, () => {
      expect(document.fonts.check(`11.5px ${face}`)).toBe(true);
      const { host, done } = mount(560);
      try {
        const names = [...host.querySelectorAll<HTMLElement>(".preset-name")];
        const before = names.map(name => ({
          baseline: baseline(textOf(name)),
          height: name.getBoundingClientRect().height,
        }));
        for (const name of names) textOf(name).style.fontFamily = face;
        names.forEach((name, at) => {
          expect(
            Math.abs(baseline(textOf(name)) - before[at]!.baseline),
          ).toBeLessThanOrEqual(0.5);
          expect(
            Math.abs(name.getBoundingClientRect().height - before[at]!.height),
          ).toBeLessThanOrEqual(0.5);
        });
      } finally {
        done();
      }
    });
  }
});
