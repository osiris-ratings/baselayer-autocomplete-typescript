# Businesses, people and addresses

Autocomplete finds a company three ways: by its name, by a person who holds
a role on it, or by an address it is filed at. Each is its own route, with
its own row and its own related entities, and every route answers the same
envelope and the same base row. Whichever route a row comes from, a pick is a
business: the token a search redeems.

| Route                      | Row type             | Relations it expands  | Default `include` |
| -------------------------- | -------------------- | --------------------- | ----------------- |
| `/autocomplete/businesses` | `BusinessSuggestion` | people, addresses     | people, addresses |
| `/autocomplete/people`     | `PersonSuggestion`   | businesses, addresses | businesses        |
| `/autocomplete/addresses`  | `AddressSuggestion`  | businesses, people    | businesses        |

The table is `ROUTES` in the core. `ROUTE_NAMES`, `RELATIONS` and
`LEGAL_RELATIONS` (which relations each route's rows carry) are the session
scope's names, and the SDK's tests pin them to the API's own.

## What a session may search

Every session has a scope: the routes it may query, the relations a request
on each may include or filter by, and the most rows a request may ask for.
The mint answers it with the grant (`grant.scope`), and the autocomplete
service refuses anything outside it, so the SDK never sends what the scope
leaves out. Your backend can narrow it when it mints, so that a session
leaked from the page can do no more than you need
([the mint endpoint](mint-endpoint.md#narrowing-a-session)).

```ts
const { scope } = await client.getSession();
// { routes: { businesses: ["addresses", "people"], people: [...] }, maxLimit: 20 }

offeredRoutes(scope); // ["businesses", "people"]: the searches to offer
allowedFilters(scope, "businesses"); // the filter parameters a request may send
```

`offeredRoutes` lists businesses, and people or addresses only where the
scope grants their businesses, since a pick from either row is one of them.
Offer a search only where it is listed. A grant from an API that answers no
scope reads as `DEFAULT_SESSION_SCOPE`: businesses with people and
addresses, and 20 rows.

What the client does with a request the scope leaves out:

| The request asks for            | What happens                                                 |
| ------------------------------- | ------------------------------------------------------------ |
| A route outside the scope       | `out_of_scope` before it is sent; nothing is counted         |
| An `include` member outside it  | `out_of_scope` before it is sent                             |
| A filter on a relation outside  | `out_of_scope` before it is sent                             |
| A `limit` past `scope.maxLimit` | `query_invalid` before it is sent                            |
| No `limit`                      | Left to the autocomplete service: 10, or the most if fewer   |
| Anything the service still 403s | `out_of_scope` (code 501 or 502), never retried or re-minted |

The hooks and components stay inside the scope on their own: they leave out
an `include` member it does not grant, and ask for 5 rows or the most if
fewer.

## Asking any route

`suggest` is the businesses route. `search` takes the route:

```ts
import {
  createAutocompleteClient,
  defaultMint,
} from "@baselayer-sdk/autocomplete";

const client = createAutocompleteClient({
  baseUrl: "https://api.baselayer.com",
  mint: defaultMint("/api/ac-session"),
});

// The same as client.suggest({ q: "harbor concrete" }).
const businesses = await client.search("businesses", { q: "harbor concrete" });

// Typed by route: the filters it takes, the relations it expands, its rows.
const people = await client.search("people", {
  q: "dana whitfield",
  filters: { business: { state: ["PA"] } },
});
people.response.suggestions[0]?.related.businesses.count;
```

One session serves every route; the autocomplete service counts its budget
per route, and so does the client (`usage.requestsByRoute`). Every recovery,
cooldown and event works the same on each, and each `RequestEvent` names its
`relation`.

## Rows

Every row has `type`, `token`, `label`, `matched_name`, `match`, `related`
and `highlight`. Each type adds its own fields:

| Type       | Adds                                                                                                        |
| ---------- | ----------------------------------------------------------------------------------------------------------- |
| `business` | `domicile_state`, `states`, `structure`                                                                     |
| `person`   | nothing: a person has no jurisdiction of its own                                                            |
| `address`  | `components`: `line1`, `line2`, `city`, `state`, `postal_code`, each null where the filing did not carry it |

`related` and `sources` carry one key per relation the route expands. Read
`sources` before an empty `related` entry: an empty list under a source that
is not `ok` means "not looked", never "none". `count` is every one there is,
before the head of five: a person's `related.businesses.count` is how many
businesses they hold a role on, an address's how many are filed at it.

Each related entity says whether it is why the row is here (`matched`), and
the set says how many were (`matched`, null when no filter applied): the
officers and addresses a person or an address filter matched lead the lists.
`matchedOn` reads those flags, with `matched_name` and the state filter, into
what a row matched on (see [Styling](styling.md#what-matched)).

A related item's `role` is how it stands to the row. A business's people and
a person's businesses: `officer` or `agent`. An address and a business: the
role the business filed it under (`principal`, `mailing`, `agent`,
`officer`). A business's `structure` is its legal structure, one of
`BUSINESS_STRUCTURES` (`LLC`, `C_CORPORATION`, …), or null when it is not
known.

A business under a person or an address carries what its own row leads
with: `address`, its lead address (on an address row, still the business's
own, which need not be the row's), `states`, sorted by code, and
`domicile_state`. `orderedStates(item)` puts the domicile first, as a
business row draws them. On a person or an address item all three are null.

The person's and the address's own `token` is redeemed nowhere: pick one of
their businesses instead. Each of those carries a business token, sealed with
the person or address it was reached through, which `POST /searches` redeems
as any other.

Every closed value (`match`, `type`, `role`, `structure`, a source's
`status`) is a typed union pinned to the API's contract, and the parser
refuses a value it does not know as a `contract` error. The SDK learns a new
value before the API sends it, so update the SDK when its release notes say
so. A related item must be the entity its relation holds, a business under
`businesses`, and unknown fields are dropped.

## Filters

Each route takes its own filters, typed by `FiltersByRelation`, and exactly
the ones the autocomplete service serves. A filter on a related entity is
written as that relation, singular, with its field: `{ person: { name:
"tim" } }` sends `person.name=tim`. Comma lists are arrays.

| Route        | Filters                                                                                               |
| ------------ | ----------------------------------------------------------------------------------------------------- |
| `businesses` | `state`, `domicileState`, `person.name`, `person.role`, `address.text`, `city`, `postalCode`, `state` |
| `people`     | `business.state`: people who hold a role on a business in any of these states                         |
| `addresses`  | `state`: the address's own state                                                                      |

`FILTER_PARAMS` lists them per route, each with the relation it narrows by,
which the session's scope must grant (null for a direct filter such as the
businesses route's `state`).

## React

`BusinessAutocomplete`, `PersonAutocomplete` and `AddressAutocomplete` are
the styled components, one per route. A person or an address shows in the
menu as a group: its name with its counts, and a line for each business
under it, with the business's address, its states and the role there.

```tsx
<PersonAutocomplete
  mintUrl="/api/ac-session"
  baseUrl="https://api.baselayer.com"
  id="person"
  label="Person's name"
  value={typed}
  onChange={setTyped}
  onPick={pick => {
    // A business, the same token a business row's pick spends.
    setBusinessName(pick.businessName);
    setBusinessToken(pick.businessToken);
    // How it was reached: pick.through.person, or pick.through.address.
  }}
/>
```

Three props shape the rows:

| Prop       | Default          | What it does                                                                                                      |
| ---------- | ---------------- | ----------------------------------------------------------------------------------------------------------------- |
| `include`  | `["businesses"]` | The relations listed under each row: a person's `addresses`, an address's `people`, a line per item               |
| `pickable` | `["business"]`   | Which lines can be picked: `business`, and `person` or `address`, the row itself or one it lists                  |
| `layout`   | `PERSON_ROW`'s   | What each line draws where ([Person and address rows](styling.md#person-and-address-rows)), asked for as it draws |

A business picked hands `onPick` a `BusinessPick`. A person or an address
picked hands `onPickEntity` an `EntityPick` (`type`, `token`, `label`), which
the component requires once `pickable` names one; nothing redeems its token
yet. Any other line is drawn but not pickable. A relation the session's
scope does not grant is neither asked for nor drawn, and the search still
runs.

A pick leaves the field as it was typed; put `pick.businessName` in your
business name field. `PersonAutocompleteView` and `AddressAutocompleteView`
draw the same rows from state you supply, and `useEntityAutocomplete({
relation, query, ... })` is the hook for any route (see
[Headless use](headless.md)).
