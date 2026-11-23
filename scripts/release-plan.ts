// The release script's arithmetic: versions, the changelog and package.json,
// text in and text out, so every rule it follows is testable without git.
// `scripts/release.ts` does the git and the GitHub around it.

export interface Version {
  major: number;
  minor: number;
  patch: number;
  /** The prerelease identifiers after the `-`, or null for a release. */
  pre: string | null;
}

const VERSION =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

export function parseVersion(text: string): Version {
  const match = VERSION.exec(text);
  if (match === null) {
    throw new Error(`${JSON.stringify(text)} is not a version (x.y.z)`);
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    pre: match[4] ?? null,
  };
}

export function formatVersion(version: Version): string {
  const { major, minor, patch, pre } = version;
  return `${major}.${minor}.${patch}${pre === null ? "" : `-${pre}`}`;
}

/** Semver precedence: negative when `a` comes first. */
export function compareVersions(a: Version, b: Version): number {
  const core = a.major - b.major || a.minor - b.minor || a.patch - b.patch;
  if (core !== 0) return core;
  if (a.pre === b.pre) return 0;
  if (a.pre === null) return 1;
  if (b.pre === null) return -1;
  const left = a.pre.split(".");
  const right = b.pre.split(".");
  for (let i = 0; i < Math.min(left.length, right.length); i++) {
    const x = left[i] ?? "";
    const y = right[i] ?? "";
    if (x === y) continue;
    const xNumeric = /^\d+$/.test(x);
    const yNumeric = /^\d+$/.test(y);
    if (xNumeric && yNumeric) return Number(x) - Number(y);
    if (xNumeric !== yNumeric) return xNumeric ? -1 : 1;
    return x < y ? -1 : 1;
  }
  return left.length - right.length;
}

/**
 * The version a release of `current` gets: `patch`, `minor` or `major`, or an
 * exact version above it. Prereleases are published by hand to `next`, so
 * neither side of a bump is one.
 */
export function bumpVersion(current: Version, to: string): string {
  if (current.pre !== null) {
    throw new Error(
      `package.json is at the prerelease ${formatVersion(current)}; main ` +
        "only ever holds a release",
    );
  }
  switch (to) {
    case "patch":
      return formatVersion({ ...current, patch: current.patch + 1 });
    case "minor":
      return formatVersion({ ...current, minor: current.minor + 1, patch: 0 });
    case "major":
      return formatVersion({
        major: current.major + 1,
        minor: 0,
        patch: 0,
        pre: null,
      });
  }
  if (!VERSION.test(to)) {
    throw new Error(
      `Release what? Give patch, minor, major or a version (x.y.z), not ${JSON.stringify(to)}`,
    );
  }
  const next = parseVersion(to);
  if (next.pre !== null) {
    throw new Error(
      `${to} is a prerelease; those are published by hand to the next ` +
        "dist-tag (see CONTRIBUTING.md)",
    );
  }
  if (compareVersions(next, current) <= 0) {
    throw new Error(`${to} is not above ${formatVersion(current)}`);
  }
  return to;
}

/** The highest `vX.Y.Z` tag; prerelease tags and strays do not count. */
export function latestRelease(tags: readonly string[]): Version | null {
  let latest: Version | null = null;
  for (const tag of tags) {
    if (!tag.startsWith("v") || !VERSION.test(tag.slice(1))) continue;
    const version = parseVersion(tag.slice(1));
    if (version.pre !== null) continue;
    if (latest === null || compareVersions(version, latest) > 0) {
      latest = version;
    }
  }
  return latest;
}

export interface HotfixBranch {
  branch: string;
  /** The version the branch releases: the base's next patch. */
  version: string;
}

export function hotfixBranch(base: Version): HotfixBranch {
  const version = formatVersion({ ...base, patch: base.patch + 1, pre: null });
  return { branch: `hotfix/v${version}`, version };
}

/** The version a `hotfix/vX.Y.Z` branch releases, or null for any other. */
export function versionOfHotfixBranch(branch: string): string | null {
  const match = /^hotfix\/v(.+)$/.exec(branch);
  if (match === null || match[1] === undefined) return null;
  return VERSION.test(match[1]) && parseVersion(match[1]).pre === null
    ? match[1]
    : null;
}

