# Headless use

The styled component is one layer. Under it are hooks that hold the state
and the accessibility wiring, and under those a client with no React at
all. Stop at whichever layer your design system wants.

## The client

```ts
import {
  createAutocompleteClient,
  defaultMint,
} from "@baselayer-sdk/autocomplete";

const client = createAutocompleteClient({
  baseUrl: "https://api.baselayer.com",
  mint: defaultMint("/api/ac-session"),
});

const controller = new AbortController();
const { response, roundTripMs, indexTag } = await client.suggest(
  { q: "harbor concr", limit: 5 },
  { signal: controller.signal },
);
response.suggestions.forEach(row => console.log(row.label, row.token));
```

Create one client per page, or per signed-in identity, and call `reset()`
on sign-out: it disowns a mint in flight and forgets the session and every
cooldown.

`prewarm()` gets a session ahead of the first request, as the component
does on the first keystroke, and swallows a failure (a `mint` event still
reports the refusal). `getSession({ force })` resolves to the current grant,
minting or refreshing it when needed; `force: true` discards the cached
grant first.
`client.baseUrl` is the host it asks, trailing slashes stripped.

`suggest` recovers at most once per call: a missing, invalid or expired
session, a spent budget and a session refused for pivoting are re-minted
and replayed; a `rate_limited` reply waits out its `Retry-After` (at most
2 s) and replays. Anything else rejects with an `AutocompleteError` whose
`kind` says what happened (see [Error states](error-states.md)). A call
whose `signal` aborts rejects with an `AbortError` instead, which
`isAbortError(error)` recognizes.

### Filters

```ts
await client.suggest({
  q: "harbor concrete",
  filters: {
    state: ["PA", "OH"],
    person: { name: "dana", role: "officer" },
    address: { city: "Pittsburgh" },
  },
});
```

