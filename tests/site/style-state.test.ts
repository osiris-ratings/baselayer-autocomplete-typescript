import {
  DEFAULT_ROW_LAYOUT,
  ROW_FIELDS,
  ROW_PLACES,
  resolveRowLayout,
  type RowLayout,
} from "@baselayer-sdk/autocomplete";
import { describe, expect, it } from "vitest";

import {
  CSS_VARIABLES,
  DEFAULT_STYLE,
  EMPTY_PLACE,
  LOOK_COLORS,
  PRESETS,
  STRUCTURE_FLAGS,
  applyPreset,
  changedLayout,
  changedVars,
  exportCode,
  INITIAL_STYLE,
  placeOptions,
  presetChanges,
  presetColor,
  presetVar,
  withPlaced,
  type StyleState,
} from "../../site/demo/style-state";

/** What the exported `layout={{ … }}` says, read back, or null without one. */
function exportedLayout(tsx: string): Partial<RowLayout> | null {
  const written = /layout=\{(\{[^}]*\})\}/.exec(tsx)?.[1];
  return written === undefined
    ? null
    : (JSON.parse(
        written.replace(/(\w+):/g, '"$1":').replace(/,(\s*\})/, "$1"),
      ) as Partial<RowLayout>);
}

/** Every layout the SDK draws: each place a field or empty, no field twice. */
function everyLayout(): RowLayout[] {
  const choices = [null, ...ROW_FIELDS];
  return choices.flatMap(titleBadge =>
    choices.flatMap(titleTrailing =>
      choices.flatMap(subtitle =>
        choices.flatMap(subtitleTrailing => {
          const layout = {
            titleBadge,
            titleTrailing,
            subtitle,
            subtitleTrailing,
          };
          const placed = Object.values(layout).filter(field => field !== null);
          return new Set(placed).size === placed.length ? [layout] : [];
        }),
      ),
    ),
  );
}

describe("the Styling panel's exported configuration", () => {
  it("says nothing of the row's layout while every place shows its default", () => {
    expect(exportCode(DEFAULT_STYLE).tsx).not.toContain("layout=");
  });

  it("names only the places that show another field, in reading order", () => {
    const { tsx } = exportCode({
      ...DEFAULT_STYLE,
      layout: {
        titleBadge: null,
        titleTrailing: null,
        subtitle: "people",
        subtitleTrailing: "states",
      },
    });

    expect(tsx).toContain(
      `layout={{
    titleBadge: null,
    titleTrailing: null,
    subtitle: "people",
    subtitleTrailing: "states",
  }}`,
    );
  });

  it("reproduces the preview: the layout it writes is the one drawn, for every layout", () => {
    const layouts = everyLayout();
    for (const layout of layouts) {
      const state: StyleState = { ...DEFAULT_STYLE, layout };
      const written = exportedLayout(exportCode(state).tsx) ?? {};

      expect(written, JSON.stringify(layout)).toEqual(changedLayout(state));
      expect(resolveRowLayout(written), JSON.stringify(layout)).toEqual(layout);
    }
    expect(layouts.length).toBeGreaterThan(100);
  });

  it("says nothing of the menu's width while it follows the input's", () => {
    expect(exportCode(DEFAULT_STYLE).tsx).not.toContain(
      "menuFollowsInputWidth",
    );
  });

  it("gives the menu a width of its own when it is not to follow", () => {
    expect(
      exportCode({ ...DEFAULT_STYLE, menuFollowsInputWidth: false }).tsx,
    ).toContain("menuFollowsInputWidth={false}");
  });

  it("says nothing of when to mint while it mints on focus", () => {
    expect(exportCode(DEFAULT_STYLE).tsx).not.toContain("mintOn");
  });

  it("names when to mint when it is not on focus", () => {
    expect(exportCode({ ...DEFAULT_STYLE, mintOn: "keystroke" }).tsx).toContain(
      'mintOn="keystroke"',
    );
    expect(exportCode({ ...DEFAULT_STYLE, mintOn: "request" }).tsx).toContain(
      'mintOn="request"',
    );
  });

  it("says nothing of the structure flags while every one is the SDK's", () => {
    expect(exportCode(DEFAULT_STYLE).tsx).not.toContain("structures");
  });

  it("names only the flags relabeled, inside messages", () => {
    const { tsx } = exportCode({
      ...DEFAULT_STYLE,
      messages: { ...DEFAULT_STYLE.messages, noAddress: "Address unknown" },
      structures: {
        ...DEFAULT_STYLE.structures,
        LLC: "L.L.C.",
        OTHER: "Other",
      },
    });

    expect(tsx).toContain(
      `messages={{
    noAddress: "Address unknown",
    structures: { LLC: "L.L.C.", OTHER: "Other" },
  }}`,
    );
  });

  it("starts every structure flag at the SDK's own, and OTHER at none", () => {
    expect(DEFAULT_STYLE.structures).toEqual(STRUCTURE_FLAGS);
    expect(STRUCTURE_FLAGS.C_CORPORATION).toBe("C-Corp");
    expect(STRUCTURE_FLAGS.OTHER).toBe("");
  });
});

