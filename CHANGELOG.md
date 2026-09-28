# Changelog

All notable changes to `@baselayer-sdk/autocomplete`. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Before 1.0 a
breaking change bumps the minor version.

## [Unreleased]

A row's places are named for where they sit, a host picks the field each one
shows, and the business structure is a new field, drawn by default as a flag
after the name. `parts` gives way to `layout`, a breaking change: this ships
as a minor release.

### Added

- `--bl-ac-font`, `--bl-ac-name-weight`, `--bl-ac-weight-base` and
  `--bl-ac-weight-mark`: the component's font family, left unset so it keeps
  the page's font, and the weights it used to fix (600, 500 and 700). The
  `also …` marks under the `weight` emphasis take `--bl-ac-weight-mark`, so
  they are drawn in 700 rather than 600.
- `BusinessSuggestion.structure`, the legal structure of the business's
  domicile registration: one of `BUSINESS_STRUCTURES` (`BusinessStructure`),
  or null when it is not known or the API does not send it. A value this
  build does not know is kept as the string it is.
- `layout` on `BusinessAutocomplete` and `BusinessAutocompleteView`: the
  field (`states`, `structure`, `address` or `people`) each place of a row
  shows, or `null` for an empty one. The places are each line's two
  corners, a field and a badge pinned to its inner side: `titleBadge`,
  `titleTrailingBadge`, `titleTrailing`, `subtitle`, `subtitleBadge`,
  `subtitleTrailingBadge` and `subtitleTrailing`. The three new badge
  places start empty. A place left out keeps its default field unless
  that field is placed elsewhere, and a field placed twice stays in the first
  place, so none is drawn twice. In the core: `ROW_PLACES`, `ROW_FIELDS`,
  `DEFAULT_ROW_LAYOUT`, `resolveRowLayout`, `drawnRowLayout` (a layout as
  the row draws it: a badge beside an empty field is drawn as that field,
  and an empty second-line lead takes the right corner), `includeForLayout`,
  and the types
  `RowPlace`, `RowField`, `RowLayout` and `RowLayoutInput`.
- `structureLabel(structure, labels)`: a structure's flag (`C-Corp`, `LLC`,
  `Sole prop.`, `P.A.`, …), or null for `OTHER`, none, or a value it has no
  label for. `messages.structures` relabels any value, and an empty label
  hides its flag.
- `look.structurePillBackgroundColor` and `look.structurePillForegroundColor`
  (`--bl-ac-structure-bg`, `--bl-ac-structure-fg`), a neutral grey by default.
- The slots `title` (the name group and `also …`), `nameGroup` (the name and
  its badge) and `structure` (the flag, `bl-ac-structure`).

### Changed

- `mintOn` defaults to `"keystroke"`: the session is minted on the first
  keystroke rather than as the field takes focus, so a click into the field
  that types nothing spends no mint. `mintOn="focus"` keeps the old timing.
- **Breaking:** `parts` is now `layout`. `parts={{ flags: false }}` is
  `layout={{ titleTrailing: null }}`, `{ subtitle: false }` is
  `{ subtitle: null }`, and `{ secondarySubtitle: false }` is
  `{ subtitleTrailing: null }`; `includeForParts(resolveParts(parts))` is
  `includeForLayout(layout)`.
- **Breaking:** every field's element carries `data-place` with its place, in
  place of `data-slot="left"` or `"right"`, and the title carries
  `data-place="title"`. A field drawn in the second line's lead because
  `subtitle` is empty says `subtitle`.
- A row shows its structure's flag after the name by default.
  `layout={{ titleBadge: null }}` leaves it out, and draws the row as before
  but for the changes below.
- `also …` is no longer inside `.bl-ac-name`, so the name's element
  (`business-suggestion-name`) no longer holds its text: the title
  (`.bl-ac-title`) holds the name group and `also …`, which carries its own
  `data-emphasis`. When the first line runs out of room, `also …` is
  ellipsised down to 6em, then leaves the line whole, before the name is
  ellipsised.
- The name and the address are ellipsised where the text runs out rather than
  at a word, so a badge sits right after the name and text at the right is
  flush right.
- The address and the people carry their own size and color
  (`--bl-ac-subtitle`), so they look the same on either line;
  `.bl-ac-line-subtitle` no longer sets them.
- Text at the first line's right keeps to half the line, so the name keeps the
  rest. Text at the second line's right takes all the room a flag or an empty
  lead leaves it.
- `BusinessSuggestion` requires `structure`: a row built by hand, for a
  preview or a test, gives it one or `null`. `Look` gains its two structure
  colors, `AutocompleteMessages` its `structures` and `SlotName` its three
  slots, so a complete literal of any of them needs them too.
- The vendored tier contract carries `structure`, and the API reference shows
  a suggestion's `structure` with its values.

### Removed

- `parts`, `ROW_PARTS`, `RowPart`, `RowParts`, `resolveParts` and
  `includeForParts`.

## [0.1.1] - 2026-09-25

### Changed

- The README, the site and the demo show `POST /searches` with the
  `business_token` alone. The search now takes it in place of `name` and
  `address` and refuses a body that carries it beside either one (a 422).
  `refusedThePin` is true for that 422, so a backend built from 0.1.0's
  example, the name with the token, falls back and never pins a search.
- The README, the docs, the site and the doc comments describe the styled
  component's default look on its own terms, and the pre-release note says
  what 0.x promises: a breaking change bumps the minor version until 1.0.

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