/**
 * The npm dist-tag a version is published under, given the current `latest`
 * (empty before the first release). A hotfix to an older line gets its own
 * tag, so `npm install` never goes back a minor.
 */
export function distTagFor(version: string, latest: string): string {
  const next = parseVersion(version);
  if (next.pre !== null) return "next";
  if (!VERSION.test(latest)) return "latest";
  if (compareVersions(next, parseVersion(latest)) >= 0) return "latest";
  return `release-${next.major}.${next.minor}`;
}

const UNRELEASED = "## [Unreleased]";
const SECTION = /^## \[([^\]]+)\]/;

/** The index of the next `## [` heading at or after `from`, or the end. */
function nextSection(lines: readonly string[], from: number): number {
  for (let i = from; i < lines.length; i++) {
    if (SECTION.test(lines[i] ?? "")) return i;
  }
  return lines.length;
}

function trimBlank(lines: readonly string[]): string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && (lines[start] ?? "").trim() === "") start++;
  while (end > start && (lines[end - 1] ?? "").trim() === "") end--;
  return lines.slice(start, end);
}

function unreleasedStart(lines: readonly string[]): number {
  const start = lines.indexOf(UNRELEASED);
  if (start < 0) throw new Error("CHANGELOG.md has no ## [Unreleased] heading");
  return start;
}

/** One version's heading and entries, or null when the changelog has none. */
export function releasedSection(
  changelog: string,
  version: string,
): string | null {
  const lines = changelog.split("\n");
  const start = lines.findIndex(line => SECTION.exec(line)?.[1] === version);
  if (start < 0) return null;
  return trimBlank(lines.slice(start, nextSection(lines, start + 1))).join(
    "\n",
  );
}

/** The file whose presence holds every release: its first line says why. */
export const RELEASE_HOLD = ".release-hold";

/**
 * Why a release is held, from the text of the hold file (null when there is
 * none), or null when nothing holds it. A hold file that says nothing still
 * holds.
 */
export function holdReason(text: string | null): string | null {
  if (text === null) return null;
  const first = text
    .split("\n")
    .map(line => line.trim())
    .find(line => line !== "");
  return first ?? `releases are on hold (${RELEASE_HOLD} says no more)`;
}

/**
 * A line that opens a block of its own, so it never continues the line above:
 * a heading, a list item, a quote, a table row, a rule or a code fence. A
 * marker needs the space after it, so `3.5rem` and `**bold**` are text.
 */
