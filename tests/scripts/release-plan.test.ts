import { describe, expect, it } from "vitest";

import {
  bumpVersion,
  compareVersions,
  cutRelease,
  distTagFor,
  forwardPort,
  hotfixBranch,
  latestRelease,
  parseVersion,
  releasedSection,
  setPackageVersion,
  versionOfHotfixBranch,
} from "../../scripts/release-plan.ts";

const HEAD = `# Changelog

All notable changes to \`@baselayer/autocomplete\`.
`;

function changelog(...sections: string[]): string {
  return `${HEAD}\n${sections.join("\n\n")}\n`;
}

describe("parseVersion", () => {
  it("reads a release and a prerelease", () => {
    expect(parseVersion("0.1.0")).toEqual({
      major: 0,
      minor: 1,
      patch: 0,
      pre: null,
    });
    expect(parseVersion("1.2.3-rc.4")).toEqual({
      major: 1,
      minor: 2,
      patch: 3,
      pre: "rc.4",
    });
  });

  it("refuses anything that is not a whole version", () => {
    for (const text of ["1.2", "v1.2.3", "1.2.3.4", "01.2.3", "", "1.2.x"]) {
      expect(() => parseVersion(text), text).toThrow(/not a version/);
    }
  });
});

describe("compareVersions", () => {
  const cmp = (a: string, b: string) =>
    Math.sign(compareVersions(parseVersion(a), parseVersion(b)));

  it("orders by number, not by text", () => {
    expect(cmp("0.1.1", "0.1.0")).toBe(1);
    expect(cmp("0.10.0", "0.9.9")).toBe(1);
    expect(cmp("1.0.0", "0.99.99")).toBe(1);
    expect(cmp("0.2.0", "0.2.0")).toBe(0);
  });

  it("puts a prerelease before its release, and numbers its steps", () => {
    expect(cmp("1.0.0-rc.1", "1.0.0")).toBe(-1);
    expect(cmp("1.0.0-rc.2", "1.0.0-rc.10")).toBe(-1);
    expect(cmp("1.0.0-beta.1", "1.0.0-rc.0")).toBe(-1);
    expect(cmp("1.0.0-rc", "1.0.0-rc.0")).toBe(-1);
  });
});

describe("bumpVersion", () => {
  const bump = (current: string, to: string) =>
    bumpVersion(parseVersion(current), to);

  it("bumps the named part and zeroes the ones after it", () => {
    expect(bump("0.1.3", "patch")).toBe("0.1.4");
    expect(bump("0.1.3", "minor")).toBe("0.2.0");
    expect(bump("0.1.3", "major")).toBe("1.0.0");
  });

  it("takes an exact version above the current one", () => {
    expect(bump("0.1.3", "0.3.0")).toBe("0.3.0");
    expect(() => bump("0.1.3", "0.1.3")).toThrow(/above 0\.1\.3/);
    expect(() => bump("0.1.3", "0.1.2")).toThrow(/above 0\.1\.3/);
  });

  it("leaves prereleases to the hand-published `next` channel", () => {
    expect(() => bump("0.1.3", "0.2.0-rc.0")).toThrow(/prerelease/);
    expect(() => bump("0.2.0-rc.0", "patch")).toThrow(/prerelease/);
  });

  it("names what it takes when given something else", () => {
    expect(() => bump("0.1.3", "hotfix")).toThrow(
      /patch, minor, major or a version/,
    );
  });
});

describe("latestRelease", () => {
  it("is the highest release tag, by number, skipping prereleases and strays", () => {
    const tags = [
      "v0.1.0",
      "v0.2.0-rc.0",
      "v0.9.1",
      "junk",
      "v0.10.0",
      "0.11.0",
    ];
    expect(latestRelease(tags)).toEqual(parseVersion("0.10.0"));
  });

  it("is null before the first release", () => {
    expect(latestRelease([])).toBeNull();
    expect(latestRelease(["v0.1.0-rc.0"])).toBeNull();
  });
});

describe("hotfix branches", () => {
  it("are named for the version they will release", () => {
    expect(hotfixBranch(parseVersion("0.1.0"))).toEqual({
      branch: "hotfix/v0.1.1",
      version: "0.1.1",
    });
    expect(versionOfHotfixBranch("hotfix/v0.1.1")).toBe("0.1.1");
  });

  it("are recognized by name alone", () => {
    expect(versionOfHotfixBranch("main")).toBeNull();
    expect(versionOfHotfixBranch("hotfix/v0.1")).toBeNull();
    expect(versionOfHotfixBranch("release/v0.2.0")).toBeNull();
  });
});

describe("distTagFor", () => {
  it("sends a prerelease to `next`", () => {
    expect(distTagFor("0.2.0-rc.0", "0.1.0")).toBe("next");
  });

  it("makes a release the newest when it is", () => {
    expect(distTagFor("0.1.0", "")).toBe("latest");
    expect(distTagFor("0.2.0", "0.1.1")).toBe("latest");
    expect(distTagFor("0.2.0", "not a version")).toBe("latest");
  });

  it("keeps a hotfix to an older line off `latest`", () => {
    // 0.2.0 is out; 0.1.2 must not become what `npm install` picks.
    expect(distTagFor("0.1.2", "0.2.0")).toBe("release-0.1");
  });
});

