import { describe, expect, it } from "vitest";

import {
  DEFAULT_LOOK,
  includeForParts,
  MATCH_EMPHASES,
  MATCH_REGIONS,
  resolveLook,
  type Look,
} from "@baselayer/autocomplete";

// `resolveLook` takes a look as a host stages it, where any knob may be
// absent, null or unusable, and validates it knob by knob.
describe("resolveLook", () => {
  it("reads the footer's diagnostics flag, which is off until a row says otherwise", () => {
    // `showDebugInfo` is the one knob that is not a color or an emphasis:
    // it puts the round trip and the artifact tag in the menu's footer. It is
    // off by default, so the resolver has to read a staged `true` for anyone
    // to see it.
    expect(resolveLook({}).showDebugInfo).toBe(false);
    expect(resolveLook({ showDebugInfo: true }).showDebugInfo).toBe(true);

    // A value the SDK cannot read costs that knob alone, as every other knob
    // does.
    const look = resolveLook({ showDebugInfo: "yes" });
    expect(look.showDebugInfo).toBe(false);
    expect(look.matchEmphasis).toBe(DEFAULT_LOOK.matchEmphasis);
  });

  it("lays the staged knobs over the defaults", () => {
    expect(
      resolveLook({
        matchEmphasis: "ink",
        matchEmphasisRegion: "substring",
        pillBackgroundColor: "#e6fffa",
        titleColor: null,
      }),
    ).toEqual({
      ...DEFAULT_LOOK,
      matchEmphasis: "ink",
      matchEmphasisRegion: "substring",
      pillBackgroundColor: "#e6fffa",
    });
  });

  it("is the designed look when nothing is staged", () => {
    const look = resolveLook({});
    expect(look).toEqual(DEFAULT_LOOK);
    expect(look.matchEmphasis).toBe("underline");
    expect(look.matchEmphasisRegion).toBe("token");

    expect(resolveLook()).toEqual(DEFAULT_LOOK);
  });

  it("keeps the default for a knob it cannot use, and the rest of the look", () => {
    // The console warned through its overrides schema; `resolveLook` is silent.
    expect(
      resolveLook({ matchEmphasis: "neon", subtitleColor: "#4a5568" }),
    ).toEqual({ ...DEFAULT_LOOK, subtitleColor: "#4a5568" });
  });

  it("takes only hex colors, and keeps the default for anything else", () => {
    // The defaults are hex, and a design-system token, a color name or a CSS
    // function is a knob the resolver cannot use.
    for (const unusable of [
      "green.100",
      "red",
      "rgb(0, 0, 0)",
      "#12345",
      "#GGGGGG",
      "",
      42,
    ]) {
      expect(resolveLook({ backgroundColor: unusable }).backgroundColor).toBe(
        DEFAULT_LOOK.backgroundColor,
      );
    }
    // `#RGB`, `#RRGGBB` and `#RRGGBBAA`, in either case.
    expect(resolveLook({ titleColor: "#abc" }).titleColor).toBe("#abc");
    expect(resolveLook({ titleColor: "#A0AEC0" }).titleColor).toBe("#A0AEC0");
    expect(resolveLook({ titleColor: "#1a202c80" }).titleColor).toBe(
      "#1a202c80",
    );
  });

  it("reads the emphasis color as null unless it is a usable hex", () => {
    expect(resolveLook({ matchEmphasisColor: "#319795" })).toMatchObject({
      matchEmphasisColor: "#319795",
    });
    expect(resolveLook({ matchEmphasisColor: "teal.500" })).toMatchObject({
      matchEmphasisColor: null,
    });
    expect(resolveLook({ matchEmphasisColor: null })).toMatchObject({
      matchEmphasisColor: null,
    });
  });

  it("keeps the default for an emphasis or a region this build does not draw", () => {
    expect(resolveLook({ matchEmphasisRegion: "word" })).toEqual(DEFAULT_LOOK);
    expect(resolveLook({ matchEmphasis: "UNDERLINE" })).toEqual(DEFAULT_LOOK);
    for (const emphasis of MATCH_EMPHASES) {
      expect(resolveLook({ matchEmphasis: emphasis }).matchEmphasis).toBe(
        emphasis,
      );
    }
    for (const region of MATCH_REGIONS) {
      expect(
        resolveLook({ matchEmphasisRegion: region }).matchEmphasisRegion,
      ).toBe(region);
    }
  });

  it("stages every color knob on its own", () => {
    const colors = {
      backgroundColor: "#111111",
      titleColor: "#222222",
      subtitleColor: "#333333",
      pillBackgroundColor: "#444444",
      pillForegroundColor: "#555555",
      primaryPillBorderColor: "#666666",
      secondaryPillBackgroundColor: "#777777",
    } satisfies Partial<Look>;

    expect(resolveLook(colors)).toEqual({ ...DEFAULT_LOOK, ...colors });
  });

  it("defaults to hex colors, and hands back a look of its own", () => {
    const hex = /^#[0-9A-F]{6}$/i;
    for (const [knob, value] of Object.entries(DEFAULT_LOOK)) {
      if (knob.endsWith("Color") && value !== null) {
        expect(value, knob).toMatch(hex);
      }
    }
    expect(Object.isFrozen(DEFAULT_LOOK)).toBe(true);
    expect(resolveLook()).not.toBe(DEFAULT_LOOK);
  });
});

describe("includeForParts", () => {
  const all = { flags: true, subtitle: true, secondarySubtitle: true };

  it("asks for the officers and the addresses while both lines show", () => {
    expect(includeForParts(all)).toEqual(["people", "addresses"]);
  });

  it("asks for no addresses without the subtitle, the lead address", () => {
    expect(includeForParts({ ...all, subtitle: false })).toEqual(["people"]);
  });

  it("asks for no officers without the secondary subtitle", () => {
    expect(includeForParts({ ...all, secondarySubtitle: false })).toEqual([
      "addresses",
    ]);
  });

  it("asks for nothing related when only the title and flags show", () => {
    expect(
      includeForParts({
        flags: true,
        subtitle: false,
        secondarySubtitle: false,
      }),
    ).toEqual([]);
  });
});
