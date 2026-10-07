import type { Route } from "@baselayer-sdk/autocomplete";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import { RowMap } from "../../site/demo/RowMap";
import {
  ADDRESS_EDITOR,
  BUSINESS_EDITOR,
  DEFAULT_STYLE,
  PERSON_EDITOR,
  editorOps,
  lineKinds,
  type RowEditor,
  type StyleState,
} from "../../site/demo/style-state";

import "../../site/demo/demo.css";

const EDITORS: Record<Route, RowEditor<string, string>> = {
  businesses: BUSINESS_EDITOR as RowEditor<string, string>,
  people: PERSON_EDITOR as RowEditor<string, string>,
  addresses: ADDRESS_EDITOR as RowEditor<string, string>,
};

/** Every line kind listed, so every place of the row is drawn. */
function everyLine(route: Route): StyleState {
  const list = lineKinds(route).flatMap(kind =>
    kind.relation === null ? [] : [kind.relation],
  );
  return {
    ...DEFAULT_STYLE,
    rows: {
      ...DEFAULT_STYLE.rows,
      [route]: { ...DEFAULT_STYLE.rows[route], list },
    },
  };
}

/** The state with `field` placed at `place` on `route`'s row. */
function placed(
  state: StyleState,
  route: Route,
  place: string,
  field: string,
): StyleState {
  const { withPlaced } = editorOps(EDITORS[route]);
  const row = state.rows[route];
  return {
    ...state,
    rows: {
      ...state.rows,
      [route]: { ...row, layout: withPlaced(row.layout, place, field) },
    },
  };
}

/** What is drawn cut short or outside the row, by its text. */
function cut(host: HTMLElement, editor: RowEditor<string, string>): string[] {
  const drawn = [
    ...host.querySelectorAll<HTMLElement>(
      ".row-map-place:not([data-closed]) .row-map-face, .row-map-name, .row-map-chip",
    ),
  ];
  // Each filled place draws its field's name, where it can be measured.
  const unnamed = [
    ...host.querySelectorAll<HTMLElement>(
      '.row-map-place:not([data-closed]):not([data-field="empty"])',
    ),
  ].flatMap(place =>
    place.querySelector(".row-map-face")?.textContent ===
    editor.fieldLabels[place.dataset.field!]
      ? []
      : [`${place.dataset.field} (unnamed)`],
  );
  return unnamed.concat(
    drawn.flatMap(element => {
      const box = element.getBoundingClientRect();
      const clipped = element.scrollWidth > element.clientWidth + 0.5;
      // Within what its drawer scrolls through, when it is in one.
      const scroller = element.closest<HTMLElement>(".row-map-scroll");
      const area = scroller?.getBoundingClientRect();
      const outside =
        scroller !== null &&
        area !== undefined &&
        (box.left < area.left - scroller.scrollLeft - 0.5 ||
          box.right >
            area.left - scroller.scrollLeft + scroller.scrollWidth + 0.5);
      return clipped || outside
        ? [`${element.textContent} (${clipped ? "clipped" : "outside"})`]
        : [];
    }),
  );
}

describe("the Components fold's row, at the panel's width and a phone's", () => {
  for (const width of [560, 400]) {
    for (const route of ["businesses", "people", "addresses"] as const) {
      it(`draws every field of a ${route} row whole, wherever it goes, in ${width}px`, () => {
        const host = document.createElement("div");
        host.style.width = `${width}px`;
        document.body.append(host);
        const root = createRoot(host);
        const editor = EDITORS[route];
        const { placeOptions } = editorOps(editor);
        const base = everyLine(route);
        const problems: string[] = [];
        try {
          for (const place of editor.kind.places) {
            for (const { value } of placeOptions(
              base.rows[route].layout,
              place,
            )) {
              const state = placed(base, route, place, value);
              flushSync(() =>
                root.render(
                  <RowMap state={state} onChange={() => {}} route={route} />,
                ),
              );
              for (const problem of cut(host, editor)) {
                problems.push(`${value} at ${place}: ${problem}`);
              }
            }
          }
        } finally {
          root.unmount();
          host.remove();
        }
        expect(problems).toEqual([]);
      });
    }
  }
});
