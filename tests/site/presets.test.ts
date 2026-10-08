import { describe, expect, it } from "vitest";

import {
  DEFAULT_STYLE,
  INITIAL_STYLE,
  PRESETS,
  activePreset,
  applyPreset,
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
