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

`contracts/tier-openapi.json` is the autocomplete tier's OpenAPI document
and `contracts/mint-grant-response.schema.json` the mint's 201 body. The
wire tests read them. The scheduled `contract-drift` workflow compares the
vendored tier document with osiris-app's `main` and fails when they differ:
update the copy, adapt `src/core/wire.ts`, and say what changed in
`CHANGELOG.md`.

## Releasing

1. In a pull request, bump `version` in `package.json` and move the
   `## [Unreleased]` entries under `## [x.y.z] - YYYY-MM-DD`.
2. Merge it.
3. Tag the merge commit and push the tag:

   ```sh
   git tag vX.Y.Z <sha> && git push origin vX.Y.Z
   ```

4. Approve the `npm-publish` environment on the Release run. The workflow
   checks that the tag, `package.json` and the changelog agree, runs every
   check, and publishes to npm.
5. Pin the new version in osiris-app's console and admin console.
