import { useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";

import { RowMap } from "../../site/demo/RowMap";
import {
  BUSINESS_EDITOR,
  DEFAULT_STYLE,
  EMPTY_PLACE,
  placeOptions,
  type StyleState,
} from "../../site/demo/style-state";

import "../../site/shared/brand.css";
import "../../site/demo/demo.css";

describe("a place's dropdown, laid unseen over its face", () => {
  /** The map with its state kept, as the panel keeps it. */
  function Kept() {
    const [state, setState] = useState<StyleState>(DEFAULT_STYLE);
    return <RowMap state={state} onChange={setState} />;
  }

  function mountKept() {
    const host = document.createElement("div");
    host.style.width = "560px";
    document.body.append(host);
    const root = createRoot(host);
    flushSync(() => root.render(<Kept />));
    const select = (place: string) =>
      host.querySelector<HTMLSelectElement>(`[data-drop="${place}"] select`)!;
    return {
      host,
      select,
      done() {
        root.unmount();
        host.remove();
      },
    };
  }

  it("rings the face when the keyboard reaches the dropdown", async () => {
    const { host, done } = mountKept();
    try {
      for (
        let stops = 0;
        stops < 20 &&
        !(document.activeElement as Element | null)?.matches(
          ".row-map-place select",
        );
        stops++
      ) {
        await userEvent.tab();
      }
      const select = document.activeElement as HTMLSelectElement;
      expect(host.contains(select)).toBe(true);
      const face = select
        .closest(".row-map-place")!
        .querySelector<HTMLElement>(".row-map-face")!;
      expect(getComputedStyle(face).outlineStyle).toBe("solid");
    } finally {
      done();
    }
  });

  it("holds what the row holds after a field moves, on both places", async () => {
    const { select, done } = mountKept();
    try {
      const layout: Readonly<Record<string, string | null>> =
        DEFAULT_STYLE.rows.businesses.layout;
      // An empty place that can take a field another place holds.
      const [to, field] = BUSINESS_EDITOR.kind.places
        .filter(place => layout[place] === null)
        .flatMap(place =>
          placeOptions(DEFAULT_STYLE.rows.businesses.layout, place)
            .filter(
              option =>
                option.value !== EMPTY_PLACE &&
                Object.values(layout).includes(option.value),
            )
            .map(option => [place, option.value] as const),
        )[0]!;
      const from = BUSINESS_EDITOR.kind.places.find(
        place => layout[place] === field,
      )!;

      await userEvent.selectOptions(select(to), field);

      expect(select(to).value).toBe(field);
      expect(select(from).value).toBe(EMPTY_PLACE);
    } finally {
      done();
    }
  });
});
