# Changelog

All notable changes to `@baselayer-sdk/autocomplete`. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Before 1.0 a
breaking change bumps the minor version.

## [Unreleased]

Find a business through a person or through an address. The people and addresses
routes are served, each with a component of its own: a person's row shows their
first address, their counts and a line for each business with its address,
states and role, and an address's row its counts and each business there. A
business picked from either spends the same token a business row's pick does,
and a host can let the person, an address or a listed person be picked as well.
A session is held to a scope, the searches it may make, which the mint answers
and your backend can narrow, and the SDK never sends a request outside it.

All three searches draw their rows from one model: a head, the lines it lists
(`list`), which of them a visitor can pick (`enabledLines`), and an icon on
each segment a host names (`iconSegments`). A business row can list its
officers and agents and its addresses; listing nothing, it draws exactly as
it did.

Every closed value in a search's answer is now a typed union pinned to the API's
contract, and one the SDK does not know is a `contract` error rather than kept:
the SDK learns a value before the API sends it. A route or a relation the
session's scope names but the SDK does not know is dropped. With the changed
filters of the two routes and the new error kinds, this ships as a minor
release.

### Added

- `PersonAutocomplete` and `AddressAutocomplete`: styled typeaheads that find a
  business through a person or an address. Each person or address is a group in
  the menu: its name with its counts, a person's first address, and a line for
  each business under it with the business's address, states and role, an icon
  before every name. `list` lists a person's addresses or an address's people
  too, drawn in its order, `enabledLines` enables the row itself or the lines it
  lists, `layout` places each line's fields, as on a business row, and
  `iconSegments` and `icons` choose the icons. `onPick` hands a `BusinessPick`:
  `businessToken`, `businessName`, `pickedAt`, `expiresAt`, and `through`, the
  person or address it was reached by with the business's role there;
  `onPickEntity` hands an `EntityPick` for a person or an address. A pick puts
  the row's own name in the field, and a pick from a line under the row draws a
  line under the field naming it until the next edit (`showSelection`).
  `PersonAutocompleteView` and `AddressAutocompleteView` draw the same rows from
  state a host supplies.
- `list`, `enabledLines`, `onPickEntity`, `icons`, `iconSegments` and
  `showSelection` on `BusinessAutocomplete`: a business row can list its
  officers and agents and its addresses, a line each with the role. Such a row
  is a group whose head is the row as it has always been, picked as it always
  was; an officer or an address picked hands `onPickEntity` an `EntityPick`,
  puts the business's name in the field, and is named on a line under it. With
  none of them, a business row draws exactly as before.
  `BusinessAutocompleteView` takes `list`, `enabledLines`, `icons`,
  `iconSegments`, `selection` and `onSelectEntity`.
