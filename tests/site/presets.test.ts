import {
  MATCH_EMPHASES,
  MATCH_REGIONS,
  ROW_KINDS,
  resolveLayout,
  type RowKind,
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
  componentProps,
  exportCode,
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

  it("sets each search's layout, staged over the defaults as a host's is, and Light puts the defaults back", () => {
    const moved = {
      ...DEFAULT_STYLE,
      rows: {
        ...DEFAULT_STYLE.rows,
        people: {
          ...DEFAULT_STYLE.rows.people,
          layout: { ...DEFAULT_STYLE.rows.people.layout, headTrailing: null },
        },
      },
    };
    for (const preset of PRESETS) {
      const state = applyPreset(moved, preset);
      for (const route of ROUTES) {
        expect(state.rows[route].layout, `${preset.name} ${route}`).toEqual(
          resolveLayout(
            ROW_KINDS[route] as RowKind<string, string>,
            preset.rows?.[route]?.layout ?? {},
          ),
        );
      }
    }
    expect(applyPreset(moved, PRESETS[0]!).rows).toEqual(DEFAULT_STYLE.rows);
  });

  it("stages only layouts the row model takes: every place a preset sets keeps its field", () => {
    for (const preset of PRESETS) {
      for (const route of ROUTES) {
        const staged: Readonly<Record<string, string | null>> =
          preset.rows?.[route]?.layout ?? {};
        const resolved: Readonly<Record<string, string | null>> = resolveLayout(
          ROW_KINDS[route] as RowKind<string, string>,
          staged,
        );
        for (const [place, field] of Object.entries(staged)) {
          expect(resolved[place], `${preset.name} ${route} ${place}`).toBe(
            field,
          );
        }
      }
    }
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
    const moved = {
      ...state,
      rows: {
        ...state.rows,
        people: {
          ...people,
          layout: {
            ...people.layout,
            headTrailing: people.layout.headTrailing === null ? "counts" : null,
          },
        },
      },
    } as typeof state;
    expect(activePreset(moved), "a field moved").toBeNull();
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

/** What an export says of a search's row: its layout, and its lists. */
function exported(tsx: string) {
  const layout: Record<string, string | null> = {};
  const block = /layout=\{\{\n([\s\S]*?)\n\s*\}\}/.exec(tsx)?.[1] ?? "";
  for (const [, place, value] of block.matchAll(
    /^\s*(\w+): (null|"[^"]*"),$/gm,
  )) {
    layout[place!] = value === "null" ? null : (JSON.parse(value!) as string);
  }
  const array = (prop: string): string[] | undefined => {
    const found = new RegExp(`${prop}=\\{(\\[[^\\]]*\\])\\}`).exec(tsx);
    return found === null ? undefined : (JSON.parse(found[1]!) as string[]);
  };
  return { layout, list: array("list"), icons: array("iconSegments") };
}

describe("a preset's rows", () => {
  it("export as they are laid out, and read back as the same rows", () => {
    for (const preset of PRESETS) {
      const state = applyPreset(DEFAULT_STYLE, preset);
      for (const route of ROUTES) {
        const at = `${preset.name} ${route}`;
        const { layout, list, icons } = exported(exportCode(state, route).tsx);
        const row = state.rows[route];
        const back: Readonly<Record<string, string | null>> = resolveLayout(
          ROW_KINDS[route] as RowKind<string, string>,
          layout,
        );
        const drawn = lineKinds(route)
          .filter(
            kind =>
              kind.relation === null ||
              (row.list as readonly string[]).includes(kind.relation),
          )
          .flatMap(kind => kind.lines)
          .flatMap(({ lead, trailing }) => [
            lead.badge,
            trailing.badge,
            trailing.field,
          ]);
        const now: Readonly<Record<string, string | null>> = row.layout;
        for (const place of drawn)
          expect(back[place], `${at} ${place}`).toBe(now[place]);
        expect(list ?? DEFAULT_STYLE.rows[route].list, at).toEqual(row.list);
        expect(
          sorted(icons ?? componentProps(DEFAULT_STYLE, route).iconSegments),
          at,
        ).toEqual(sorted(componentProps(state, route).iconSegments));
      }
    }
  });

  it("show a business row's counts in a few, in more than one place, never Light", () => {
    const placed = PRESETS.flatMap(preset => {
      const layout: Readonly<Record<string, string | null>> = applyPreset(
        DEFAULT_STYLE,
        preset,
      ).rows.businesses.layout;
      return Object.entries(layout)
        .filter(([, field]) => field === "counts")
        .map(([place]) => ({ name: preset.name, place }));
    });
    const names = new Set(placed.map(each => each.name));
    expect(names.size).toBeGreaterThanOrEqual(3);
    expect(names.size).toBeLessThanOrEqual(5);
    expect(names).not.toContain("Light");
    expect(new Set(placed.map(each => each.place)).size).toBeGreaterThan(1);
  });

  it("differ from search to search: none listed, one, two in either order, icons on and off, fields moved, and no two neighbours alike", () => {
    const row = (preset: Preset, route: (typeof ROUTES)[number]) =>
      applyPreset(DEFAULT_STYLE, preset).rows[route];
    const read = (preset: Preset, route: (typeof ROUTES)[number]) => {
      const each = row(preset, route);
      return JSON.stringify([
        each.layout,
        each.list,
        sorted(each.iconSegments),
      ]);
    };
    // A compact row: nothing listed on any search.
    expect(
      PRESETS.some(preset =>
        ROUTES.every(route => row(preset, route).list.length === 0),
      ),
    ).toBe(true);
    for (const route of ROUTES) {
      const lengths = new Set(
        PRESETS.map(preset => row(preset, route).list.length),
      );
      for (const n of [0, 1, 2])
        expect(lengths, `${route} lists ${n}`).toContain(n);
      const twos = new Set(
        PRESETS.map(preset => row(preset, route).list)
          .filter(list => list.length === 2)
          .map(list => list.join()),
      );
      expect(twos.size, `${route}: two lines, in both orders`).toBe(2);
      const layouts = new Set(
        PRESETS.map(preset => JSON.stringify(row(preset, route).layout)),
      );
      expect(layouts.size, `${route} layouts`).toBeGreaterThanOrEqual(4);
      const iconed = PRESETS.map(
        preset => row(preset, route).iconSegments.length > 0,
      );
      expect(iconed, `${route} icons`).toContain(true);
      expect(iconed, `${route} no icons`).toContain(false);
      for (let at = 1; at < PRESETS.length; at++) {
        expect(
          read(PRESETS[at]!, route),
          `${PRESETS[at - 1]!.name} and ${PRESETS[at]!.name} on ${route}`,
        ).not.toBe(read(PRESETS[at - 1]!, route));
      }
    }
  });
});
