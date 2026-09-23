# Error states

The SDK answers every refusal the API and the autocomplete tier can send,
so a typing user never hammers a refusing API and never sees a message
they cannot act on. Hosts read `state.errorKind` (from the hook) or
`error.kind` (from the client) when they want to do more.

"Silent" means the footer shows nothing and the rows stay; "step aside"
means `unavailable: true`: render your plain input until it clears.

## Minting a session

| Answer                                   | `kind`                | Shown                      | Then                          |
| ---------------------------------------- | --------------------- | -------------------------- | ----------------------------- |
| 201                                      |                       | rows                       | refreshed at 80 % of its life |
| a refresh fails, old session still valid |                       | rows                       | retried after 5 s             |
| 401, 402, 403, 422                       | `mint_refused`        | "Autocomplete unavailable" | 10 s floor                    |
| 429, ten-minute window                   | `mint_backoff`        | silent                     | until `Retry-After`           |
| 429, day                                 | `mint_backoff`        | the day-limit message      | until `Retry-After`           |
| 503, code 481                            | `session_unavailable` | step aside                 | 5 minutes                     |
| another 5xx, the network                 | `mint_refused`        | "Autocomplete unavailable" | 10 s floor                    |

A refusal that is not a 429 is shown once; keystrokes inside the floor
after it are answered `mint_backoff` and are silent. A 403 with code 37
means autocomplete is not enabled for your organization.

## Asking the tier

| Answer                          | Recovery                                 | Shown                               |
| ------------------------------- | ---------------------------------------- | ----------------------------------- |
| 200                             |                                          | rows                                |
| 401, codes 27, 28, 29           | re-mint once, replay                     | nothing                             |
| 429, code 480 (budget spent)    | re-mint once, replay                     | nothing                             |
| 429, code 482 (too many pivots) | re-mint once, replay                     | nothing                             |
| 429, `rate_limited`             | wait `Retry-After` (at most 2 s), replay | nothing                             |
| 422                             | none                                     | the validation message              |
| 503                             | none                                     | the tier's message                  |
| 500, 504                        | none                                     | "Autocomplete unavailable (HTTP n)" |
| a body that is not the contract | none                                     | "Autocomplete unavailable"          |

Each keystroke recovers at most once. When a freshly minted session is
refused again on two keystrokes in a row, the client stops minting for 60 s
(`kind: "auth_braked"`), so a disagreement between the API and the tier does
not become a mint per keystroke. A refusal with
`metadata.detail: "origin_mismatch"` means your backend did not forward the
page's `Origin` (see [the mint endpoint](mint-endpoint.md)).

## Before any request

| Condition                                                | Result                       |
| -------------------------------------------------------- | ---------------------------- |
| fewer than 3 characters                                  | nothing asked, empty state   |
| `q` outside 2 to 256 characters, `limit` outside 1 to 20 | `query_invalid`              |
| filters on a name shorter than the session's stem        | filters held back            |
| a newer keystroke                                        | the older request is aborted |

## Submitting the pick

Your search can refuse the `business_token`: 422 with code 3040 (not
Baselayer's, or another organization's), 3042 (expired, after 15 minutes),
3023 (the business is gone), 3043 (sandbox application), or 503 code 3041.
In every one of those cases drop the token and submit the name as typed.
`refusedThePin(status, code)` is true exactly then.

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
