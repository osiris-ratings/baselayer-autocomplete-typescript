// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ROW_KINDS } from "@baselayer-sdk/autocomplete";

import { RowMap } from "../../site/demo/RowMap";
import {
  DEFAULT_STYLE,
  EMPTY_PLACE,
  PRESETS,
  applyPreset,
} from "../../site/demo/style-state";

afterEach(cleanup);

describe("the row map under a preset", () => {
  it("shows each search's row as the preset lays it out: every place, and the lines it lists", () => {
    for (const preset of PRESETS) {
      const state = applyPreset(DEFAULT_STYLE, preset);
      for (const route of ["businesses", "people", "addresses"] as const) {
        const { container } = render(
          <RowMap state={state} onChange={() => {}} route={route} />,
        );
        const at = `${preset.name} ${route}`;
        const layout: Readonly<Record<string, string | null>> =
          state.rows[route].layout;
        for (const place of ROW_KINDS[route].places) {
          const shown = container.querySelector<HTMLElement>(
            `[data-drop="${place}"]`,
          );
          expect(shown, `${at} ${place}`).not.toBeNull();
          expect(shown!.dataset.field, `${at} ${place}`).toBe(
            layout[place] ?? EMPTY_PLACE,
          );
        }
        const listed = [
          ...container.querySelectorAll<HTMLElement>(
            '[data-drawer="shown"] .row-map-kind',
          ),
        ]
          .map(kind => kind.dataset.relation)
          .filter(relation => relation !== "head");
        expect(listed, at).toEqual(state.rows[route].list);
        cleanup();
      }
    }
  });
});