`state` matches any state the family is registered in, `domicileState` only
its root registration's state. The route's full set of filters is under
[Filters](entities.md#filters); the autocomplete service answers any other
parameter with a 422.

The autocomplete service refuses filters until the name is long enough to be a
name someone is typing (the session's `filterMinStem`, 5 characters by default).
By default the client holds the filters back below that length and says so with
`filtersWithheld: true`, so a field narrows from the fifth character without
ever seeing a 422. `onShortStem: "send"` sends them anyway; `"throw"` rejects
locally.

### Other routes, and the session's scope

`search(route, query)` asks any route; `suggest` is the businesses one.

```ts
const { scope } = await client.getSession();
if (offeredRoutes(scope).includes("people")) {
  const { response } = await client.search("people", {
    q: "dana whitfield",
    filters: { business: { state: ["PA"] } },
  });
}
```

A session searches only what its scope allows (see
[What a session may search](entities.md#what-a-session-may-search)). The
client refuses a route, an `include` member or a filter outside it before
anything is sent, as `out_of_scope` with `route`, `relation` and `param`
saying what, and a `limit` past `scope.maxLimit` as `query_invalid`.
`offeredRoutes(scope)` and `allowedFilters(scope, route)` say beforehand what
to offer; `scopeViolation(scope, route, { include, filters })` says what a
request would be refused for, or null.

### Configuration

Every timing and threshold is configuration, with Baselayer's defaults:

```ts
createAutocompleteClient({
  baseUrl,
  mint,
  session: {
    refreshAtFraction: 0.8, // refresh at 80 % of the session's life
    refreshRetryMs: 5_000, // a failed refresh serves the old session
    mintRetryMs: 10_000, // floor between two failed cold mints
    maxMintBackoffMs: 86_400_000, // longest Retry-After honored
    unavailableCooldownMs: 300_000, // after a 503 code 481
  },
  request: {
    maxRetryAfterMs: 2_000, // longest wait on a rate_limited reply
    defaultRetryAfterMs: 1_000, // the wait when the reply names none
    authFailuresBeforeBrake: 2, // fresh sessions refused in a row
    authBrakeMs: 60_000, // then stop minting this long
  },
  persistGrant: "memory", // or "sessionStorage"
  onShortStem: "withhold",
});
```

`session` and `request` are merged over `DEFAULT_SESSION_POLICY` and
`DEFAULT_REQUEST_POLICY`, which hold these defaults, so name only what you
change. `fetch` (a `FetchLike`, `globalThis.fetch` by default) sends the
autocomplete service requests, always with `credentials: "omit"`;
`defaultMint(url, { fetch })` takes its own for the mint. `now` (`Date.now` by
default) is the epoch-ms clock behind refreshes, cooldowns and the brake.

`persistGrant: "sessionStorage"` keeps the session across reloads of the
same tab, which saves a billable mint per reload, and costs a short-lived,
origin-bound credential in storage. It lives under `storageKey`
(`"bl.autocomplete.grant.v1"` by default, so give a second persisting client
on the page its own). A stored grant from another origin, or past its
expiry, is discarded; `reset()` removes it.

### Events

```ts
client.on("mint", e => console.log(e.reason, e.outcome.kind, e.durationMs));
client.on("request", e =>
  console.log(e.relation, e.q, e.status, e.roundTripMs),
);
client.on("stateChange", snapshot => console.log(snapshot.session.phase));
```

`getSnapshot()` is synchronous and referentially stable between changes, so
it plugs into `useSyncExternalStore` or any store. Its `usage` counts the
requests on the current session, in all (`requestsSinceMint`) and per route
(`requestsByRoute`), as the autocomplete service budgets them; each request
event carries its route's count as `requestsOnRoute`.

## React hooks

```tsx
import { useState } from "react";
import { formatFound } from "@baselayer-sdk/autocomplete";
import {
  AutocompleteClientProvider,
  useBusinessAutocomplete,
  useBusinessCombobox,
} from "@baselayer-sdk/autocomplete/react";

function Field() {
  const [value, setValue] = useState("");
  const state = useBusinessAutocomplete({ query: value, enabled: true });
  const combobox = useBusinessCombobox({
    id: "legal-name",
    items: state.suggestions,
    inputValue: value,
    onInputChange: setValue,
    onPick: item => setValue(item.label),
    hasFooter: state.isSearching || state.error !== null,
  });
  return (
    <div>
      <label {...combobox.getLabelProps()}>Legal name</label>
      <input {...combobox.getInputProps()} />
      <ul {...combobox.getMenuProps()} hidden={!combobox.menuVisible}>
        {combobox.hasRows &&
          state.suggestions.map((item, index) => (
            <li key={item.token} {...combobox.getItemProps({ item, index })}>
              {item.label}
            </li>
          ))}
      </ul>
      {combobox.menuVisible && (
        <div {...combobox.getFooterProps()}>
          {state.error ??
            (state.truncated
              ? "Partial results"
              : formatFound(state.found, state.foundCapped))}
        </div>
      )}
    </div>
  );
}

<AutocompleteClientProvider client={client}>
  <Field />
</AutocompleteClientProvider>;
```

`useBusinessAutocomplete` debounces (250 ms), waits for three characters,
cancels a superseded request, keeps the previous rows visible while the next
request is in flight, and brings the suggestions back on its own when a
cooldown ends. `unavailable: true` means the deployment cannot mint: render
your plain input until it clears.

Its options past `query` and `enabled`:

- `client`: else the provider's; with neither, the hook throws
- `filters` and `include`: as on the client, compared by what they say, so a
  fresh object on every render does not refire the request; an `include`
  member the session's scope does not grant is left out
- `limit` (`5`, `DEFAULT_LIMIT`, or the session's `maxLimit` when fewer):
  rows per keystroke, where a bare client call gets the autocomplete
  service's 10; a `limit` you give is sent as given
- `minChars` (`3`, `MIN_QUERY_CHARS`): characters of trimmed text before it
  asks
- `debounceMs` (`250`, `DEBOUNCE_MS`): the pause after each keystroke
- `messages`: the strings its `error` is drawn from (see
  [Every message](error-states.md#every-message))

Its state, besides `suggestions`, `isSearching` and `unavailable`:

- `found` and `foundCapped`: the count, and whether it is a floor
  (`formatFound` draws `N+`)
- `truncated`: the autocomplete service did not finish looking, so the rows may
  miss a match and `found: 0` is not evidence of absence
- `error`: what the footer says, or null
- `errorKind`: the failure's `AutocompleteErrorKind`, set even when `error`
  is null (a window backoff, an invalid query)
- `indexTag`, `roundTripMs` and `requestId`: the shown answer's, or null
- `filtersWithheld`: the filters were held back for a short stem
- `expanded`: the relations the shown rows were asked to expand, as the
  session's scope allowed then; list only these under a row, since one
  outside it comes back empty

`EMPTY_AUTOCOMPLETE_STATE` is the state before anything is asked.

`useEntityAutocomplete({ relation, query, ... })` is the same hook for any
route, typed by it. `requestFor(route, layout, list)` says what to ask for: the
relations listed under each row, in the order given (`DEFAULT_LIST` when left
out), and whatever the layout draws besides. `groupedLines(row, list,
enabledLines)` turns a row of any route into its head and a line per listed
item, each with what picking it hands, or null where it is disabled;
`enabledLines` is `DEFAULT_ENABLED_LINES`, businesses, when left out.
`groupedOptions(lines)` lists the enabled ones in the order they are drawn.
Each is a `GroupedOption`:

| `kind`     | What was picked                         | What to do with it                                 |
| ---------- | --------------------------------------- | -------------------------------------------------- |
| `row`      | a business row's own head, `row`        | pick it as any business row: its `token`           |
| `business` | a business under a person or an address | `businessPickFrom(row, business, Date.now())`      |
| `entity`   | a person or an address, a row or a line | `pick`, an `EntityPick` (`type`, `token`, `label`) |

```tsx
const layout = drawnLayout(PERSON_ROW, resolveLayout(PERSON_ROW));
const request = requestFor("people", layout, ["businesses"]);
const state = useEntityAutocomplete({
  relation: "people",
  query: value,
  enabled: true,
  include: request.include,
});
// List only what the rows were asked to expand, under the scope of the time.
const listed = request.list.filter(relation =>
  state.expanded.includes(relation),
);
const rows = state.suggestions.map(row =>
  groupedLines(row, listed, ["business", "person"]),
);
const options = rows.flatMap(groupedOptions).map(option => ({
  option,
  label:
    option.kind === "business"
      ? option.business.label
      : option.kind === "entity"
        ? option.pick.label
        : option.row.label,
}));
const combobox = useSuggestionCombobox({
  id: "person",
  items: options,
  inputValue: value,
  onInputChange: setValue,
  onPick: ({ option }) => {
    switch (option.kind) {
      case "business":
        onPick(businessPickFrom(option.row, option.business, Date.now()));
        break;
      case "entity":
        onPickEntity(option.pick);
        break;
      case "row":
        // Only a business search's rows have a head of this kind.
        break;
    }
  },
  hasFooter: state.isSearching || state.error !== null,
});
```

Draw each row as a `role="group"` labelled by its name, its lines inside, so
the arrow keys move from pick to pick and a screen reader hears whose they
are. A line that is not enabled is plain text, not an option. The hook
leaves out any relation the session's scope does not grant, and its
`expanded` says what the shown rows were asked to expand: list only those, as
above, and a grant that changes while they are on screen draws no empty list.

`useBusinessCombobox` is downshift's combobox with three decisions made: the
caret never jumps on a mid-word insert, a blur never commits the highlighted
row, and `aria-expanded` follows what is drawn. Keep the footer outside the
list, as above, so a screen reader hears a list of businesses and then a
note.

`useAutocompleteSession(client?)` follows the client's snapshot and
re-renders on every change. It returns `snapshot`, `unavailable` and
`unavailableUntil` (the 503 code 481 cooldown), and the client's `prewarm`
and `reset`.

`useAutocompleteClient(config)` creates a client for the component's life
and resets it on unmount. It re-creates the client, resetting the old one,
only when `baseUrl` or the identity of `mint` changes, and reads the rest of
`config` once. Keep `mint` stable, at module scope or in `useCallback`: an
inline `defaultMint(...)` is a new function on every render, and so a new
client that has to mint again.

## Readers

The row helpers the styled component uses are exported for your own rows:
`leadAddressOf`, `addressLineOf`, `officersOf`, `peopleLineOf`,
`orderedStates`, `matchedOn` (what a row matched besides its name: officers,
agents, addresses, states and the alias; see
[What matched](styling.md#what-matched)),
`structureLabel` (a structure's flag, `C-Corp` for `C_CORPORATION`),
`formatFound`, `queryTokens` and `partsFor` (the highlight parts to draw for
a name, whole-word or cut at the typed prefix), and for a person's or an
address's row `groupedLines`, `groupedOptions`, `businessPickFrom` and
`pickableBusinesses`. To lay your rows out in the styled component's places,
`drawnRowLayout(resolveRowLayout(layout))` is the field each place of a
business row's head draws, as the component has it, `ROW_LINES` groups the
places into each line's lead and trailing corner, and
`includeForLayout(layout)` says what to ask the autocomplete service to expand
for it (see [A row's places and fields](styling.md#5-a-rows-places-and-fields)).
For any kind of row, a business's with its lines, a person's or an
address's, `drawnLayout(kind, resolveLayout(kind, layout))` is the same, the
kind's `lines` are its corners and `requestFor` what to ask for (see
[Every kind of row](styling.md#every-kind-of-row)).
