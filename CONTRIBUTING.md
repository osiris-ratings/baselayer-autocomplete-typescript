# Contributing

## Setup

```sh
pnpm install
pnpm test
```

Node 20 or later and pnpm (the version in `package.json`'s
`packageManager`).

## Checks

CI runs these on every pull request, on Node 20 and 22:

```sh
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm build
pnpm check:package   # publint and are-the-types-wrong on the packed tarball
```

The core (`src/core`, `src/index.ts`) and the server helper (`src/server`)
must not import React, React DOM or downshift; ESLint enforces it and a test
asserts it on the built bundle. The React entry imports the core through the
package's own name (`@baselayer/autocomplete`), which the build keeps
external so an application loads one copy of the core.

## Contracts

The specs the Baselayer API publishes, vendored:

| File                                        | What                          | From                        |
| ------------------------------------------- | ----------------------------- | --------------------------- |
| `contracts/tier-openapi.json`               | the tier's OpenAPI            | the tier's OpenAPI document |
| `contracts/sessions-openapi.json`           | `POST /autocomplete/sessions` | the API's public OpenAPI    |
| `contracts/mint-grant-response.schema.json` | the mint's 201 body           | the API's schema            |
| `contracts/autocomplete.overlay.yaml`       | the reference's extra docs    | written here                |

The wire tests read the first and the third. When the API changes, update
the copy, adapt `src/core/wire.ts`, and say what changed in `CHANGELOG.md`.

The sessions document is the API's operation cut out of its public spec, with
the schemas it reaches:

```sh
pnpm contracts:sessions path/to/public_openapi.json
```

## The API reference

The site's API reference is generated: `site/api/spec/assemble.ts` cuts the
two routes out of the vendored specs, merges them, and applies the overlay;
the page renders that document and nothing else, and the build publishes it
at `api/openapi.json`. See [the site](docs/site.md).

The overlay is an [OpenAPI Overlay 1.0][overlay] carrying what the upstream
specs do not say yet. Each action says where upstream its text belongs.
Once the text is there, re-vendor the spec and delete the action. A target
that matches nothing fails the build and the tests, so a route renamed
upstream cannot leave stale text behind.

[overlay]: https://spec.openapis.org/overlay/v1.0.0.html

## Releasing

`pnpm release` does the bookkeeping, and the Release workflow publishes. The
workflow runs on a `v*` tag, waits for someone to approve its `npm-publish`
environment, checks that the tag, `package.json` and the changelog agree,
runs every check, and publishes to npm. Every command below takes
`--dry-run`, which checks everything and says what it would change without
changing it. The script runs as TypeScript, which needs Node 22.18 or later.

### A release

With the changes listed under `## [Unreleased]` in `CHANGELOG.md`, on a
`main` that matches `origin/main`:

```sh
pnpm release minor   # or patch, major, or an exact version such as 0.3.0
```

It bumps `package.json`, moves the Unreleased entries under
`## [x.y.z] - <today>`, and opens a draft pull request from `release/vx.y.z`.
Mark it ready and merge it, then tag what merged:

```sh
pnpm release tag     # tags the commit that set the version, and pushes the tag
```

and approve the `npm-publish` environment on the Release run.

### A hotfix

A hotfix ships a fix on top of the last release while `main` holds work that
is not ready to go. The fix lands on `main` first, as any change does, and the
hotfix branch takes it from there:

```sh
pnpm release hotfix <sha>   # hotfix/vx.y.z off the last release, fix picked in
```

`--from vX.Y.Z` hotfixes an older release instead. If the cherry-pick did not
bring the fix's changelog entry, add it under `## [Unreleased]` and commit.
Then:

```sh
pnpm release patch   # bumps and commits on the hotfix branch, and pushes it
pnpm release tag     # tags it, and opens the forward-port pull request
```

`pnpm release patch` refuses a hotfix branch holding anything but fixes
cherry-picked from `main` (`git cherry-pick -x`) and changelog edits, so
nothing ships that `main` lacks. The forward-port files the hotfix's section
in `main`'s changelog, drops the entries it released from Unreleased, and
moves `main`'s version up to the hotfix's when it is behind. Approve the
Release run and merge the forward-port.

A hotfix to an older line, 0.1.2 while 0.2.0 is out, is published under the
`release-0.1` dist-tag rather than `latest`, so `npm install` never goes back
a minor.

### A prerelease

A prerelease is published by hand from a scratch copy, under `next`, and
leaves the repository alone:

```sh
dir="$(mktemp -d)/ac" && git worktree add "$dir" main && cd "$dir"
npm version 0.2.0-rc.0 --no-git-tag-version
pnpm install && pnpm build && npm publish --tag next
```