describe("cutRelease", () => {
  const unreleased = `## [Unreleased]

### Added

- \`thing\`, which does a thing
  over two lines.

### Fixed

- A bug.`;
  const released = `## [0.1.0] - 2026-09-24

### Added

- The first release.`;

  it("moves the unreleased entries under the new version and leaves the heading", () => {
    expect(
      cutRelease(changelog(unreleased, released), "0.2.0", "2026-10-01"),
    ).toBe(
      changelog(
        "## [Unreleased]",
        `## [0.2.0] - 2026-10-01

### Added

- \`thing\`, which does a thing
  over two lines.

### Fixed

- A bug.`,
        released,
      ),
    );
  });

  it("cuts the first release, with nothing released below it", () => {
    expect(
      cutRelease(changelog("## [Unreleased]\n\n- One."), "0.1.0", "2026-09-24"),
    ).toBe(changelog("## [Unreleased]", "## [0.1.0] - 2026-09-24\n\n- One."));
  });

  it("refuses a release with nothing in it", () => {
    expect(() =>
      cutRelease(changelog("## [Unreleased]", released), "0.2.0", "2026-10-01"),
    ).toThrow(/Nothing under \[Unreleased\]/);
  });

  it("refuses a version the changelog already has", () => {
    expect(() =>
      cutRelease(changelog(unreleased, released), "0.1.0", "2026-10-01"),
    ).toThrow(/already has a \[0\.1\.0\] section/);
  });

  it("refuses a changelog without an Unreleased heading", () => {
    expect(() =>
      cutRelease(changelog(released), "0.2.0", "2026-10-01"),
    ).toThrow(/no ## \[Unreleased\]/);
  });
});

describe("releasedSection", () => {
  it("is one version's heading and entries, up to the next version", () => {
    const text = changelog(
      "## [Unreleased]",
      "## [0.1.1] - 2026-10-02\n\n### Fixed\n\n- A bug.",
      "## [0.1.0] - 2026-09-24\n\n- The first release.",
    );
    expect(releasedSection(text, "0.1.1")).toBe(
      "## [0.1.1] - 2026-10-02\n\n### Fixed\n\n- A bug.",
    );
    expect(releasedSection(text, "0.1.0")).toBe(
      "## [0.1.0] - 2026-09-24\n\n- The first release.",
    );
    expect(releasedSection(text, "0.3.0")).toBeNull();
  });
});

describe("forwardPort", () => {
  const hotfix = "## [0.1.1] - 2026-10-02\n\n### Fixed\n\n- A bug.";

  it("lists the hotfix under Unreleased when it is the newest release", () => {
    const main = changelog(
      "## [Unreleased]\n\n### Added\n\n- Something new.",
      "## [0.1.0] - 2026-09-24\n\n- The first release.",
    );
    expect(forwardPort(main, hotfix)).toBe(
      changelog(
        "## [Unreleased]\n\n### Added\n\n- Something new.",
        hotfix,
        "## [0.1.0] - 2026-09-24\n\n- The first release.",
      ),
    );
  });

  it("files a hotfix to an older line between the releases around it", () => {
    const main = changelog(
      "## [Unreleased]",
      "## [0.2.0] - 2026-10-01\n\n- More.",
      "## [0.1.0] - 2026-09-24\n\n- The first release.",
    );
    expect(forwardPort(main, hotfix)).toBe(
      changelog(
        "## [Unreleased]",
        "## [0.2.0] - 2026-10-01\n\n- More.",
        hotfix,
        "## [0.1.0] - 2026-09-24\n\n- The first release.",
      ),
    );
  });

  it("drops the entries the hotfix released from Unreleased, and a heading left empty", () => {
    // The fix landed on main first, with its entry; it has shipped now.
    const main = changelog(
      "## [Unreleased]\n\n### Added\n\n- Something new.\n\n### Fixed\n\n- A bug.",
      "## [0.1.0] - 2026-09-24\n\n- The first release.",
    );
    expect(forwardPort(main, hotfix)).toBe(
      changelog(
        "## [Unreleased]\n\n### Added\n\n- Something new.",
        hotfix,
        "## [0.1.0] - 2026-09-24\n\n- The first release.",
      ),
    );
  });

  it("matches an entry however it was wrapped", () => {
    const wrapped =
      "## [0.1.1] - 2026-10-02\n\n### Fixed\n\n- A bug in the\n  menu.";
    const main = changelog(
      "## [Unreleased]\n\n### Fixed\n\n- A bug in\n  the menu.\n- Another.",
      "## [0.1.0] - 2026-09-24\n\n- The first release.",
    );
    expect(forwardPort(main, wrapped)).toBe(
      changelog(
        "## [Unreleased]\n\n### Fixed\n\n- Another.",
        wrapped,
        "## [0.1.0] - 2026-09-24\n\n- The first release.",
      ),
    );
  });

  it("refuses a version main already lists", () => {
    const main = changelog("## [Unreleased]", hotfix);
    expect(() => forwardPort(main, hotfix)).toThrow(
      /already has a \[0\.1\.1\] section/,
    );
  });
});

describe("setPackageVersion", () => {
  const pkg = `{
  "name": "@baselayer/autocomplete",
  "version": "0.1.0",
  "dependencies": {
    "downshift": { "version": "9.0.0" }
  }
}
`;

  it("rewrites the package's own version and nothing else", () => {
    expect(setPackageVersion(pkg, "0.2.0")).toBe(
      pkg.replace('"version": "0.1.0"', '"version": "0.2.0"'),
    );
  });

  it("refuses a package.json without a top-level version", () => {
    expect(() => setPackageVersion('{\n  "name": "x"\n}\n', "0.2.0")).toThrow(
      /no top-level "version"/,
    );
  });
});
