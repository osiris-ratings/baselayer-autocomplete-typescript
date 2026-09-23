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

The specs osiris-app produces, vendored:

| File                                        | What                          | From                                 |
| ------------------------------------------- | ----------------------------- | ------------------------------------ |
| `contracts/tier-openapi.json`               | the tier's OpenAPI            | `services/autocomplete/openapi.json` |
| `contracts/sessions-openapi.json`           | `POST /autocomplete/sessions` | the API's public OpenAPI             |
| `contracts/mint-grant-response.schema.json` | the mint's 201 body           | the API's schema                     |
| `contracts/autocomplete.overlay.yaml`       | the reference's extra docs    | written here                         |

The wire tests read the first and the third. The scheduled `contract-drift`
workflow compares the vendored tier document with osiris-app's `main` and
fails when they differ: update the copy, adapt `src/core/wire.ts`, and say
what changed in `CHANGELOG.md`.

The sessions document is the API's operation cut out of its public spec, with
the schemas it reaches:

```sh
task generate:openapi:public            # in osiris-app: public_openapi.json
pnpm contracts:sessions path/to/public_openapi.json
```

## The API reference

The site's API reference is generated: `site/api/spec/assemble.ts` cuts the
two routes out of the vendored specs, merges them, and applies the overlay;
the page renders that document and nothing else, and the build publishes it
at `api/openapi.json`. See [the site](docs/site.md).

The overlay is an [OpenAPI Overlay 1.0][overlay] carrying what the upstream
specs do not say yet. Each action names the place
in osiris-app its text belongs. Move the text there, re-vendor the spec, and
delete the action. A target that matches nothing fails the build and the
tests, so a route renamed upstream cannot leave stale text behind.

[overlay]: https://spec.openapis.org/overlay/v1.0.0.html

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
