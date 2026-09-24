// Cuts a release of @baselayer/autocomplete, or a hotfix to one; the Release
// workflow publishes what it tags. See CONTRIBUTING.md, "Releasing".
//
//   pnpm release patch|minor|major|<x.y.z>   the release, as a PR from main
//   pnpm release hotfix [<commit>...]        a hotfix branch off the last release
//   pnpm release tag                         tag what merged, which publishes it
//
// Every command takes --dry-run: it fetches, checks and says what it would
// change, and changes nothing.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";

import {
  bumpVersion,
  compareVersions,
  cutRelease,
  distTagFor,
  formatVersion,
  forwardPort,
  hotfixBranch,
  latestRelease,
  parseVersion,
  releasedSection,
  setPackageVersion,
  versionOfHotfixBranch,
} from "./release-plan.ts";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    "dry-run": { type: "boolean", default: false },
    from: { type: "string" },
  },
});
const dryRun = values["dry-run"];

function refuse(message: string): never {
  throw new Error(message);
}

/** Git's output, untouched: file contents keep their last newline. */
function gitRaw(...args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8" });
}

function git(...args: string[]): string {
  return gitRaw(...args).trim();
}

/** A file as of a commit, or null when the commit does not have it. */
function fileAt(commit: string, path: string): string | null {
  return succeeds("git", ["cat-file", "-e", `${commit}:${path}`])
    ? gitRaw("show", `${commit}:${path}`)
    : null;
}

