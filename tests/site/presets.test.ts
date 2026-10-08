import {
  MATCH_EMPHASES,
  MATCH_REGIONS,
  ROW_KINDS,
} from "@baselayer-sdk/autocomplete";
import { describe, expect, it } from "vitest";

import {
  CSS_VARIABLES,
  DEFAULT_STYLE,
  FONT_CHOICES,
  INITIAL_STYLE,
  PRESETS,
  activePreset,
  applyPreset,
  lineKinds,
  withEnabled,
  withIconSegment,
  withListOrder,
  withListed,
  type Preset,
} from "../../site/demo/style-state";

const ROUTES = ["businesses", "people", "addresses"] as const;
const HIGHLIGHT = [
  "matchEmphasis",
  "matchEmphasisRegion",
  "matchEmphasisColor",
] as const;
const sorted = (values: readonly string[]) => [...values].sort();

/** A preset that sets a person's row, and one that sets none. */
function withRows(): Preset {
  const preset = PRESETS.find(
    each => (each.rows?.people?.list?.length ?? 0) > 1,
  );
  expect(preset, "a preset that lists more than one line").toBeDefined();
  return preset!;
}

describe("a preset", () => {
  it("opens the demo on Light, today's demo: its highlight and every row the defaults", () => {
    const [light] = PRESETS;
    expect(light!.name).toBe("Light");
    expect(light!.highlight).toBeUndefined();
    expect(light!.rows).toBeUndefined();
    expect(INITIAL_STYLE.rows).toEqual(DEFAULT_STYLE.rows);
    for (const key of HIGHLIGHT) {
      expect(INITIAL_STYLE.look[key], key).toBe(DEFAULT_STYLE.look[key]);
    }
  });

  it("sets its colors, its highlight, and every search's lines, Enabled and icons at once", () => {
    const from = withRows();
    for (const preset of PRESETS) {
      // From what another preset left, so nothing of it carries over.
      const state = applyPreset(applyPreset(DEFAULT_STYLE, from), preset);
      for (const key of HIGHLIGHT) {
        expect(state.look[key], `${preset.name} ${key}`).toBe(
          preset.highlight?.[key] ?? DEFAULT_STYLE.look[key],
        );
      }
      for (const route of ROUTES) {
        const row = preset.rows?.[route];
        const base = DEFAULT_STYLE.rows[route];
        const at = `${preset.name} ${route}`;
        expect(state.rows[route].list, at).toEqual(row?.list ?? base.list);
        expect(sorted(state.rows[route].enabled), at).toEqual(
          sorted(row?.enabled ?? base.enabled),
        );
        expect(sorted(state.rows[route].iconSegments), at).toEqual(
          sorted(row?.iconSegments ?? base.iconSegments),
        );
      }
      expect(activePreset(state)?.name, preset.name).toBe(preset.name);
    }
  });

  it("keeps the fields the reader has placed in each row", () => {
    const placed = {
      ...DEFAULT_STYLE,
      rows: {
        ...DEFAULT_STYLE.rows,
        people: {
          ...DEFAULT_STYLE.rows.people,
          layout: { ...DEFAULT_STYLE.rows.people.layout, headTrailing: null },
        },
      },
    };
    expect(applyPreset(placed, withRows()).rows.people.layout).toEqual(
      placed.rows.people.layout,
    );
  });

  it("is active only while all of it matches: a line, an Enabled box, an icon or the highlight changed is Custom", () => {
    const preset = withRows();
    const state = applyPreset(DEFAULT_STYLE, preset);
    const people = state.rows.people;
    const [first, second] = people.list;
    expect(activePreset(state)?.name).toBe(preset.name);

    expect(activePreset(withListed(state, "people", first!, false))).toBeNull();
    expect(activePreset(withListOrder(state, "people", second!, 0))).toBeNull();
    expect(
      activePreset(
        withEnabled(
          state,
          "people",
          "person",
          !people.enabled.includes("person"),
        ),
      ),
    ).toBeNull();
    expect(
      activePreset(
        withIconSegment(
          state,
          "people",
          "name",
          !people.iconSegments.includes("name"),
        ),
      ),
    ).toBeNull();
    const emphasis = state.look.matchEmphasis === "plain" ? "weight" : "plain";
    expect(
      activePreset({
        ...state,
        look: { ...state.look, matchEmphasis: emphasis },
      }),
    ).toBeNull();
  });

  it("counts the Enabled boxes and icons as sets: the order they were ticked in does not matter", () => {
    const preset = withRows();
    const state = applyPreset(DEFAULT_STYLE, preset);
    const row = state.rows.people;
    const reordered = {
      ...state,
      rows: {
        ...state.rows,
        people: {
          ...row,
          enabled: [...row.enabled].reverse(),
          iconSegments: [...row.iconSegments].reverse(),
        },
      },
    };
    expect(activePreset(reordered)?.name).toBe(preset.name);
  });
});

