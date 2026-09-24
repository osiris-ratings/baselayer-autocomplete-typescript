# Error states

The SDK answers every refusal the API and the autocomplete tier can send,
so a typing user never hammers a refusing API and never sees a message
they cannot act on. Hosts read `state.errorKind` (from the hook) or
`error.kind` (from the client) when they want to do more.

"Silent" means the footer shows nothing and the rows are cleared, so the
menu closes until the wait ends; "step aside" means `unavailable: true`:
render your plain input until it clears.

## Minting a session

| Answer                                                      | `kind`                | Shown                      | Then                          |
| ----------------------------------------------------------- | --------------------- | -------------------------- | ----------------------------- |
| 201                                                         |                       | rows                       | refreshed at 80 % of its life |
| a refresh fails (not 503 code 481), old session still valid |                       | rows                       | retried after 5 s             |
| 401, 402, 403, 422                                          | `mint_refused`        | "Autocomplete unavailable" | 10 s floor                    |
| 429, ten-minute window                                      | `mint_backoff`        | silent                     | `Retry-After`, else 10 s      |
| 429, day                                                    | `mint_backoff`        | the day-limit message      | `Retry-After`, else 10 s      |
| 503, code 481                                               | `session_unavailable` | step aside                 | 5 minutes                     |
| another 5xx, the network                                    | `mint_refused`        | "Autocomplete unavailable" | 10 s floor                    |
| a 2xx that is not a session                                 | `mint_refused`        | "Autocomplete unavailable" | 10 s floor                    |

A refusal's `Retry-After`, when it has one, replaces the 10 s floor, and is
honored for at most 24 hours; 503 code 481 keeps its 5 minutes.

A refusal that is not a 429 is shown once, to the request that waited on
it; keystrokes inside the floor after it are answered `mint_backoff` and
are silent. A prewarm's refusal reaches the field only when a request is
already waiting on that mint. Otherwise it is not shown: the field stays
silent until the floor has passed and the next mint is refused. The
component prewarms on focus by default (`mintOn: "focus"`), or on the first
character with `"keystroke"`; with `"request"` the first request's mint is
the one refused, and it is shown. A 403 with code 37 means autocomplete is
not enabled for your organization.

## Asking the tier

| Answer                               | Recovery                                 | Shown                               |
| ------------------------------------ | ---------------------------------------- | ----------------------------------- |
| 200                                  |                                          | rows                                |
| 401, codes 27, 28, 29                | re-mint once, replay                     | nothing                             |
| 429, code 480 (budget spent)         | re-mint once, replay                     | nothing                             |
| 429, code 482 (too many pivots)      | re-mint once, replay                     | nothing                             |
| 429, `rate_limited`                  | wait `Retry-After` (at most 2 s), replay | nothing                             |
| 422                                  | none                                     | the validation message              |
| 503                                  | none                                     | the tier's message                  |
| 500, 504                             | none                                     | "Autocomplete unavailable (HTTP n)" |
| the network                          | none                                     | "Autocomplete unavailable"          |
| a 2xx whose body is not the contract | none                                     | "Autocomplete unavailable"          |

Every answer with no recovery rejects with `kind: "request_failed"`, except
a 2xx whose body is not the contract, which rejects with `kind: "contract"`.
A `request_failed` carries the answer's `status` (0 for the network),
`code`, `reason`, `userMessage` and `retryAfterMs`. The footer shows
`userMessage` when the answer had one, else `httpFallback(status)`, and
"Autocomplete unavailable" for the network. A replay that is refused again
ends the same way; a re-mint that fails ends as the mint table says.

Each keystroke recovers at most once. When a freshly minted session is
refused again on two keystrokes in a row, the client rejects every search
with `kind: "auth_braked"` for 60 s, asking neither the mint nor the tier,
and the footer shows `authUnavailable`. So a disagreement between the API
and the tier does not become a mint per keystroke. Nothing brings the
suggestions back on its own: the first keystroke after the 60 s asks again.
A refusal with `metadata.detail: "origin_mismatch"` means your backend did
not forward the page's `Origin` (see [the mint endpoint](mint-endpoint.md)).

## Before any request

| Condition                                                     | Result                                 |
| ------------------------------------------------------------- | -------------------------------------- |
| fewer than 3 characters                                       | nothing asked, empty state             |
| `q` under 2 characters once trimmed and stripped of `% _ * ?` | `query_invalid`, nothing sent or shown |
| `q` over 256 characters once trimmed                          | `query_invalid`, nothing sent or shown |
| `limit` not an integer from 1 to 20                           | `query_invalid`, nothing sent or shown |
| filters on a name shorter than the session's stem             | filters held back                      |
| a newer keystroke                                             | the older request is aborted           |

The bounds are exported as `MIN_Q_CHARS`, `MAX_Q_CHARS` and `MAX_LIMIT`.
Characters are counted as code points, and the floor also drops any
character that folds to `% _ * ?` under NFKC, so `a%%` passes the
3-character floor and is still `query_invalid`.

## Submitting the pick

Your search can refuse the `business_token`: 422 with code 3040 (not
Baselayer's, or another organization's), 3042 (expired, after 15 minutes),
3023 (the business is gone), 3043 (sandbox application), or 503 code 3041.
In every one of those cases drop the token and submit the name as typed.
`refusedThePin(status, code)` is true for all of them, as for any other
status under 500, and false for any other 5xx and a network failure.

## Reading the error

The client rejects with one class, `AutocompleteError`. Test for it with
`isAutocompleteError(error)`, which also recognizes an error thrown by a
second bundled copy of the core. Beside `kind` and `message` it carries:

| Field          | Holds                                                                                                                  |
| -------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `status`       | the HTTP status; 0 for a network failure                                                                               |
| `code`         | the catalog code from the answer's envelope                                                                            |
| `reason`       | the tier's `metadata.reason`; on `auth_braked`, the client's `"auth_unavailable"`                                      |
| `until`        | epoch ms at which a cooldown, a mint's floor or the brake ends                                                         |
| `scope`        | on a mint's 429, the pool that refused: `"window"` or `"day"` (`MintScope`)                                            |
| `retryAfterMs` | ms until the next mint may be tried (`mint_backoff`, `mint_refused`), or the answer's `Retry-After` (`request_failed`) |
| `userMessage`  | the answer's own message, or its validation message                                                                    |

A field that does not apply is `null`.

## Every message

All of them are overridable through `messages`:

| Key                    | Default                                                                       |
| ---------------------- | ----------------------------------------------------------------------------- |
| `searching`            | Searching…                                                                    |
| `truncatedNoRows`      | Still searching — add a word to narrow it down                                |
| `truncatedRows`        | Showing partial results — add a word to narrow it down                        |
| `match`, `matches`     | match, matches                                                                |
| `noAddress`            | No address on file                                                            |
| `agentSuffix`          | a space, then `· agent`                                                       |
| `more(n)`              | `+n`                                                                          |
| `dayLimit`             | Your plan's daily autocomplete limit is reached; suggestions return tomorrow. |
| `unavailable`          | Autocomplete unavailable                                                      |
| `authUnavailable`      | Autocomplete unavailable: the session could not be verified                   |
| `httpFallback(status)` | Autocomplete unavailable (HTTP status)                                        |
