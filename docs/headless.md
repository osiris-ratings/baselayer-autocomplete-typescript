# Headless use

The styled component is one layer. Under it are hooks that hold the state
and the accessibility wiring, and under those a client with no React at
all. Stop at whichever layer your design system wants.

## The client

```ts
import { createAutocompleteClient, defaultMint } from "@baselayer/autocomplete";

const client = createAutocompleteClient({
  baseUrl: "https://api.baselayer.com",
  mint: defaultMint("/api/ac-session"),
});

const controller = new AbortController();
const { response, roundTripMs, indexTag } = await client.suggest(
  { q: "osiris ra", limit: 5 },
  { signal: controller.signal },
);
response.suggestions.forEach(row => console.log(row.label, row.token));
```

Create one client per page, or per signed-in identity, and call `reset()`
on sign-out: it disowns a mint in flight and forgets the session and every
cooldown.

`suggest` recovers at most once per call: a missing, invalid or expired
session, a spent budget and a session refused for pivoting are re-minted
and replayed; a `rate_limited` reply waits out its `Retry-After` (at most
2 s) and replays. Anything else rejects with an `AutocompleteError` whose
`kind` says what happened (see [Error states](error-states.md)).

### Filters

```ts
await client.suggest({
  q: "howard concrete",
  filters: {
    state: ["PA", "OH"],
    person: { name: "frank", role: "officer" },
    address: { city: "Canonsburg" },
  },
});
```

The tier refuses filters until the name is long enough to be a name
someone is typing (the session's `filterMinStem`, 5 characters by default).
By default the client holds the filters back below that length and says so
with `filtersWithheld: true`, so a field narrows from the fifth character
without ever seeing a 422. `onShortStem: "send"` sends them anyway;
`"throw"` rejects locally.

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
    maxMintBackoffMs: 86_400_000, // longest Retry-After honoured
    unavailableCooldownMs: 300_000, // after a 503 code 481
  },
  request: {
    maxRetryAfterMs: 2_000, // longest wait on a rate_limited reply
    authFailuresBeforeBrake: 2, // fresh sessions refused in a row
    authBrakeMs: 60_000, // then stop minting this long
  },
  persistGrant: "memory", // or "sessionStorage"
  onShortStem: "withhold",
});
```

`persistGrant: "sessionStorage"` keeps the session across reloads of the
same tab, which saves a billable mint per reload, and costs a short-lived,
origin-bound credential in storage.

### Events

```ts
client.on("mint", e => console.log(e.reason, e.outcome.kind, e.durationMs));
client.on("request", e => console.log(e.q, e.status, e.roundTripMs));
client.on("stateChange", snapshot => console.log(snapshot.session.phase));
```

`getSnapshot()` is synchronous and referentially stable between changes, so
it plugs into `useSyncExternalStore` or any store.

## React hooks

```tsx
import {
  AutocompleteClientProvider,
  useBusinessAutocomplete,
  useBusinessCombobox,
} from "@baselayer/autocomplete/react";

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
          {state.error ?? `${state.found}`}
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

`useBusinessCombobox` is downshift's combobox with three decisions made: the
caret never jumps on a mid-word insert, a blur never commits the highlighted
row, and `aria-expanded` follows what is drawn. Keep the footer outside the
list, as above, so a screen reader hears a list of businesses and then a
note.

## Readers

The row helpers the styled component uses are exported for your own rows:
`leadAddressOf`, `officersOf`, `peopleLineOf`, `orderedStates`,
`formatFound`, `queryTokens` and `partsFor` (the highlight parts to draw for
a name, whole-word or cut at the typed prefix).
