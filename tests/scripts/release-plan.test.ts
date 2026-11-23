import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  backfillPlan,
  bumpVersion,
  compareVersions,
  cutRelease,
  distTagFor,
  forwardPort,
  githubReleaseArgs,
  holdReason,
  hotfixBranch,
  latestRelease,
  parseVersion,
  releaseIsLatest,
  releaseNotes,
  releasedSection,
  setPackageVersion,
  unwrapMarkdown,
  versionOfHotfixBranch,
} from "../../scripts/release-plan.ts";

const HEAD = `# Changelog

All notable changes to \`@baselayer-sdk/autocomplete\`.
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
  "name": "@baselayer-sdk/autocomplete",
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

describe("unwrapMarkdown", () => {
  it("puts a wrapped list item and a wrapped paragraph on one line each", () => {
    expect(
      unwrapMarkdown(
        "- A long entry that wraps\n  onto a second line and\n  a third.\n- Another.",
      ),
    ).toBe(
      "- A long entry that wraps onto a second line and a third.\n- Another.",
    );
    expect(unwrapMarkdown("First line\nsecond line.\n\nNew paragraph.")).toBe(
      "First line second line.\n\nNew paragraph.",
    );
  });

  it("keeps headings, blank lines and where each list item starts", () => {
    const text =
      "### Added\n\n- One\n  two.\n\n### Fixed\n- Three.\n1. First\n2. Second";
    expect(unwrapMarkdown(text)).toBe(
      "### Added\n\n- One two.\n\n### Fixed\n- Three.\n1. First\n2. Second",
    );
  });

  it("keeps a nested list item on its own line, and unwraps inside it", () => {
    expect(
      unwrapMarkdown(
        "- Parent\n  wraps here:\n  - child one\n    wraps too\n  - child two",
      ),
    ).toBe("- Parent wraps here:\n  - child one wraps too\n  - child two");
  });

  it("starts a list item after a line of text with no blank between", () => {
    expect(unwrapMarkdown("Intro:\n- a\n- b")).toBe("Intro:\n- a\n- b");
  });

  it("joins a line that only looks like a marker or a tag", () => {
    // `3.5rem` has no space after its dot, so it is not a numbered item, and
    // an autolink is text.
    expect(
      unwrapMarkdown(
        "- Menu\n  3.5rem more, see\n  <https://example.com/x> too",
      ),
    ).toBe("- Menu 3.5rem more, see <https://example.com/x> too");
  });

  it("leaves a fenced block and a table as they are", () => {
    const text =
      "Before\n\n```ts\nconst a = 1;\nconst b = 2;\n```\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\nAfter";
    expect(unwrapMarkdown(text)).toBe(text);
  });

  it("keeps a hard break", () => {
    expect(unwrapMarkdown("line one  \nline two")).toBe("line one  \nline two");
    expect(unwrapMarkdown("line one\\\nline two")).toBe("line one\\\nline two");
  });

  it("does not change what it already changed", () => {
    const once = unwrapMarkdown("- a\n  b\n\nc\nd\n- e\n  f");
    expect(unwrapMarkdown(once)).toBe(once);
  });
});

describe("releaseNotes", () => {
  const text = changelog(
    "## [Unreleased]",
    "## [0.2.0] - 2026-10-02\n\n### Added\n\n- A new thing that is\n  described over two lines.\n\n### Fixed\n\n- A bug.",
    "## [0.1.0] - 2026-09-24\n\n- The first release.",
  );

  it("is the version's entries without its heading, one line to an entry", () => {
    expect(releaseNotes(text, "0.2.0")).toBe(
      "### Added\n\n- A new thing that is described over two lines.\n\n### Fixed\n\n- A bug.",
    );
  });

  it("reads the last section to the end of the file", () => {
    expect(releaseNotes(text, "0.1.0")).toBe("- The first release.");
  });

  it("is null for a version the changelog does not have", () => {
    expect(releaseNotes(text, "0.3.0")).toBeNull();
  });

  describe("on this repository's changelog", () => {
    const real = readFileSync(
      new URL("../../CHANGELOG.md", import.meta.url),
      "utf8",
    );
    const versions = [...real.matchAll(/^## \[(\d[^\]]*)\]/gm)].map(
      match => match[1] ?? "",
    );
    const words = (value: string) => value.split(/\s+/).filter(Boolean);
    const items = (value: string) =>
      value.split("\n").filter(line => /^\s*([-*+]|\d+[.)])\s/.test(line));

    it("has released versions to read", () => {
      expect(versions.length).toBeGreaterThan(10);
    });

    it.each(versions)(
      "%s keeps every word, in order, and every item",
      version => {
        const section = releasedSection(real, version) ?? "";
        const original = section.split("\n").slice(1).join("\n");
        const notes = releaseNotes(real, version) ?? "";

        expect(words(notes)).toEqual(words(original));
        expect(items(notes).length).toBe(items(original).length);
        expect(notes.split("\n").length).toBeLessThanOrEqual(
          original.trim().split("\n").length,
        );
        expect(unwrapMarkdown(notes)).toBe(notes);
      },
    );
  });
});

describe("releaseIsLatest", () => {
  it("is the newest release, which npm calls `latest`", () => {
    expect(releaseIsLatest("latest")).toBe(true);
  });

  it("is not a prerelease, nor a hotfix to an older line", () => {
    expect(releaseIsLatest("next")).toBe(false);
    expect(releaseIsLatest("release-0.1")).toBe(false);
    expect(releaseIsLatest("")).toBe(false);
  });
});

describe("githubReleaseArgs", () => {
  it("creates the release of an existing tag, notes from stdin, as the latest", () => {
    expect(
      githubReleaseArgs({ tag: "v0.2.0", version: "0.2.0", latest: true }),
    ).toEqual([
      "release",
      "create",
      "v0.2.0",
      "--title",
      "0.2.0",
      "--notes-file",
      "-",
      "--verify-tag",
      "--latest",
    ]);
  });

  it("says outright when it is not the latest", () => {
    const args = githubReleaseArgs({
      tag: "v0.1.2",
      version: "0.1.2",
      latest: false,
    });
    expect(args.at(-1)).toBe("--latest=false");
    expect(args).not.toContain("--latest");
  });
});

describe("backfillPlan", () => {
  const files: Record<string, string> = {
    "v0.1.0": changelog("## [0.1.0] - 2026-09-24\n\n- The first."),
    "v0.1.1": changelog(
      "## [0.1.1] - 2026-09-25\n\n- A fix.",
      "## [0.1.0] - 2026-09-24\n\n- The first.",
    ),
    "v0.10.0": changelog(
      "## [0.10.0] - 2026-10-28\n\n- The tenth\n  minor.",
      "## [0.2.0] - 2026-09-28\n\n- The second.",
    ),
    "v0.2.0": changelog("## [0.2.0] - 2026-09-28\n\n- The second."),
  };
  const at = (tag: string) => files[tag] ?? null;

  it("has a release for each tag, oldest first, with that tag's own notes", () => {
    const plan = backfillPlan(["v0.10.0", "v0.1.0", "v0.2.0", "v0.1.1"], at);
    expect(plan.map(entry => entry.tag)).toEqual([
      "v0.1.0",
      "v0.1.1",
      "v0.2.0",
      "v0.10.0",
    ]);
    expect(plan.map(entry => entry.version)).toEqual([
      "0.1.0",
      "0.1.1",
      "0.2.0",
      "0.10.0",
    ]);
    expect(plan.map(entry => entry.notes)).toEqual([
      "- The first.",
      "- A fix.",
      "- The second.",
      "- The tenth minor.",
    ]);
  });

  it("makes only the highest version the latest", () => {
    const plan = backfillPlan(["v0.10.0", "v0.2.0", "v0.1.0", "v0.1.1"], at);
    expect(plan.filter(entry => entry.latest).map(entry => entry.tag)).toEqual([
      "v0.10.0",
    ]);
  });

  it("leaves out a tag that is not a release", () => {
    const plan = backfillPlan(
      ["v0.1.0", "v0.2.0-rc.0", "nightly", "v1", ""],
      at,
    );
    expect(plan.map(entry => entry.tag)).toEqual(["v0.1.0"]);
  });

  it("refuses a tag whose changelog has no section for it", () => {
    expect(() => backfillPlan(["v0.3.0"], at)).toThrow(
      /v0\.3\.0.*no \[0\.3\.0\] section/,
    );

describe("holdReason", () => {
  it("is null when there is no hold file", () => {
    expect(holdReason(null)).toBeNull();
  });

  it("is the first line the hold file has", () => {
    expect(
      holdReason("\n  Do not release: the service is not ready.  \nMore.\n"),
    ).toBe("Do not release: the service is not ready.");
  });

  it("still holds a release when the file says nothing", () => {
    expect(holdReason("")).toMatch(/on hold/);
    expect(holdReason(" \n\n")).toMatch(/on hold/);
  });
});

describe("the release hold, where a release is made", () => {
  const read = (path: string) =>
    readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

  it("stops the Release workflow before anyone is asked to approve a publish", () => {
    const workflow = read(".github/workflows/release.yml");
    // A job of its own, which the publish job needs: the `npm-publish`
    // environment's approval is only asked for once every job it needs is done.
    expect(workflow).toMatch(
      /\n {2}hold:\n(?: {4}.*\n| *\n)+? {2}publish:\n {4}needs: hold\n/,
    );
    expect(workflow).toMatch(/if \[ -f \.release-hold \]/);
  });

  it("stops `pnpm release` and `pnpm release tag`", () => {
    const script = read("scripts/release.ts");
    expect(script.match(/requireNoHold\(/g)?.length).toBeGreaterThanOrEqual(3);
  });
});
