import { describe, expect, it } from "vitest";

import { DEFAULT_STYLE, exportCode } from "../../site/demo/style-state";

describe("the Styling panel's exported configuration", () => {
  it("says nothing of the row's parts while every part shows", () => {
    expect(exportCode(DEFAULT_STYLE).tsx).not.toContain("parts=");
  });

  it("names only the parts left out", () => {
    const { tsx } = exportCode({
      ...DEFAULT_STYLE,
      parts: { ...DEFAULT_STYLE.parts, flags: false, secondarySubtitle: false },
    });

    expect(tsx).toContain("parts={{ flags: false, secondarySubtitle: false }}");
  });
});
