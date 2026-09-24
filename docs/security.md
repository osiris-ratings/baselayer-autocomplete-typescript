# Security

## What the browser holds

A **session**: a signed token, minted by Baselayer for your organization,
that the autocomplete tier accepts in the `X-Autocomplete-Session` header.

- It expires in minutes (180 s by default) and carries its own request
  budget and pivot allowance, so a session copied out of a page is worth one
  person's typing, not a scan of the registry.
- It is bound to the `Origin` your backend forwarded when it was minted. The
  tier refuses it from any other page, and refuses it when a request carries
  no `Origin` at all.
- It is sent with `credentials: "omit"`: no cookie ever travels to the tier.
- By default it lives in memory, one per tab. `persistGrant:
"sessionStorage"` keeps it across reloads of the same tab, never across
  tabs or origins.

## What never leaves your backend

Your **API key**. The SDK has no way to take one in the browser; the key is
only ever read by `@baselayer-sdk/autocomplete/server`, or by your own mint
endpoint, on your server. It is sent to Baselayer and nowhere else, and the
server helper never logs it.

## What your endpoint has to do

Authenticate the caller the way the rest of your API does, forward the
page's `Origin`, and pass the answer through. `createMintHandler` refuses
requests with no `Origin`, and, with `allowedOrigins`, requests from pages
that are not yours, before it spends a mint. Every mint counts against your
organization's session pool.

## What the pick carries

`business_token` is sealed by Baselayer for your organization. It reveals
no identifier, is refused for any other organization, and expires after 15
minutes.

## Reporting a vulnerability

Email <support@baselayer.com> with "Security" in the subject. Please do not
open a public issue.
