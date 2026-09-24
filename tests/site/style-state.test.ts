import { describe, expect, it } from "vitest";

import {
  CSS_VARIABLES,
  DEFAULT_STYLE,
  PRESETS,
  applyPreset,
  changedVars,
  exportCode,
  INITIAL_STYLE,
  presetChanges,
  presetColor,
  presetVar,
} from "../../site/demo/style-state";

describe("the Styling panel's exported configuration", () => {
  it("says nothing of the row's parts while every part shows", () => {
    expect(exportCode(DEFAULT_STYLE).tsx).not.toContain("parts=");
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

  it("names only the parts left out", () => {
    const { tsx } = exportCode({
      ...DEFAULT_STYLE,
      parts: { ...DEFAULT_STYLE.parts, flags: false, secondarySubtitle: false },
    });

    expect(tsx).toContain("parts={{ flags: false, secondarySubtitle: false }}");
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
