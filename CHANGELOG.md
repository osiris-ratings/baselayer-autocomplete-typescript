# Changelog

All notable changes to `@baselayer-sdk/autocomplete`. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Before 1.0 a
breaking change bumps the minor version.

## [Unreleased]

## [0.1.0] - 2026-09-24

The first release.

### Added

- Framework-free client (`@baselayer-sdk/autocomplete`): session minting through
  a host-provided `mint`, lazy refresh at 80 % of the session's life,
  single-flighted mints, the refresh fallback, cold-mint backoff honoring
  `Retry-After`, the day and window pools, the step-aside on 503 code 481,
  one recovery per keystroke (re-mint or wait), the auth brake, the filter
  gate on `filterMinStem`, events and a store-friendly snapshot.
- An entity model for the routes beyond businesses: `EntityType`,
  `Relation`, `ROUTES`, and the row types `PersonSuggestion`,
  `AddressSuggestion` and `LienSuggestion` over a shared `SuggestionBase`,
  from the working specification. Only businesses is served.
- `client.search(relation, query)`, typed by route; `suggest` is its
  businesses form. `RequestEvent.relation` names the route asked.
- `parseMintResponse`, `defaultMint`, `parseSuggestResponse`,
  `buildSuggestUrl`, `filterParams` and each route's filters
  (`FiltersByRelation`), `refusedThePin`, the row readers, `resolveLook`,
  and `resolveParts` with `includeForParts`.
- `MintedGrant.expiresAtUtc`, the API's `expires_at`: when the grant stops
  working, as a UTC timestamp, for display and logs. It is optional, absent
  from an API that does not send it, and a value that does not parse is left
  out rather than refusing the grant. Refresh is timed from `expiresIn`.
- React binding (`@baselayer-sdk/autocomplete/react`): `useBusinessAutocomplete`
  and `useEntityAutocomplete`, `useBusinessCombobox` and
  `useSuggestionCombobox`, `useAutocompleteSession`,
  `AutocompleteClientProvider`, `BusinessAutocompleteView` and the connected
  `BusinessAutocomplete`, with `styles.css`.
- On `BusinessAutocomplete`: `mintOn` (`MINT_TIMINGS`, `MintTiming`), when
  the session is minted: on `focus` (the default), on the first `keystroke`,
  or with the first `request`; and `parts` (`ROW_PARTS`, `RowPart`,
  `RowParts`), which parts of a row show besides its title, and so which are
  fetched.
- On `BusinessAutocomplete` and `BusinessAutocompleteView`:
  `menuFollowsInputWidth`, on by default (`false` gives the menu a fixed
  `--bl-ac-menu-width` from 48em up), and `open`, which holds the menu open
  whatever focus and Escape do, for a style preview or a design tool.
- The stylesheet's custom properties (`--bl-ac-*`), class names, render
  props and `unstyled`.
- Server helper (`@baselayer-sdk/autocomplete/server`): `mintForOrigin`,
  `createMintHandler` and `toResponse`.
