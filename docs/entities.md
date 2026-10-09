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

| Route        | Filters                                                                                                                                                                                                                                                                    |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `businesses` | `state`, `domicileState`, `person.name`, `person.role`, `address.text`, `city`, `postalCode`, `state`                                                                                                                                                                      |
| `people`     | `business.state`: a role on a business in any of these states; `business.name`: a role on a business whose name fits; `address.text`: filed from an address that fits, or a role on a business whose own principal or mailing address it is (never its registered agent's) |
| `addresses`  | `state`: the address's own state; `person.name`: a person whose name fits filed from it; `business.name`: a business whose name fits filed there                                                                                                                           |

A name or an address is free text of at most 256 characters, and an empty one
filters nothing. Every filter waits for the grant's filter stem
(`onShortStem`).

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

The same props shape the rows of all three:

| Prop            | Default            | What it does                                                                                  |
| --------------- | ------------------ | --------------------------------------------------------------------------------------------- |
| `list`          | the route's own    | The relations listed under each row, a line per item ([What a row lists](#what-a-row-lists))  |
| `enabledLines`  | `["business"]`     | Which lines can be picked, by entity ([What can be picked](#what-can-be-picked))              |
| `onPickEntity`  | none               | Where a person or an address picked goes; required once `enabledLines` names one              |
| `showSelection` | `true`             | The line under the field after a pick ([The line under the field](#the-line-under-the-field)) |
| `iconSegments`  | the route's own    | The segments that carry an icon: names, addresses, people ([Icons](#icons))                   |
| `icons`         | the SDK's          | Your own icon per entity or entity and role, or `false` for none ([Icons](#icons))            |
| `layout`        | the row kind's own | What each line draws where ([Every kind of row](styling.md#every-kind-of-row))                |
| `include`       | what is drawn      | What the request fetches; name it only to fetch something else                                |

`include` is what the request fetches, by default what the rows list and
what the layout draws (`requestFor`); `list` is what is drawn. A relation the
session's scope does not grant is neither asked for nor drawn, and the search
still runs.

### What a row lists

Each item of a listed relation is a line under its row, the five the
autocomplete service sends, and the list ends in how many it leaves out
(`+2 more not shown`). The lines are drawn in `list`'s order, after the row's
own: `list={["addresses", "businesses"]}` on a person draws their addresses
before their businesses, and the keys move through them in that order.

| Search                 | It can list                                     | Listed by default (`DEFAULT_LIST`) |
| ---------------------- | ----------------------------------------------- | ---------------------------------- |
| `BusinessAutocomplete` | `people` (its officers and agents), `addresses` | nothing                            |
| `PersonAutocomplete`   | `businesses`, `addresses`                       | `businesses`                       |
| `AddressAutocomplete`  | `businesses`, `people`                          | `businesses`                       |

```text
Dana Whitfield  48 Wrenmoor St, Pittsburgh, PA … 2 businesses · 1 address
  HARBOR CONCRETE PUMPING CO., INC.  1200 Tallow… ..... [PA][OH]  officer
  NORTHSHORE PUMPING, LLC  300 Corvale Way, Erie… ........... [PA]  agent
  48 Wrenmoor St, Pittsburgh, PA 15206 ........................... officer
```

That is `list={["businesses", "addresses"]}` on a person: each business with
its address, states and the person's role there, then each address with
theirs. Every name starts with its icon.

### What can be picked

`enabledLines` names the entities whose lines are enabled, the lines a visitor
can pick: `business`, and `person` or `address`, whether the line is the row
itself or one it lists. A line is enabled only when its entity is named and the
autocomplete service sealed it a token; any other line is disabled: drawn,
faded, and an option a screen reader calls unavailable (`aria-disabled`),
which the keys pass over and a click does not pick. What a pick hands depends
on what it is:

| Picked                                  | Hands                                 |
| --------------------------------------- | ------------------------------------- |
| A business row (its head)               | `onPick(suggestion, pick)`, as always |
| A business under a person or an address | `onPick(pick)`, a `BusinessPick`      |
| A person or an address, a row or a line | `onPickEntity(pick)`, an `EntityPick` |

```ts
interface EntityPick {
  type: "person" | "address";
  /** Opaque: nothing redeems it yet, so keep it as the handle it is. */
  token: string;
  /** The name or the address, as its line drew it. */
  label: string;
}
```

The props are typed so that a person or an address, once enabled, has somewhere
to go: with `enabledLines={["business", "person"]}`, leaving out `onPickEntity`
is a type error. A row's head that is not a pick is disabled too, an option
still naming its group: by default a person's or an address's head, drawn faint
and in the regular weight rather than bold, above its businesses. On a business
search, a row whose business is not named in `enabledLines` is a group whose
head is disabled, though it lists nothing.

### The line under the field

A pick puts a name in the field, the row's own rather than what was typed.
Picked from a line under the row, a line under the field names what was
picked, and the field describes itself by it (`aria-describedby`), so a
screen reader hears it too. The row itself picked, the field already says
it, and no line is drawn:

| Picked                                               | The field takes       | The line under it names |
| ---------------------------------------------------- | --------------------- | ----------------------- |
| A business row                                       | the business's name   | nothing                 |
| An officer or an address under a business            | the business's name   | the officer or address  |
| A person's or an address's row itself                | the person or address | nothing                 |
| A business under a person or an address              | the person or address | the business            |
| An address under a person, a person under an address | the person or address | the one picked          |

The line stays while the field holds the name the pick put there, including
when your `onChange` sets it a render or more later. Any other edit lets the
pick go for good, and the line with it: the same name typed again later is
not the pick. With `showSelection={false}` the field still takes the name,
and you draw your own line from `onPick` or `onPickEntity`. On a business
search, put the field's own value in your business name field; on a person
or an address search, `pick.businessName`.

The views (`BusinessAutocompleteView`, `PersonAutocompleteView`,
`AddressAutocompleteView`) take the line to draw as `selection`, a
`GroupedSelection` (`{ type, label }`), or null for none.

### Icons

An icon rides on a segment: a name, or a field that has a glyph of its own,
an address or a business's people. It is drawn right before the segment's
text, wherever the layout places it. `iconSegments` names the segments that
carry one:

| Search                 | Segments an icon can ride on                                     | By default (`DEFAULT_ICON_SEGMENTS`)  |
| ---------------------- | ---------------------------------------------------------------- | ------------------------------------- |
| `BusinessAutocomplete` | `name`, `address`, `people`, `personName`, `addressName`         | none, so a row draws as it always has |
| `PersonAutocomplete`   | `name`, `firstAddress`, `businessName`, `address`, `addressName` | `name`, `businessName`, `addressName` |
| `AddressAutocomplete`  | `name`, `businessName`, `address`, `personName`                  | `name`, `businessName`, `personName`  |

`name` is the row's own name, `<line>Name` a listed line's, and the rest are
the fields of the same names. The glyph follows the data, by its role
wherever the row knows one, so the same officer or address draws the same
glyph in any segment:

| Entity     | Glyph                                                                                  |
| ---------- | -------------------------------------------------------------------------------------- |
| a business | an office building                                                                     |
| a person   | a person; an agent, a briefcase                                                        |
| an address | a map pin; a mailing address an envelope, an agent's a briefcase, an officer's a house |

`icons` replaces any of them with a node of your own, keyed by the entity
(`address`) or by the entity in a role (`address:mailing`), the role's
winning. `false` or `null` hides that one, and `icons={false}` hides them
all. An icon is decorative: it is drawn inside an `aria-hidden` wrapper, so
pass nothing focusable or meant to be read, no link or button:

```tsx
<BusinessAutocomplete
  iconSegments={["name", "address", "people"]}
  icons={{
    // A storefront for every business; an envelope of your own for mail.
    business: <StorefrontIcon aria-hidden />,
    "address:mailing": <MailIcon aria-hidden />,
    // No icon for a registered agent.
    "person:agent": false,
  }}
  …
/>
```

No icon is drawn on an address the business does not have ("No address on
file"). `IconSet` and `IconKey` are the types.

### A business row's lines

`BusinessAutocomplete` lists a business's officers and agents and its
addresses as a person's row lists businesses. Listing nothing, the default, a
business row is the one option it has always been. Listing lines, it is a
group whose head is that same row, picked as it always was:

```tsx
<BusinessAutocomplete
  list={["people", "addresses"]}
  enabledLines={["business", "person"]}
  onPick={(_, pick) => setBusinessToken(pick.businessToken)}
  // An officer picked: { type: "person", token, label }.
  onPickEntity={officer => setOfficer(officer)}
  …
/>
```

```text
HARBOR CONCRETE PUMPING CO., INC. [C-Corp] ..................... [PA][OH]
1200 Tallowmere Rd, Pittsburgh, PA 15212 ................ Dana Whitfield
  Dana Whitfield .................................................. officer
  Meridian Registered Agents, LLC ................................... agent
  +2 more not shown
  1200 Tallowmere Rd, Pittsburgh, PA 15212 ................ principal office
```

An officer picked here hands `onPickEntity` its `EntityPick`, puts the
business's name in the field and names the officer under it; the business
itself picked hands `onPick` its pick, as it always has. A line the
autocomplete service sealed no token for is drawn and disabled, whatever
`enabledLines` names. Each line's places and fields are under
[A business row's lines](styling.md#a-business-rows-lines).

### Without the styled components

`PersonAutocompleteView` and `AddressAutocompleteView` draw the same rows from
state you supply, and `BusinessAutocompleteView` takes `list`, `enabledLines`,
`icons`, `iconSegments`, `selection` and `onSelectEntity` for a business row's
lines. A view draws the `list` it is handed, so hand it only what the rows
expanded: `requestFor(...).list` filtered by the hook's `expanded`, the
relations the answer's `sources` mark `ok`. The autocomplete service answers a
relation it was not asked for, one the session's scope left out, as an empty
set marked `not_requested`, which would draw as an empty list.
`useEntityAutocomplete({ relation, query, ... })` is the hook for any route,
and `groupedLines` and `groupedOptions` turn a row into its lines and picks
(see [Headless use](headless.md)).
