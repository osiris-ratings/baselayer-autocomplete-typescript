# Entities beyond businesses

Autocomplete grows by entity. Each entity type has its own route, its own
row, and its own set of related entities; every route answers the same
envelope and the same base row. Businesses is served today. People,
addresses and liens are the ones to come, and the SDK already carries their
shapes, so a route going live does not change the shape of your code.

| Route                      | Row type             | Relations it expands          | Default `include`  | Served  |
| -------------------------- | -------------------- | ----------------------------- | ------------------ | ------- |
| `/autocomplete/businesses` | `BusinessSuggestion` | people, addresses, liens      | people, addresses  | yes     |
| `/autocomplete/people`     | `PersonSuggestion`   | businesses, addresses, liens  | businesses         | not yet |
| `/autocomplete/addresses`  | `AddressSuggestion`  | businesses, people            | businesses         | not yet |
| `/autocomplete/liens`      | `LienSuggestion`     | businesses, people, addresses | businesses, people | not yet |

The table is `ROUTES` in the core, with each route's default `include`. The
shapes of the routes not served yet are Baselayer's working specification
and may still move; businesses is the shipped contract.

## Asking any route

`suggest` is the businesses route. `search` takes the route:

```ts
import { createAutocompleteClient, defaultMint } from "@baselayer/autocomplete";

const client = createAutocompleteClient({
  baseUrl: "https://api.baselayer.com",
  mint: defaultMint("/api/ac-session"),
});

// The same as client.suggest({ q: "harbor concrete" }).
const businesses = await client.search("businesses", { q: "harbor concrete" });

// Typed by route: the filters it takes, the relations it expands, its rows.
const people = await client.search("people", {
  q: "dana whitfield",
  include: ["businesses"],
  filters: { business: { state: ["PA"] }, address: { city: "Pittsburgh" } },
});
people.response.suggestions[0]?.related.businesses.count;
```

One session serves every route; the tier counts its budget per route. Every
recovery, cooldown and event works the same on each, and each
`RequestEvent` names its `relation`.

## Rows

Every row has `type`, `token`, `label`, `matched_name`, `match`, `related`
and `highlight`. Each type adds its own fields:

| Type       | Adds                                                           |
| ---------- | -------------------------------------------------------------- |
| `business` | `domicile_state`, `states`                                     |
| `person`   | nothing: a person has no jurisdiction of its own               |
| `address`  | `components`: `line1`, `line2`, `city`, `state`, `postal_code` |
| `lien`     | `filing_type`, `filing_number`, `filing_state`, `status`       |

`related` and `sources` carry one key per relation the route expands. Read
`sources` before an empty `related` entry: an empty list under a source that
is not `ok` means "not looked", never "none".

Unknown fields are dropped and unknown enum values (`match`, `status`,
`role`, a source's status) are kept as the strings they are, so a tier that
learns a new value never turns a keystroke into a contract error. A row of
the wrong type on a route is one.

## Filters

Each route takes its own filters, typed by `FiltersByRelation`. A filter on
a related entity is written as that relation, singular, with its field:
`{ person: { name: "tim" } }` sends `person.name=tim`. Comma lists are
arrays. The businesses route takes exactly what the tier serves today:
`state`, `domicileState`, `person.name`, `person.role`, and `address.text`,
`city`, `postalCode`, `state`.

## React

`useEntityAutocomplete({ relation, query, ... })` is the hook for any route;
`useBusinessAutocomplete` is its businesses form. `useSuggestionCombobox`
wires any route's rows to an input. The styled `BusinessAutocomplete` draws
business rows; until a styled component exists for another route, draw its
rows yourself with the hooks (see [Headless use](headless.md)).
