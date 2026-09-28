import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Segmented, nextSegment } from "../../site/demo/controls";

describe("nextSegment", () => {
  it("moves to the next segment that can be picked, round the end", () => {
    const enabled = [true, false, true, true];

    expect(nextSegment(enabled, 0, 1)).toBe(2);
    expect(nextSegment(enabled, 3, 1)).toBe(0);
    expect(nextSegment(enabled, 2, -1)).toBe(0);
    expect(nextSegment(enabled, 0, -1)).toBe(3);
  });

  it("stays put when no other segment can be picked", () => {
    expect(nextSegment([false, true, false], 1, 1)).toBe(1);
    expect(nextSegment([true], 0, -1)).toBe(0);
  });
});

describe("Segmented", () => {
  const markup = renderToStaticMarkup(
    <Segmented
      label="Badge"
      value="structure"
      options={[
        { value: "empty", label: "—", name: "Empty" },
        { value: "states", label: "States", disabledReason: "In Title, right" },
        { value: "structure", label: "Structure" },
      ]}
      onChange={() => {}}
    />,
  );
  const radios = [...markup.matchAll(/<button[^>]*>/g)].map(([tag]) => tag);

  it("is a radio group named for its place, one radio a choice", () => {
    expect(markup).toMatch(
      /^<div class="segmented" role="radiogroup" aria-label="Badge">/,
    );
    expect(radios).toHaveLength(3);
    for (const radio of radios) expect(radio).toContain('role="radio"');
  });

  it("marks the choice it holds, and lets only that one take focus", () => {
    expect(
      radios.map(radio => /aria-checked="(\w+)"/.exec(radio)?.[1]),
    ).toEqual(["false", "false", "true"]);
    expect(radios.map(radio => /tabindex="(-?\d)"/i.exec(radio)?.[1])).toEqual([
      "-1",
      "-1",
      "0",
    ]);
  });

  it("names a choice drawn as a sign by what it means", () => {
    // "—" reads as nothing, or as "em dash".
    expect(radios[0]).toContain('aria-label="Empty"');
    expect(radios[1]).not.toContain("aria-label");
  });

  it("shows a choice it cannot take, disabled, with a tooltip saying why", () => {
    expect(radios[1]).toContain('aria-disabled="true"');
    expect(radios[1]).toContain('title="In Title, right"');
    expect(radios[1]).not.toMatch(/\sdisabled(=|\s|>)/);
    expect(radios[0]).not.toContain("aria-disabled");
  });
});
