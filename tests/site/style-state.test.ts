import {
  BUSINESS_ROW,
  DEFAULT_ROW_LAYOUT,
  ROW_FIELDS,
  ROW_PLACES,
  drawnRowLayout,
  resolveLayout,
  resolveRowLayout,
  type BusinessRowLayout,
  type RowField,
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
  changedRowLayout,
  changedVars,
  exportCode,
  INITIAL_STYLE,
  placeOptions,
  canDrop,
  lineFields,
  moveField,
  unplacedFields,
  TRAY,
  presetChanges,
  CUSTOM_FONT,
  FONT_CHOICES,
  fontChoice,
  fontSnippets,
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
/** The default state with the business row's layout set. */
function withBusinessLayout(layout: RowLayout): StyleState {
  const row = DEFAULT_STYLE.rows.businesses;
  return {
    ...DEFAULT_STYLE,
    rows: {
      ...DEFAULT_STYLE.rows,
      businesses: { ...row, layout: { ...row.layout, ...layout } },
    },
  };
}

function everyLayout(): RowLayout[] {
  const choices = [null, ...ROW_FIELDS];
  return ROW_PLACES.reduce<Partial<RowLayout>[]>(
    (partial, place) =>
      partial.flatMap(layout =>
        choices
          .filter(
            field => field === null || !Object.values(layout).includes(field),
          )
          .map(field => ({ ...layout, [place]: field })),
      ),
    [{}],
  ) as RowLayout[];
}

describe("the Styling panel's exported configuration", () => {
  it("gives the props a host must give, the id filled in, before what changed", () => {
    expect(exportCode(DEFAULT_STYLE).tsx).toBe(
      [
        "<BusinessAutocomplete",
        '  id="business"',
        "  client={client}",
        "  value={value}",
        "  onChange={setValue}",
        "  onPick={(suggestion, pick) => …}",
        "/>",
        "// Nothing else changed from the defaults.",
      ].join("\n"),
    );
    expect(
      exportCode({ ...DEFAULT_STYLE, limit: 8 })
        .tsx.split("\n")
        .slice(5, 7),
    ).toEqual(["  onPick={(suggestion, pick) => …}", "  limit={8}"]);
  });

  it("says nothing of the row's layout while every place shows its default", () => {
    expect(exportCode(DEFAULT_STYLE).tsx).not.toContain("layout=");
  });

  it("names only the places that show another field, in reading order", () => {
    const { tsx } = exportCode(
      withBusinessLayout({
        ...DEFAULT_ROW_LAYOUT,
        titleBadge: null,
        titleTrailing: null,
        subtitle: "people",
        subtitleTrailing: "states",
      }),
    );

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
      const state = withBusinessLayout(layout);
      const written = exportedLayout(exportCode(state).tsx) ?? {};

      expect(written, JSON.stringify(layout)).toEqual(
        Object.fromEntries(changedRowLayout(state, "businesses")),
      );
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

  it("says nothing of when to mint while it mints on the first keystroke", () => {
    expect(DEFAULT_STYLE.mintOn).toBe("keystroke");
    expect(exportCode(DEFAULT_STYLE).tsx).not.toContain("mintOn");
  });

  it("names when to mint when it is not on the first keystroke", () => {
    expect(exportCode({ ...DEFAULT_STYLE, mintOn: "focus" }).tsx).toContain(
      'mintOn="focus"',
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

/** A business's whole row by default: today's head, nothing listed, no icon. */
const BUSINESS = resolveLayout(BUSINESS_ROW);

/** A business row's head, the places a business row has always had. */
function head(layout: BusinessRowLayout): RowLayout {
  return Object.fromEntries(
    ROW_PLACES.map(place => [place, layout[place]]),
  ) as RowLayout;
}

describe("the Components fold", () => {
  const key = (layout: object) => JSON.stringify(layout);

  it("opens on the SDK's default layout", () => {
    expect(DEFAULT_STYLE.rows.businesses.layout).toEqual(BUSINESS);
    expect(INITIAL_STYLE.rows.businesses.layout).toEqual(BUSINESS);
    expect(head(BUSINESS)).toEqual(DEFAULT_ROW_LAYOUT);
  });

  it("offers a line's places only its own line's fields", () => {
    expect(placeOptions(BUSINESS, "personTrailing").map(o => o.value)).toEqual([
      EMPTY_PLACE,
      "personRole",
    ]);
    expect(canDrop(BUSINESS, "states", "personBadge")).toBe(false);
  });

  it("names the fields each line kind can show", () => {
    expect(lineFields("businesses", null)).toEqual([
      "states",
      "structure",
      "address",
      "people",
      "counts",
    ]);
    expect(lineFields("businesses", "people")).toEqual(["personRole"]);
    expect(lineFields("people", "businesses")).toEqual([
      "address",
      "states",
      "role",
    ]);
  });

  it("offers every field in every place, and says which one a pick would swap", () => {
    const options = placeOptions(BUSINESS, "subtitle");

    expect(options.map(option => option.value)).toEqual([
      EMPTY_PLACE,
      "states",
      "structure",
      "address",
      "people",
      "counts",
    ]);
    expect(options.find(o => o.value === "states")?.label).toBe(
      "States, swaps with Title, right",
    );
    // An empty place has nothing to swap: the field just moves.
    expect(
      placeOptions(BUSINESS, "subtitleTrailingBadge").find(
        o => o.value === "states",
      )?.label,
    ).toBe("States, from Title, right");
    // Its own field, and a field placed nowhere, are just the field.
    expect(options.find(o => o.value === "address")?.label).toBe("Address");
    expect(
      placeOptions({ ...BUSINESS, subtitle: null }, "subtitle").find(
        o => o.value === "address",
      )?.label,
    ).toBe("Address");
  });

  it("never offers a badge the field it is pinned beside", () => {
    const beside = placeOptions(BUSINESS, "subtitleBadge");
    expect(beside.map(option => option.value)).not.toContain("address");
    expect(
      placeOptions(BUSINESS, "subtitleTrailingBadge").map(
        option => option.value,
      ),
    ).not.toContain("people");
    // The field place keeps offering its badge's field: that is no pin.
    expect(
      placeOptions(
        { ...BUSINESS, subtitleBadge: "structure", titleBadge: null },
        "subtitle",
      ).map(option => option.value),
    ).toContain("structure");
  });

  it("swaps a field picked from another place with the place's own, as a drop does", () => {
    expect(withPlaced(BUSINESS, "subtitle", "states")).toEqual({
      ...BUSINESS,
      titleTrailing: "address",
      subtitle: "states",
    });
    expect(withPlaced(BUSINESS, "subtitle", "states")).toEqual(
      moveField(BUSINESS, "states", "subtitle"),
    );
    // A field from the tray sends the place's own there; empty sends it too.
    expect(
      withPlaced({ ...BUSINESS, titleBadge: null }, "subtitle", "structure"),
    ).toEqual({
      ...BUSINESS,
      titleBadge: null,
      subtitle: "structure",
    });
    expect(withPlaced(BUSINESS, "titleBadge", EMPTY_PLACE)).toEqual({
      ...BUSINESS,
      titleBadge: null,
    });
  });

  it("loses no field while its options are browsed, as arrow keys pick each one on Windows", () => {
    // Every field but the one picked last stays on the row: each step is a
    // swap, and stepping back undoes it. The counts, which the default row
    // places nowhere, stay off it throughout.
    let layout = BUSINESS;
    for (const choice of ["people", "structure", "states"] as const) {
      layout = withPlaced(layout, "subtitle", choice);
      expect(unplacedFields(layout), choice).toEqual(["counts"]);
    }
    for (const choice of ["structure", "people", "address"] as const) {
      layout = withPlaced(layout, "subtitle", choice);
    }
    expect(unplacedFields(layout)).toEqual(["counts"]);
    expect(layout.subtitle).toBe("address");
  });

  it("can build any layout the SDK draws, and never places a field twice", () => {
    // Every choice the fold offers, from where it opens, until nothing new.
    const seen = new Map([[key(BUSINESS), BUSINESS]]);
    const queue = [BUSINESS];
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

    // Every head, as the row draws it: the fold shows nothing else.
    const drawn = new Set(everyLayout().map(drawnRowLayout).map(key));
    const heads = new Set([...seen.values()].map(head).map(key));
    expect([...heads].sort()).toEqual([...drawn].sort());
  });
});

describe("dragging a field", () => {
  it("drops it on a place, swapping in whatever that place held", () => {
    // The states onto the address: the address takes the states' place.
    expect(moveField(BUSINESS, "states", "subtitle")).toEqual({
      ...BUSINESS,
      titleTrailing: "address",
      subtitle: "states",
    });
    // Onto an empty place: the place it left is empty.
    expect(moveField(BUSINESS, "structure", "subtitleTrailingBadge")).toEqual({
      ...BUSINESS,
      titleBadge: null,
      subtitleTrailingBadge: "structure",
    });
  });

  it("hides a field dropped on the tray, and places one dragged out of it", () => {
    const hidden = moveField(BUSINESS, "people", TRAY);
    expect(hidden).toEqual({ ...BUSINESS, subtitleTrailing: null });
    expect(unplacedFields(hidden)).toEqual(["people", "counts"]);

    // From the tray onto a taken place: what that place held goes to the tray.
    const placed = moveField(hidden, "people", "subtitle");
    expect(placed).toEqual({
      ...BUSINESS,
      subtitle: "people",
      subtitleTrailing: null,
    });
    expect(unplacedFields(placed)).toEqual(["address", "counts"]);
  });

  it("takes a field only where the row would draw it, and not on its own place", () => {
    const spots = (field: RowField) =>
      ([...ROW_PLACES, TRAY] as const).filter(to =>
        canDrop(BUSINESS, field, to),
      );
    // Not beside itself, nor beside the people: with the lead empty, the
    // people's corner would be drawn in its place.
    expect(spots("address")).toEqual([
      "titleBadge",
      "titleTrailingBadge",
      "titleTrailing",
      "subtitleTrailing",
      TRAY,
    ]);
    expect(spots("people")).toEqual([
      "titleBadge",
      "titleTrailingBadge",
      "titleTrailing",
      "subtitle",
      "subtitleBadge",
      TRAY,
    ]);
    // A badge has no field of its own to be pinned beside.
    expect(spots("structure")).not.toContain("titleBadge");
    expect(spots("structure")).toHaveLength(ROW_PLACES.length);
  });

  it("takes a field from the tray anywhere the row draws it, and not back on it", () => {
    const hidden = moveField(BUSINESS, "people", TRAY);
    // The badge beside the empty right corner would be drawn as its field.
    expect(
      ROW_PLACES.filter(place => !canDrop(hidden, "people", place)),
    ).toEqual(["subtitleTrailingBadge"]);
    expect(canDrop(hidden, "people", TRAY)).toBe(false);
  });

  it("draws the row as it will be: a lead left empty takes the right corner", () => {
    expect(moveField(BUSINESS, "address", TRAY)).toEqual({
      ...BUSINESS,
      subtitle: "people",
      subtitleTrailing: null,
    });
  });

  // Every layout, field and place: slow on a loaded machine.
  it(
    "never places a field twice, from any layout, dropped anywhere",
    { timeout: 30_000 },
    () => {
      for (const layout of everyLayout()) {
        for (const field of ROW_FIELDS) {
          for (const to of [...ROW_PLACES, TRAY] as const) {
            const next = moveField({ ...BUSINESS, ...layout }, field, to);
            const drawn = ROW_PLACES.map(place => next[place]).filter(
              placed => placed !== null,
            );
            expect(new Set(drawn).size).toBe(drawn.length);
            expect(drawnRowLayout(head(next))).toEqual(head(next));
            if (to !== TRAY && canDrop({ ...BUSINESS, ...layout }, field, to)) {
              expect(next[to]).toBe(field);
            }
          }
        }
      }
    },
  );
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
    expect(presetChanges(INITIAL_STYLE)).toEqual({
      colors: 0,
      shape: 0,
      font: 0,
    });
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

    expect(presetChanges(midnight)).toEqual({ colors: 0, shape: 0, font: 0 });
    expect(presetChanges(changed)).toEqual({ colors: 1, shape: 1, font: 0 });
  });
});

describe("the Font fold", () => {
  // The demo as it opens, in the Light preset, with some variables set.
  const withVars = (vars: Partial<StyleState["vars"]>): StyleState => ({
    ...INITIAL_STYLE,
    vars: { ...INITIAL_STYLE.vars, ...vars },
  });

  it("opens on the page's font and the SDK's weights, and exports none of them", () => {
    expect(fontChoice(DEFAULT_STYLE.vars["--bl-ac-font"])).toBe("");
    expect(exportCode(DEFAULT_STYLE).css).not.toMatch(
      /--bl-ac-(font|weight|name-weight)/,
    );
  });

  it("names a stack it does not offer as the host's own", () => {
    for (const { value } of FONT_CHOICES) expect(fontChoice(value)).toBe(value);
    expect(fontChoice('"Inter", sans-serif')).toBe(CUSTOM_FONT);
  });

  it("counts the font and the weights apart from the shape", () => {
    expect(
      presetChanges(
        withVars({ "--bl-ac-weight-mark": "800", "--bl-ac-font": "serif" }),
      ),
    ).toEqual({ colors: 0, shape: 0, font: 2 });
  });

  it("exports the weights and the font that changed", () => {
    const css = exportCode(
      withVars({
        "--bl-ac-weight-mark": "800",
        "--bl-ac-font": '"Inter", sans-serif',
      }),
    ).css;
    expect(css).toContain("--bl-ac-weight-mark: 800;");
    expect(css).toContain('--bl-ac-font: "Inter", sans-serif;');
  });

  it("shows how to load a font of your own, in the weights picked", () => {
    const snippets = fontSnippets(
      withVars({
        "--bl-ac-font": '"Inter Tight", system-ui, sans-serif',
        "--bl-ac-weight-mark": "800",
      }),
    );
    const [html, css] = snippets.map(snippet => snippet.code);
    expect(snippets.map(snippet => snippet.label)).toEqual(["HTML", "CSS"]);
    // Every weight the component draws, once each, in order.
    expect(html).toContain("family=Inter+Tight:wght@500;600;800&display=swap");
    expect(css).toContain('font-family: "Inter Tight";');
    for (const code of [html, css]) {
      expect(code).toContain(
        '--bl-ac-font: "Inter Tight", system-ui, sans-serif;',
      );
      expect(code).toContain("--bl-ac-weight-mark: 800;");
    }
  });

  it("uses a stand-in family while the font is one this page offers", () => {
    const [html] = fontSnippets(DEFAULT_STYLE).map(snippet => snippet.code);
    expect(html).toContain("family=Your+Font:wght@500;600;700");
    expect(html).toContain('--bl-ac-font: "Your Font", system-ui, sans-serif;');
  });
});