function succeeds(command: string, args: string[]): boolean {
  try {
    execFileSync(command, args, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** A command that changes something: run it, or under --dry-run, say it. */
function change(command: string, args: string[]): void {
  if (dryRun) {
    const shown = args.map(arg =>
      /[\s"']/.test(arg) ? JSON.stringify(arg) : arg,
    );
    console.log(`  would run: ${[command, ...shown].join(" ")}`);
    return;
  }
  execFileSync(command, args, { stdio: "inherit" });
}

function write(path: string, text: string): void {
  if (dryRun) {
    console.log(`  would write: ${path}`);
    return;
  }
  writeFileSync(path, text);
}

function versionIn(packageJson: string): string {
  return (JSON.parse(packageJson) as { version: string }).version;
}

function today(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function indent(text: string): string {
  return text.replace(/^/gm, "    ");
}

function tagExists(tag: string): boolean {
  return git("tag", "--list", tag) !== "";
}

function branchExists(branch: string): boolean {
  return (
    succeeds("git", [
      "rev-parse",
      "--verify",
      "--quiet",
      `refs/heads/${branch}`,
    ]) ||
    succeeds("git", [
      "rev-parse",
      "--verify",
      "--quiet",
      `refs/remotes/origin/${branch}`,
    ])
  );
}

/** A clean tree and a fresh view of origin, then the branch we are on. */
function preflight(): string {
  if (git("status", "--porcelain") !== "") {
    refuse("the working tree has changes; commit or stash them first");
  }
  git("fetch", "--quiet", "--tags", "origin");
  return git("branch", "--show-current");
}

/** A hotfix branch may not be on origin yet, but must not be behind it. */
function requireNotBehindOrigin(branch: string): void {
  const remote = `origin/${branch}`;
  if (!succeeds("git", ["rev-parse", "--verify", "--quiet", remote])) return;
  if (!succeeds("git", ["merge-base", "--is-ancestor", remote, "HEAD"])) {
    refuse(`${branch} is behind ${remote}; pull first`);
  }
}

function requireAtOrigin(branch: string): void {
  const remote = `origin/${branch}`;
  if (!succeeds("git", ["rev-parse", "--verify", "--quiet", remote])) {
    refuse(`${branch} is not on origin; push it first`);
  }
  if (git("rev-parse", "HEAD") !== git("rev-parse", remote)) {
    refuse(`${branch} is not at ${remote}; pull or push first`);
  }
}

function openPullRequest(head: string, title: string, body: string): void {
  if (!succeeds("gh", ["--version"])) {
    console.log(
      `\nOpen a pull request from ${head} into main (gh is not installed).`,
    );
    return;
  }
  const dir = mkdtempSync(join(tmpdir(), "release-"));
  try {
    const bodyFile = join(dir, "body.md");
    writeFileSync(bodyFile, body);
    change("gh", [
      "pr",
      "create",
      "--draft",
      "--base",
      "main",
      "--head",
      head,
      "--title",
      title,
      "--body-file",
      bodyFile,
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Every commit on a hotfix branch is a fix cherry-picked from main (`-x`) or a
 * changelog edit, so the forward-port only has the changelog to carry.
 */
function requireFixesFromMain(baseTag: string): void {
  const strays: string[] = [];
  for (const sha of git("rev-list", "--reverse", `${baseTag}..HEAD`).split(
    "\n",
  )) {
    if (sha === "") continue;
    const files = git("diff-tree", "--no-commit-id", "--name-only", "-r", sha);
    if (files.split("\n").every(file => file === "CHANGELOG.md")) continue;
    const from = /\(cherry picked from commit ([0-9a-f]{7,40})\)/.exec(
      git("log", "-n1", "--format=%B", sha),
    )?.[1];
    if (
      from !== undefined &&
      succeeds("git", ["merge-base", "--is-ancestor", from, "origin/main"])
    ) {
      continue;
    }
    strays.push(git("log", "-n1", "--format=%h %s", sha));
  }
  if (strays.length > 0) {
    refuse(
      `these commits are not fixes from main:\n  ${strays.join("\n  ")}\n` +
        "Land each fix on main first, then bring it here with git cherry-pick -x.",
    );
  }
}

/** `pnpm release <bump>`: the release PR from main, or the hotfix's commit. */
function prepare(to: string): void {
  const branch = preflight();
  const hotfixVersion = versionOfHotfixBranch(branch);
  if (branch !== "main" && hotfixVersion === null) {
    refuse(`release from main or from a hotfix branch, not ${branch}`);
  }
  if (hotfixVersion === null) requireAtOrigin(branch);
  else requireNotBehindOrigin(branch);

  const packageJson = readFileSync("package.json", "utf8");
  const current = parseVersion(versionIn(packageJson));
  const next = bumpVersion(current, to);
  if (hotfixVersion !== null) {
    if (next !== hotfixVersion) {
      refuse(`${branch} releases ${hotfixVersion}; run pnpm release patch`);
    }
    requireFixesFromMain(`v${formatVersion(current)}`);
  }
  if (tagExists(`v${next}`)) refuse(`v${next} is already tagged`);
  const newest = latestRelease(git("tag", "--list", "v*").split("\n"));
  if (
    hotfixVersion === null &&
    newest !== null &&
    compareVersions(newest, current) > 0
  ) {
    // A hotfix shipped and its forward-port has not merged: releasing now
    // would list the fix again, under this version.
    refuse(
      `v${formatVersion(newest)} is out but main is at ${formatVersion(current)}; ` +
        `merge forward-port/v${formatVersion(newest)} first`,
    );
  }

  const changelog = cutRelease(
    readFileSync("CHANGELOG.md", "utf8"),
    next,
    today(),
  );
  const section = releasedSection(changelog, next) ?? "";
  console.log(
    `Releasing ${next}, after ${formatVersion(current)}:\n\n${indent(section)}\n`,
  );

  const releaseBranch = `release/v${next}`;
  if (hotfixVersion === null) {
    if (branchExists(releaseBranch)) refuse(`${releaseBranch} already exists`);
    change("git", ["switch", "--quiet", "-c", releaseBranch]);
  }
  write("package.json", setPackageVersion(packageJson, next));
  write("CHANGELOG.md", changelog);
  change("git", ["commit", "--quiet", "-am", `Release ${next}`]);

  if (hotfixVersion !== null) {
    change("git", ["push", "--quiet", "-u", "origin", branch]);
    console.log("\nNext: pnpm release tag");
    return;
  }
  change("git", ["push", "--quiet", "-u", "origin", releaseBranch]);
  openPullRequest(
    releaseBranch,
    `Release ${next}`,
    `${section}\n\nOnce this merges, \`pnpm release tag\` tags it and the Release workflow publishes it.\n`,
  );
  console.log(
    "\nNext: mark the pull request ready, merge it, then pnpm release tag",
  );
}

/** `pnpm release hotfix`: a branch off the last release, fixes picked in. */
function hotfix(commits: readonly string[]): void {
  preflight();
  const base =
    values.from === undefined
      ? latestRelease(git("tag", "--list", "v*").split("\n"))
      : parseVersion(values.from.replace(/^v/, ""));
  if (base === null)
    refuse("nothing is released yet, so there is nothing to hotfix");
  const baseTag = `v${formatVersion(base)}`;
  if (!tagExists(baseTag)) refuse(`${baseTag} is not a tag`);
  const { branch, version } = hotfixBranch(base);
  if (tagExists(`v${version}`)) {
    refuse(`v${version} is already out; hotfix it with --from v${version}`);
  }
  if (branchExists(branch)) refuse(`${branch} already exists`);
  for (const commit of commits) {
    if (
      !succeeds("git", ["merge-base", "--is-ancestor", commit, "origin/main"])
    ) {
      refuse(`${commit} is not on main; land the fix there first`);
    }
  }

  console.log(`Hotfixing ${baseTag} as ${version}, on ${branch}`);
  change("git", ["switch", "--quiet", "-c", branch, baseTag]);
  for (const [i, commit] of commits.entries()) {
    try {
      change("git", ["cherry-pick", "-x", commit]);
    } catch {
      const rest = commits.slice(i + 1);
      refuse(
        `${commit} did not apply cleanly. Resolve it, git cherry-pick --continue` +
          (rest.length > 0
            ? `, then git cherry-pick -x ${rest.join(" ")}`
            : "") +
          ", and carry on from the next step below.",
      );
    }
  }
  console.log(
    `\nNext: list the fix under ## [Unreleased] in CHANGELOG.md if the ` +
      `cherry-pick did not bring its entry, commit, then pnpm release patch`,
  );
}

/** Main's changelog, and version when it is behind, after a hotfix release. */
function forwardPortToMain(version: string, section: string): void {
  const mainPackage = gitRaw("show", "origin/main:package.json");
  const behind =
    compareVersions(
      parseVersion(versionIn(mainPackage)),
      parseVersion(version),
    ) < 0;
  const changelog = forwardPort(
    gitRaw("show", "origin/main:CHANGELOG.md"),
    section,
  );
  const branch = `forward-port/v${version}`;
  if (branchExists(branch)) refuse(`${branch} already exists`);

  console.log(`\nForward-porting ${version} to main, on ${branch}`);
  change("git", ["switch", "--quiet", "-c", branch, "origin/main"]);
  write("CHANGELOG.md", changelog);
  if (behind) write("package.json", setPackageVersion(mainPackage, version));
  change("git", [
    "commit",
    "--quiet",
    "-am",
    `Forward-port the ${version} changelog`,
  ]);
  change("git", ["push", "--quiet", "-u", "origin", branch]);
  openPullRequest(
    branch,
    `Forward-port ${version}`,
    `${version} shipped from a hotfix branch. This files its changelog section on main` +
      (behind ? " and moves main's version up to it" : "") +
      "; the fixes are on main already.\n",
  );
}

/** `pnpm release tag`: tag the commit that set the version, and push it. */
function tag(): void {
  const branch = preflight();
  const hotfixVersion = versionOfHotfixBranch(branch);
  if (branch !== "main" && hotfixVersion === null) {
    refuse(`tag from main or from a hotfix branch, not ${branch}`);
  }
  if (hotfixVersion !== null) requireAtOrigin(branch);
  const ref = `origin/${branch}`;

  const version = versionIn(git("show", `${ref}:package.json`));
  const name = `v${version}`;
  if (tagExists(name)) refuse(`${name} is already tagged; cut a release first`);
  const commit = git(
    "log",
    "-n1",
    "--format=%H",
    `-S"version": "${version}"`,
    ref,
    "--",
    "package.json",
  );
  if (commit === "")
    refuse(`no commit on ${ref} sets the version to ${version}`);
  const section = releasedSection(
    fileAt(commit, "CHANGELOG.md") ?? "",
    version,
  );
  if (section === null)
    refuse(`CHANGELOG.md at ${commit.slice(0, 7)} has no [${version}] section`);

  console.log(
    `Tagging ${name} at ${git("log", "-n1", "--format=%h %s", commit)}`,
  );
  change("git", [
    "tag",
    "-a",
    name,
    commit,
    "-m",
    `@baselayer/autocomplete ${version}`,
  ]);
  change("git", ["push", "--quiet", "origin", name]);
  console.log(
    "The Release workflow publishes it once its npm-publish environment is " +
      "approved: gh run list --workflow release.yml",
  );
  if (hotfixVersion !== null) forwardPortToMain(version, section);
}

const USAGE = `usage:
  pnpm release patch|minor|major|<x.y.z> [--dry-run]
  pnpm release hotfix [<commit>...] [--from vX.Y.Z] [--dry-run]
  pnpm release tag [--dry-run]`;

try {
  const [command, ...rest] = positionals;
  switch (command) {
    case undefined:
      console.log(USAGE);
      break;
    case "hotfix":
      hotfix(rest);
      break;
    case "tag":
      tag();
      break;
    case "dist-tag":
      // For the Release workflow: the dist-tag for a version, given `latest`.
      console.log(distTagFor(rest[0] ?? refuse(USAGE), rest[1] ?? ""));
      break;
    default:
      prepare(command);
  }
} catch (error) {
  if (!(error instanceof Error)) throw error;
  console.error(`release: ${error.message}`);
  process.exit(1);
}