const BLOCK_START =
  /^\s*(?:#{1,6}(?:\s|$)|[-*+]\s|\d{1,9}[.)]\s|>|\||(?:-{3,}|\*{3,}|_{3,})\s*$|`{3,}|~{3,})/;

/** A line a following line of text does not continue. */
const SEALED = /^\s*(?:#{1,6}(?:\s|$)|\||(?:-{3,}|\*{3,}|_{3,})\s*$)/;

/**
 * Markdown with each paragraph and each list item on one line. The changelog
 * wraps its prose at 80 columns, and GitHub shows a single newline in a
 * release's notes as a line break, so the notes would come out ragged. Fenced
 * code, tables, headings and hard breaks (two trailing spaces, or a backslash)
 * are left alone, and so is where every block starts.
 */
export function unwrapMarkdown(text: string): string {
  const out: string[] = [];
  let fence: string | null = null;
  // Whether the last line written is one a line of text may carry on.
  let open = false;
  for (const line of text.split("\n")) {
    const mark = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
    if (fence !== null) {
      out.push(line);
      // A fence closes on the same character, at least as long.
      if (
        mark !== undefined &&
        mark[0] === fence[0] &&
        mark.length >= fence.length
      ) {
        fence = null;
      }
      open = false;
    } else if (mark !== undefined) {
      fence = mark;
      out.push(line);
      open = false;
    } else if (line.trim() === "") {
      out.push(line);
      open = false;
    } else if (open && !BLOCK_START.test(line)) {
      out[out.length - 1] =
        `${(out[out.length - 1] ?? "").trimEnd()} ${line.trimStart()}`;
      open = !/(?: {2}|\\)$/.test(line);
    } else {
      out.push(line);
      open = !SEALED.test(line) && !/(?: {2}|\\)$/.test(line);
    }
  }
  return out.join("\n");
}

/**
 * What a GitHub Release says for a version: its changelog entries, without the
 * heading the release's title already carries, one line to a paragraph or list
 * item. Null when the changelog has no section for the version.
 */
export function releaseNotes(
  changelog: string,
  version: string,
): string | null {
  const section = releasedSection(changelog, version);
  if (section === null) return null;
  return unwrapMarkdown(trimBlank(section.split("\n").slice(1)).join("\n"));
}

/**
 * Whether a release is the repository's latest: the one npm calls `latest`. A
 * prerelease, which goes to `next`, and a hotfix to an older line, which goes
 * to `release-X.Y`, are not.
 */
export function releaseIsLatest(distTag: string): boolean {
  return distTag === "latest";
}

export interface GithubRelease {
  /** The tag the release is of, `vX.Y.Z`; it must already exist on GitHub. */
  tag: string;
  version: string;
  latest: boolean;
}

/**
 * The `gh` arguments that create a release of an existing tag, notes read from
 * standard input. `--verify-tag` stops `gh` from making a tag that is not
 * there, and `--latest` is said either way, so GitHub does not guess from dates.
 */
export function githubReleaseArgs({
  tag,
  version,
  latest,
}: GithubRelease): string[] {
  return [
    "release",
    "create",
    tag,
    "--title",
    version,
    "--notes-file",
    "-",
    "--verify-tag",
    latest ? "--latest" : "--latest=false",
  ];
}

export interface BackfillEntry extends GithubRelease {
  notes: string;
}

/**
 * The releases that give every existing release tag its GitHub Release, oldest
 * first so the newest is created last: each with the notes from that tag's own
 * changelog, and `latest` only on the highest version. Prerelease tags and
 * strays are left out. Throws when a tag's changelog has no section for it.
 */
export function backfillPlan(
  tags: readonly string[],
  changelogAt: (tag: string) => string | null,
): BackfillEntry[] {
  const releases = tags
    .filter(
      tag =>
        tag.startsWith("v") &&
        VERSION.test(tag.slice(1)) &&
        parseVersion(tag.slice(1)).pre === null,
    )
    .sort((a, b) =>
      compareVersions(parseVersion(a.slice(1)), parseVersion(b.slice(1))),
    );
  const newest = releases.at(-1);
  return releases.map(tag => {
    const version = tag.slice(1);
    const notes = releaseNotes(changelogAt(tag) ?? "", version);
    if (notes === null) {
      throw new Error(`${tag}: CHANGELOG.md has no [${version}] section`);
    }
    return { tag, version, latest: tag === newest, notes };
  });
}

/**
 * The changelog with everything under `## [Unreleased]` moved under
 * `## [version] - date`, and the Unreleased heading left, empty.
 */
export function cutRelease(
  changelog: string,
  version: string,
  date: string,
): string {
  const lines = changelog.split("\n");
  const start = unreleasedStart(lines);
  if (releasedSection(changelog, version) !== null) {
    throw new Error(`CHANGELOG.md already has a [${version}] section`);
  }
  const end = nextSection(lines, start + 1);
  const entries = trimBlank(lines.slice(start + 1, end));
  if (entries.length === 0) {
    throw new Error(
      "Nothing under [Unreleased] to release: list the changes in " +
        "CHANGELOG.md first",
    );
  }
  const rest = trimBlank(lines.slice(end));
  return [
    ...lines.slice(0, start + 1),
    "",
    `## [${version}] - ${date}`,
    "",
    ...entries,
    ...(rest.length > 0 ? ["", ...rest] : []),
    "",
  ].join("\n");
}

interface Block {
  kind: "heading" | "entry" | "text";
  lines: string[];
}

/** A section's body as headings, list entries and paragraphs. */
function blocksOf(lines: readonly string[]): Block[] {
  const blocks: Block[] = [];
  let open: Block | null = null;
  for (const line of lines) {
    if (line.trim() === "") {
      open = null;
    } else if (line.startsWith("#")) {
      blocks.push({ kind: "heading", lines: [line] });
      open = null;
    } else if (/^[-*] /.test(line)) {
      open = { kind: "entry", lines: [line] };
      blocks.push(open);
    } else if (open !== null && (open.kind === "text" || /^\s/.test(line))) {
      open.lines.push(line);
    } else {
      open = { kind: "text", lines: [line] };
      blocks.push(open);
    }
  }
  return blocks;
}

/** An entry's words, however the entry was wrapped. */
function entryText(block: Block): string {
  return block.lines
    .join(" ")
    .replace(/^[-*]\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Blocks back to Markdown: list entries tight, everything else apart. */
function render(blocks: readonly Block[]): string[] {
  const lines: string[] = [];
  blocks.forEach((block, i) => {
    const previous = blocks[i - 1];
    if (previous !== undefined) {
      const tight = previous.kind === "entry" && block.kind === "entry";
      if (!tight) lines.push("");
    }
    lines.push(...block.lines);
  });
  return lines;
}

/** Unreleased entries, less the ones a released section already lists. */
function withoutReleased(
  entries: readonly string[],
  released: ReadonlySet<string>,
): string[] {
  const blocks = blocksOf(entries);
  const kept = blocks.filter(
    block => block.kind !== "entry" || !released.has(entryText(block)),
  );
  if (kept.length === blocks.length) return [...entries];
  // A heading whose entries all went goes with them.
  const pruned = kept.filter((block, i) => {
    if (block.kind !== "heading") return true;
    const following = kept[i + 1];
    return following !== undefined && following.kind !== "heading";
  });
  return render(pruned);
}

/**
 * Main's changelog with a hotfix's released section filed among the releases,
 * newest first, and the entries it released gone from Unreleased: the fix
 * landed on main first, with its entry, and it has shipped now.
 */
export function forwardPort(changelog: string, section: string): string {
  const sectionLines = trimBlank(section.split("\n"));
  const version = SECTION.exec(sectionLines[0] ?? "")?.[1];
  if (version === undefined) {
    throw new Error("A released section starts with its ## [x.y.z] heading");
  }
  if (releasedSection(changelog, version) !== null) {
    throw new Error(`CHANGELOG.md already has a [${version}] section`);
  }
  const target = parseVersion(version);
  const lines = changelog.split("\n");
  const start = unreleasedStart(lines);
  const unreleasedEnd = nextSection(lines, start + 1);

  let olderAt = lines.length;
  for (let i = unreleasedEnd; i < lines.length; i++) {
    const heading = SECTION.exec(lines[i] ?? "")?.[1];
    if (heading === undefined || !VERSION.test(heading)) continue;
    if (compareVersions(parseVersion(heading), target) < 0) {
      olderAt = i;
      break;
    }
  }

  const released = new Set(
    blocksOf(sectionLines)
      .filter(block => block.kind === "entry")
      .map(entryText),
  );
  const entries = withoutReleased(
    trimBlank(lines.slice(start + 1, unreleasedEnd)),
    released,
  );
  const newer = trimBlank(lines.slice(unreleasedEnd, olderAt));
  const older = trimBlank(lines.slice(olderAt));

  const blocks = [
    [
      ...lines.slice(0, start + 1),
      ...(entries.length > 0 ? ["", ...entries] : []),
    ],
    newer,
    sectionLines,
    older,
  ].filter(block => block.length > 0);
  return `${blocks.map(block => block.join("\n")).join("\n\n")}\n`;
}

const TOP_LEVEL_VERSION = /^( {2}"version": ")[^"]*(")/m;

/** package.json with its own version set, byte for byte otherwise. */
export function setPackageVersion(
  packageJson: string,
  version: string,
): string {
  if (!TOP_LEVEL_VERSION.test(packageJson)) {
    throw new Error('package.json has no top-level "version"');
  }
  return packageJson.replace(TOP_LEVEL_VERSION, `$1${version}$2`);
}
