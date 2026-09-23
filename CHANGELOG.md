# Changelog

All notable changes to `@baselayer/autocomplete`. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Before 1.0 a
breaking change bumps the minor version.

## [Unreleased]

### Added

- An entity model for the routes beyond businesses: `EntityType`,
  `Relation`, `ROUTES`, and the row types `PersonSuggestion`,
  `AddressSuggestion` and `LienSuggestion` over a shared `SuggestionBase`,
  from the working specification. Only businesses is served.
- `client.search(relation, query)`, typed by route; `suggest` is its
  businesses form. `RequestEvent.relation` names the route asked.
- `parseSuggestResponse(relation, body)`, `buildSuggestUrl`, `filterParams`,
  and each route's filters (`FiltersByRelation`).
- `useEntityAutocomplete` and `useSuggestionCombobox`, of which
  `useBusinessAutocomplete` and `useBusinessCombobox` are the businesses form.
- `open` on `BusinessAutocomplete`, `BusinessAutocompleteView` and
  `useSuggestionCombobox`: hold the menu open whatever focus and Escape do,
  for a style preview or a design tool. It still shows only what there is to
  show, and letting go leaves the menu where it would have been.
- `parts` on `BusinessAutocomplete` and `BusinessAutocompleteView`, with
  `ROW_PARTS`, `RowPart` and `RowParts`: which parts of a row show, named for
  any entity: the title, the flags, the subtitle and the secondary subtitle
  (on a business, the name, the states, the lead address and the officers).
  Each shows unless set to `false`, and a line left with nothing is not drawn.

### Changed

- The `background` emphasis highlights in light green (`--bl-ac-marker`,
  `#c6f6d5`, Chakra's green.100) instead of yellow (`#faf089`). Hosts that
  set `--bl-ac-marker` or `matchEmphasisColor` see no change.

## [0.1.0] - 2026-09-22

### Added

- Framework-free client (`@baselayer/autocomplete`): session minting through
  a host-provided `mint`, lazy refresh at 80 % of the session's life,
  single-flighted mints, the refresh fallback, cold-mint backoff honoring
  `Retry-After`, the day and window pools, the step-aside on 503 code 481,
  one recovery per keystroke (re-mint or wait), the auth brake, the filter
  gate on `filterMinStem`, events and a store-friendly snapshot.
- `parseMintResponse`, `defaultMint`, `refusedThePin`, the row readers and
  `resolveLook`.
- React binding (`@baselayer/autocomplete/react`): `useBusinessAutocomplete`,
  `useBusinessCombobox`, `useAutocompleteSession`,
  `AutocompleteClientProvider`, `BusinessAutocompleteView` and the connected
  `BusinessAutocomplete`, with `styles.css`.
- Server helper (`@baselayer/autocomplete/server`): `mintForOrigin`,
  `createMintHandler` and `toResponse`.
- The Baselayer console's autocomplete test suites, ported.