- Icons on segments: `iconSegments` on all three components names the segments
  that carry one, a name or a field with a glyph of its own (an address, a
  business's people), drawn right before its text wherever it is placed; none on
  a business row by default, every name on a person's and an address's. The
  glyph follows the entity and, where the row knows it, the role: a building, a
  person (an agent a briefcase), a map pin (mailing an envelope, an agent's a
  briefcase, an officer's a house). `icons` takes your own, keyed by entity or
  `entity:role`, the role's winning, and `false` or `null` hides one. Each icon
  carries `data-entity`, `data-role` and `data-glyph`. `IconSet`, `IconKey`,
  `DEFAULT_ICON_SEGMENTS`, `IconSegmentByRoute` and each kind's segments
  (`BUSINESS_ICON_SEGMENTS`, …).
- A disabled line, or a row's head that is not a pick, is an option marked
  `aria-disabled`, which a screen reader calls unavailable, the keys pass over
  and a click does not pick; a head still names its group. `isItemDisabled` on
  `useSuggestionCombobox` does the same for a host's own rows.
- The line under the field after a pick from a line under a row
  (`bl-ac-selection`, a `GroupedSelection` on the views), the field described
  by it. It names the picked line while the field holds the name the pick put
  there, and any other edit lets it go.
- `disabledDim` on `look`: how far a disabled line, or a head that is not a
  pick, fades, 0 to 1 and 0.6 by default, so it reads as inactive: a person's
  and an address's heads by default. It drains the line's colour, fades its text
  toward the menu's ground and dims its state squares, with floors worked out
  from the look's colours: a name keeps 4.6:1 (3:1 or more as drawn) and the
  rest 40% of its contrast, at least 1.8:1. Nothing fades under forced colours.
- One row model for all three searches: `BUSINESS_ROW`, `PERSON_ROW` and
  `ADDRESS_ROW` (`ROW_KINDS`), each a `RowKind`: its places
  (`BUSINESS_ROW_PLACES`, …), its fields by line (`BUSINESS_LINE_FIELDS`, …),
  its lines, each naming the entity it draws and the relation it lists, the
  segments an icon can ride on (`iconSegments`), and its defaults.
  `resolveLayout` and `drawnLayout` resolve any kind's layout, typed by its own
  places and fields (`BusinessRowLayoutInput`, `PersonRowLayoutInput`,
  `AddressRowLayoutInput`; `LayoutOf` and `LayoutInputOf` for any kind).
  `ROW_PLACES`, `ROW_FIELDS` and `RowLayout` are a business row's head, as they
  always were.
- `DEFAULT_LIST` and `requestFor(route, layout, list, scope)`: what any
  search's rows list, in the host's order, and what to ask for them.
- `groupedLines(row, list, enabledLines)` and `groupedOptions(lines)`: any row's
  lines, and what each enabled one hands, a `GroupedOption` of kind `row` (a
  business row's own head), `business` (a business under a person or an address)
  or `entity` (an `EntityPick`). `DEFAULT_ENABLED_LINES` is businesses.
- `pickableBusinesses(row)` and `businessPickFrom(row, business, at)`: the
  businesses a person's or an address's row offers, and the pick of one.
- `address`, `states` and `domicile_state` on a related item: a business
  under a person or an address carries the lead address, states and domicile
  its own row has. All three are null on a person or an address.
  `orderedStates` takes either and puts the domicile first.
- The session's scope: `Grant.scope` (`{ routes, maxLimit }`), read from the
  mint's answer, `DEFAULT_SESSION_SCOPE` for a grant without one,
  `parseSessionScope`, `offeredRoutes(scope)`, `allowedFilters(scope, route)`
  and `scopeViolation(scope, route, request)`.
- `scope` on `mintForOrigin` and `createMintHandler` (one scope, or a
  function of the request): it narrows what each session may search.
- `out_of_scope`, an error kind with `route`, `relation` and `param`: a
  request its session's scope leaves out, refused before it is sent, or the
  autocomplete service's 403 code 501 or 502, which is never retried.
- `route_unserved`, an error kind with `unserved` (`reason`, `current`,
  `required`): a deployment that has the people or addresses route but
  cannot answer it yet, its index or its tokens too old. Never retried; the
  hooks show `messages.routeUnserved`. `ROUTE_UNSERVED_REASONS` and
  `RouteUnservedReason` are the reasons, pinned to the contract.
- `ROUTE_NAMES`, `RELATIONS`, `LEGAL_RELATIONS`, `Route`, `FILTER_PARAMS`,
  `setFilters`, and the unions `MatchGrade`, `SourceStatus`, `RelatedRole`
  and `EntityType` with their value lists (`MATCH_GRADES`, …).
- `expanded` on the hooks' state: the relations the shown rows expanded, those
  their answer's `sources` mark `ok`. The components list only these under a
  row, so a relation left out, or a grant that has changed since, never draws
  an empty list.
- `usage.requestsByRoute` on the snapshot and `requestsOnRoute` on each
  request event: the requests on the current session, per route, as the
  autocomplete service budgets them.
- Messages for the new rows: `person`, `people`, `address`, `addresses`,
  `relationCounts`, `moreNotShown`, `personRoles`, `addressRoles`,
  `outOfScope` and `routeUnserved`. Slots: `group`, `groupHead`, `groupLine`,
  `lineName`, `counts`, `role`, `more`, `icon` and `selection`.
- The demo searches by business, person or address, offering what the
  session's scope allows, and `DEMO_API=sample pnpm demo` runs it on made-up
  data with no network. In Styling, the row map builds each search's row: a
  segment is dragged into a place, each line is switched Off, Visible or
  Enabled, and a segment's icon goes on or off from its chip; the preview
  draws the same row and the export writes its props.

### Changed

- **Breaking:** `RelatedItem` gains `address`, `states` and `domicile_state`,
  required as the parser always fills them; a fixture that builds a related item
  by hand must add them, null on a person or an address item.
- **Breaking:** `BusinessAutocompleteProps` is a union over `enabledLines` and
  `onPickEntity`, so that a person or an address, once enabled, has somewhere to
  go. A wrapper that takes `Omit<BusinessAutocompleteProps, …>` and spreads the
  rest needs an `Omit` that distributes over the union:
  `T extends unknown ? Omit<T, K> : never`.
- **Breaking:** `layout` on `BusinessAutocomplete` and
  `BusinessAutocompleteView` is a `BusinessRowLayoutInput`, which also places a
  listed line's fields, so handing it to `includeForLayout` or
  `resolveRowLayout` no longer compiles:
  `requestFor("businesses", resolveLayout(BUSINESS_ROW, layout))` gives what to
  fetch.
- **Breaking:** `ROUTES.people` and `ROUTES.addresses` are served, and their
  filters are exactly what each serves: `{ business: { state } }` on people,
  `{ state }` on addresses. `filterParams` and `hasFilters` take the route, and
  they and `buildSuggestUrl` send only its own parameters.
- **Breaking:** `match`, `type`, `role`, `structure` and a source's `status` are
  typed unions pinned to the API's contract, and an unknown value is a
  `contract` error. A related item must be the entity its relation holds.
- **Breaking:** `Look` gains `disabledDim`, `AutocompleteMessages` the messages
  for the new rows, and `SlotName` the new slots, so a complete literal of any
  of them needs them too.
- **Breaking:** `AutocompleteErrorKind` gains `out_of_scope` and
  `route_unserved`, so a switch over it that ends in `never`, or a record keyed
  by it, needs them.
- **Breaking:** `EntityAutocompleteState` requires `expanded`, the relations
  the shown rows expanded, so a state built by hand needs it.
- **Breaking:** `Grant` requires `scope`, the snapshot's `usage`
  `requestsByRoute` and a `RequestEvent` `requestsOnRoute`, so a fixture or a
  fake client that builds one needs them; a `mint` is unchanged.
- **Breaking:** `AddressRole` is gone (use `RelatedRole`).
- **Breaking:** every field of an address's `components` (`line1`, `line2`,
  `city`, `state`, `postal_code`) is `string | null`: null, or absent, where the
  filing did not carry it.
- The hooks and components ask for 5 rows or the session's most, whichever
  is fewer, and leave out an `include` member the scope does not grant.

## [0.3.0] - 2026-10-06

A row says what a filter matched it on. A person, an address or a state filter
narrows the suggestions, and the autocomplete service flags what each row
matched; the SDK parsed those flags and drew none of them. A row now marks the
officer, the address and the state that a filter matched, in the emphasis of
the name's own marks, and a reader and the pick carry the same answer.

Liens are gone. Autocomplete will not search them, so the SDK no longer
carries a lien route, row, relation or filter, and a response no longer has a
`liens` source or relation to send. Removing exported types is a breaking
change: this ships as a minor release.

### Added

- `matchedOn(suggestion, { state })`: what a row matched on besides its name,
  as `MatchedOn[]` (the alias, the officers and agents, the addresses with
  whose they are, and the states a state filter named), or `[]` when only the
  name matched. `addressLineOf(suggestion)`: the lead address, whether it
  matched, and whose it is.
- `look.matchEmphasis` marks what a filter matched as well: a matched officer
  and a matched address, whole, and the squares of the states a state filter
  named (a square is also ringed, since its fill and weight would hide a
  mark). `data-matched="true"` says which. A matched address says whose it is,
  after it: `· officer's address` or `· agent's address`, the messages
  `officerAddressSuffix` and `agentAddressSuffix`.
- `appliedFilters` on `useBusinessAutocomplete` and on
  `BusinessAutocompleteView`: the filters the rows were fetched with, none
  when there were none or the client withheld them from a short name.
- `Pick.matchedOn`: what the picked row matched on besides its name, `[]` for
  a pick the name alone reached.
- `pickedNameOf(suggestion)`: what a pick fills into the name field, the name
  the row matched on: its `matched_name` (a name the business goes by) when it
  matched that, else its `label`.

### Changed

- **Breaking:** `Pick` requires `matchedOn`, and `EntityAutocompleteState`
  requires `appliedFilters`, so a host that builds either needs them.
- A pick on `BusinessAutocomplete` fills the field with the name the row
  matched on, not always the row's `label`: typing `baselaye` and picking
  `OSIRIS RATINGS, INC. also BASELAYER` now leaves `BASELAYER` in the field
  rather than replacing it with a name the typed text is not part of. A row
  that matched its own name fills it as before. The business token is the
  same either way. A host that compares the field with `label` after a pick
  compares with `pickedNameOf` instead.
- `peopleLineOf` leads with the people a person filter matched, and says how
  many of its names did (`matched`). `orderedStates(suggestion, matched)`
  moves the states a state filter matched up behind the domicile, so a matched
  state is never left behind `+N`.
- A response needs no `sources.liens` and no `related.liens`, and a row's
  `related` and the response's `sources` carry `people` and `addresses` only.
  A response that still carries a relation the route does not expand parses,
  the relation dropped like any other field the SDK does not know.
- The vendored autocomplete contract, the API reference, the overview, the
  demo's sample rows and the docs say nothing of liens.

### Removed

- **Breaking:** `LienSuggestion`, `LiensFilters`, `LienStatus` and
  `LienPartyRole`; `lien` from `EntityType` and `RELATION_OF`, `liens` from
  `Relation`, `ENTITY_OF`, `ROUTES`, `SuggestionByRelation`,
  `FiltersByRelation` and every route's `includes`; and the `lien` filter on
  the people route, which sent `lien.state`, `lien.status` and `lien.role`.

### Fixed

- `BusinessAutocomplete` searches the picked name again when a filter is
  edited after the pick, so a host that holds the menu open while a filter is
  typed (`open`) sees the narrowed list, not an empty one. The pick used to
  switch the search off until the name itself was edited. Re-rendering the
  same filters in a new object, and editing the name, behave as before. A pick
  is of the filters it was made under, so putting them back as they were is not
  a return to it: the name is searched again, and its rows are there to pick.

## [0.2.0] - 2026-09-28

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
- `include` on `BusinessAutocomplete`: the related entities the autocomplete
  service expands for each row, by default what `layout` places
  (`includeForLayout(layout)`), so rows a host draws with `renderRow` can ask
  for what they read.
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
  and an empty second-line lead takes the right corner), `ROW_LINES` (each
  line's lead and trailing corner, as the places they are made of),
  `includeForLayout`, and the types `RowPlace`, `RowField`, `RowLayout`,
  `RowLayoutInput`, `RowLine` and `RowCorner`.
- `structureLabel(structure, labels)`: a structure's flag (`C-Corp`, `LLC`,
  `Sole prop.`, `P.A.`, …), or null for `OTHER`, none, or a value it has no
  label for. `messages.structures` relabels any value, and an empty label
  hides its flag.
- `look.structurePillBackgroundColor` and `look.structurePillForegroundColor`
  (`--bl-ac-structure-bg`, `--bl-ac-structure-fg`), a neutral grey by default.
- The slots `title` (the name group and `also …`), `nameGroup` (the name and
  its badge), `structure` (the flag, `bl-ac-structure`) and `corner` (a
  line's lead or trailing corner, `bl-ac-corner`).

### Changed

- `look.matchEmphasisRegion` defaults to `"substring"`: a match marks the
  characters typed, not the whole word they begin. `"token"` keeps the
  whole-word marks.
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
  `subtitle` is empty says `subtitle`. A line holds its corners rather than
  its fields: the title, then `.bl-ac-corner` elements with
  `data-corner="lead"` or `"trailing"`, marked `data-text` when they hold
  text on that row and `data-flag` when they hold a flag.
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
- Each line is two corners: the lead takes the room the trailing corner
  leaves it and gives way first, and in either one, text gives way while a
  flag keeps its width, so no layout draws a line wider than the menu. Text
  at the right keeps to half the first line, so the name keeps the rest, or
  all but about 5rem of the second, and takes the rest of the line beside a
  lead with no text. A second-line lead that pins a flag beside its text
  shares the line with the text at the right, each giving way in
  proportion.
- `BusinessSuggestion` requires `structure`: a row built by hand, for a
  preview or a test, gives it one or `null`. `Look` gains its two structure
  colors, `AutocompleteMessages` its `structures` and `SlotName` its four
  slots, so a complete literal of any of them needs them too.
- The vendored autocomplete contract carries `structure`, and the API reference
  shows a suggestion's `structure` with its values.

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