describe("the presets", () => {
  it("are about twenty, Light first, each named in one plain word", () => {
    expect(PRESETS.length).toBeGreaterThanOrEqual(18);
    expect(PRESETS.length).toBeLessThanOrEqual(22);
    expect(PRESETS[0]!.name).toBe("Light");
    const names = PRESETS.map(preset => preset.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name).toMatch(/^\p{Lu}\p{Ll}+$/u);
  });

  it("mark matches every way the menu can, over both regions", () => {
    const applied = PRESETS.map(
      preset => applyPreset(DEFAULT_STYLE, preset).look,
    );
    expect(new Set(applied.map(look => look.matchEmphasis))).toEqual(
      new Set(MATCH_EMPHASES),
    );
    expect(new Set(applied.map(look => look.matchEmphasisRegion))).toEqual(
      new Set(MATCH_REGIONS),
    );
  });

  it("change the font in about a third, only to fonts the Font fold offers", () => {
    const offered: readonly string[] = FONT_CHOICES.map(choice => choice.value);
    const fonts = PRESETS.flatMap(preset => {
      const font = preset.vars["--bl-ac-font"];
      return font === undefined ? [] : [font];
    });
    expect(fonts.length).toBeGreaterThanOrEqual(PRESETS.length / 4);
    expect(fonts.length).toBeLessThanOrEqual(PRESETS.length / 2);
    for (const font of fonts) expect(offered).toContain(font);
  });

  it("vary the shape or size in most", () => {
    const owned = [
      "--bl-ac-radius",
      "--bl-ac-pill-radius",
      "--bl-ac-shadow",
      "--bl-ac-line-height",
      "--bl-ac-name-weight",
      "--bl-ac-weight-base",
      "--bl-ac-weight-mark",
    ] as const;
    const varied = PRESETS.filter(preset =>
      owned.some(
        name =>
          preset.vars[name] !== undefined &&
          preset.vars[name] !== CSS_VARIABLES[name].value,
      ),
    );
    expect(varied.length).toBeGreaterThan(PRESETS.length / 2);
  });

  it("put its font, shape and size on, and take them back off for a preset that leaves them", () => {
    const fonted = PRESETS.find(preset => preset.vars["--bl-ac-font"])!;
    const state = applyPreset(DEFAULT_STYLE, fonted);
    expect(state.vars["--bl-ac-font"]).toBe(fonted.vars["--bl-ac-font"]);
    const back = applyPreset(state, PRESETS[0]!);
    for (const name of [
      "--bl-ac-font",
      "--bl-ac-line-height",
      "--bl-ac-name-weight",
      "--bl-ac-weight-base",
      "--bl-ac-weight-mark",
    ] as const) {
      expect(back.vars[name], name).toBe(CSS_VARIABLES[name].value);
    }
    expect(
      activePreset({
        ...state,
        vars: { ...state.vars, "--bl-ac-line-height": "2" },
      }),
    ).toBeNull();
  });

  it("list more lines in some and change the icons in others, each a row its search can draw", () => {
    let more = 0;
    let icons = 0;
    for (const preset of PRESETS) {
      for (const route of ROUTES) {
        const row = preset.rows?.[route];
        if (row === undefined) continue;
        const kinds = lineKinds(route);
        const relations = kinds.flatMap(kind =>
          kind.relation === null ? [] : [kind.relation],
        );
        const entities = kinds.map(kind => kind.entity);
        const segments: readonly string[] = ROW_KINDS[route].iconSegments;
        const at = `${preset.name} ${route}`;
        for (const relation of row.list ?? [])
          expect(relations, at).toContain(relation);
        for (const entity of row.enabled ?? [])
          expect(entities, at).toContain(entity);
        for (const segment of row.iconSegments ?? [])
          expect(segments, at).toContain(segment);
        const base = DEFAULT_STYLE.rows[route];
        if ((row.list?.length ?? 0) > base.list.length) more++;
        if (
          row.iconSegments !== undefined &&
          sorted(row.iconSegments).join() !== sorted(base.iconSegments).join()
        )
          icons++;
      }
    }
    expect(more).toBeGreaterThanOrEqual(3);
    expect(icons).toBeGreaterThanOrEqual(3);
  });
});