describe("the Components fold", () => {
  const key = (layout: RowLayout) => JSON.stringify(layout);

  it("opens on the SDK's default layout", () => {
    expect(DEFAULT_STYLE.layout).toEqual(DEFAULT_ROW_LAYOUT);
    expect(INITIAL_STYLE.layout).toEqual(DEFAULT_ROW_LAYOUT);
  });

  it("offers every field in every place, and says which one a pick would move", () => {
    const options = placeOptions(DEFAULT_ROW_LAYOUT, "subtitle");

    expect(options.map(option => option.value)).toEqual([
      EMPTY_PLACE,
      "states",
      "structure",
      "address",
      "people",
    ]);
    expect(options.find(o => o.value === "states")?.label).toBe(
      "States, from Title, right",
    );
    // Its own field, and a field placed nowhere, are just the field.
    expect(options.find(o => o.value === "address")?.label).toBe("Address");
    expect(
      placeOptions({ ...DEFAULT_ROW_LAYOUT, subtitle: null }, "subtitle").find(
        o => o.value === "address",
      )?.label,
    ).toBe("Address");
  });

  it("moves a field picked from another place, and empties the place it left", () => {
    expect(withPlaced(DEFAULT_ROW_LAYOUT, "subtitle", "states")).toEqual({
      titleBadge: "structure",
      titleTrailing: null,
      subtitle: "states",
      subtitleTrailing: "people",
    });
    expect(withPlaced(DEFAULT_ROW_LAYOUT, "titleBadge", EMPTY_PLACE)).toEqual({
      ...DEFAULT_ROW_LAYOUT,
      titleBadge: null,
    });
  });

  it("can build any layout the SDK draws, and never places a field twice", () => {
    // Every choice the fold offers, from where it opens, until nothing new.
    const seen = new Map([[key(DEFAULT_ROW_LAYOUT), DEFAULT_ROW_LAYOUT]]);
    const queue: RowLayout[] = [DEFAULT_ROW_LAYOUT];
    for (let layout = queue.shift(); layout; layout = queue.shift()) {
      for (const place of ROW_PLACES) {
        for (const option of placeOptions(layout, place)) {
          const next = withPlaced(layout, place, option.value);
          if (!seen.has(key(next))) {
            seen.set(key(next), next);
            queue.push(next);
          }
        }
      }
    }

    const every = everyLayout();
    expect([...seen.keys()].sort()).toEqual(every.map(key).sort());
  });
});

