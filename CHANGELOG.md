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

## [0.1.0] - 2026-09-22

### Added

- Framework-free client (`@baselayer/autocomplete`): session minting through
  a host-provided `mint`, lazy refresh at 80 % of the session's life,
  single-flighted mints, the refresh fallback, cold-mint backoff honouring
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