describe("the structure's colors", () => {
  /** WCAG's contrast ratio between two `#rrggbb` colors. */
  function contrast(a: string, b: string): number {
    const luminance = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map(at => {
        const channel = parseInt(hex.slice(at, at + 2), 16) / 255;
        return channel <= 0.03928
          ? channel / 12.92
          : ((channel + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (light! + 0.05) / (dark! + 0.05);
  }

  it("are listed in the Colors fold", () => {
    expect(LOOK_COLORS.map(color => color.key)).toEqual(
      expect.arrayContaining([
        "structurePillBackgroundColor",
        "structurePillForegroundColor",
      ]),
    );
  });

  it("are each preset's own, and readable", () => {
    for (const preset of PRESETS) {
      const { look } = applyPreset(DEFAULT_STYLE, preset);
      if (preset.name !== "Light") {
        expect(
          preset.look.structurePillBackgroundColor,
          preset.name,
        ).toBeDefined();
        expect(
          preset.look.structurePillForegroundColor,
          preset.name,
        ).toBeDefined();
      }
      expect(
        contrast(
          look.structurePillForegroundColor,
          look.structurePillBackgroundColor,
        ),
        preset.name,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("a color's reset", () => {
  const midnight = PRESETS.find(preset => preset.name === "Midnight")!;

  it("returns to the preset last applied, not to the defaults", () => {
    const state = {
      ...applyPreset(DEFAULT_STYLE, midnight),
      look: {
        ...applyPreset(DEFAULT_STYLE, midnight).look,
        titleColor: "#ff0000",
      },
    };

    expect(presetColor(state, "titleColor")).toBe(midnight.look.titleColor);
    expect(presetColor(state, "titleColor")).not.toBe(
      DEFAULT_STYLE.look.titleColor,
    );
  });

  it("returns a variable the preset sets to the preset's value", () => {
    const state = applyPreset(DEFAULT_STYLE, midnight);

    expect(presetVar(state, "--bl-ac-border")).toBe(
      midnight.vars["--bl-ac-border"],
    );
  });

  it("returns a color the last preset leaves alone to its default", () => {
    const light = PRESETS.find(preset => preset.name === "Light")!;
    const state = applyPreset(applyPreset(DEFAULT_STYLE, midnight), light);

    expect(presetVar(state, "--bl-ac-border")).toBe(
      CSS_VARIABLES["--bl-ac-border"].value,
    );
  });

  it("returns to the defaults before any preset is applied", () => {
    expect(presetColor(DEFAULT_STYLE, "titleColor")).toBe(
      DEFAULT_STYLE.look.titleColor,
    );
  });
});

describe("matched ink", () => {
  it("is left unset by default, so matched words keep the title's ink", () => {
    expect(changedVars(DEFAULT_STYLE).map(([name]) => name)).not.toContain(
      "--bl-ac-ink-mark",
    );
  });

  it("is a color of each preset's own, apart from its title's", () => {
    for (const preset of PRESETS) {
      const state = applyPreset(DEFAULT_STYLE, preset);

      expect(state.vars["--bl-ac-ink-mark"], preset.name).toMatch(
        /^#[0-9a-f]{6}$/i,
      );
      expect(state.vars["--bl-ac-ink-mark"], preset.name).not.toBe(
        state.look.titleColor,
      );
    }
  });
});

describe("the Colors and Shape and size counts", () => {
  it("count nothing in the preset the demo opens in", () => {
    expect(presetChanges(INITIAL_STYLE)).toEqual({ colors: 0, shape: 0 });
  });

  it("count against the preset last applied, not the defaults", () => {
    const midnight = applyPreset(
      DEFAULT_STYLE,
      PRESETS.find(preset => preset.name === "Midnight")!,
    );
    const changed = {
      ...midnight,
      look: { ...midnight.look, titleColor: "#ff0000" },
      vars: { ...midnight.vars, "--bl-ac-radius": "0" },
    };

    expect(presetChanges(midnight)).toEqual({ colors: 0, shape: 0 });
    expect(presetChanges(changed)).toEqual({ colors: 1, shape: 1 });
  });
});
