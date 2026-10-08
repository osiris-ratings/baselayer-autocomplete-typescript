# The mint endpoint

The browser needs a session to query autocomplete, and a session is minted
with your API key. Your key must never reach a browser, so your backend
mints on the page's behalf with one small endpoint.

## The three rules

1. **Forward the page's `Origin`.** Baselayer binds the session to the
   `Origin` it receives, and the autocomplete service then refuses that session
   from any other page. A mint without an `Origin` produces an unbound
   session that works from anywhere. Never do that for a browser.
2. **Pass the answer through unchanged.** Return Baselayer's status, JSON
   body and `Retry-After` header as they are. The SDK reads all three to
   decide whether to wait silently, tell the user, or step aside; a backend
   that turns a 429 into a 500 breaks that.
3. **Never forward cookies, and never log the key.**

Put the endpoint behind your own authentication. Every session it mints
counts against your organization's session pool, per ten minutes and per
day, shared by every user and key in the organization.

## The request your backend makes

```bash
curl -s -X POST https://api.baselayer.com/autocomplete/sessions \
  -H "X-API-Key: $BASELAYER_API_KEY" \
  -H "Origin: https://app.example.com"
```

```json
{
  "session_token": "eyJhbGciOiJFZERTQSIsInR5cCI6ImFjczEi…",
  "expires_in": 180,
  "expires_at": "2026-09-23T12:03:00Z",
  "request_budget": 30,
  "pivot_allowance": 5,
  "filter_min_stem": 5,
  "scope": {
    "routes": { "businesses": ["addresses", "people"] },
    "max_limit": 20
  }
}
```

| Answer              | Meaning                                                  |
| ------------------- | -------------------------------------------------------- |
| 201                 | a session                                                |
| 401, codes 20 to 24 | the key is not recognized                                |
| 402, code 3004      | the organization is locked                               |
| 403, code 30        | the key lacks the `autocomplete.read` permission         |
| 403, code 37        | autocomplete is not enabled for the organization         |
| 403, code 501       | `scope` names a route the organization may not search    |
| 403, code 502       | `scope` names a relation it may not reach on a route     |
| 422                 | the body is malformed, `scope` included                  |
| 429, code 429       | a session pool is spent; `Retry-After` says for how long |
| 503, code 481       | the deployment cannot mint sessions right now            |

A 429's `metadata.scope` names the pool:
`autocomplete_session_mint:organization` is the ten-minute window,
`autocomplete_session_mint_day:organization` the rolling day. A sandbox
application's key mints a session served from the sandbox index; until a
deployment has that index available, the session's searches are answered
503, not ready, as when no index is served.

## Narrowing a session

A session may search everything your organization may, unless the mint asks
for less. The body's optional `scope` names the routes it may query and,
per route, the relations a request may include or filter by, and the most
suggestions a request may ask for. A session that leaks from the page can
then do no more than that, and the page offers only what it allows.

```bash
curl -s -X POST https://api.baselayer.com/autocomplete/sessions \
  -H "X-API-Key: $BASELAYER_API_KEY" \
  -H "Origin: https://app.example.com" \
  -H "Content-Type: application/json" \
  -d '{"scope": {"routes": {"businesses": ["addresses"]}, "max_limit": 5}}'
```

A scope narrows and never widens. Either half left out narrows nothing on
that side, and no body at all reaches everything. The answer's `scope` is
what the session may do; the browser SDK reads it and offers nothing else.
Each route's relations are the ones its rows carry:

| Route        | Relations                 |
| ------------ | ------------------------- |
| `businesses` | `people`, `addresses`     |
| `people`     | `businesses`, `addresses` |
| `addresses`  | `businesses`, `people`    |

A person or an address search leads to businesses, so give `people` and
`addresses` the `businesses` relation, or the page cannot offer them.

## Node: `@baselayer-sdk/autocomplete/server`

`createMintHandler` returns a fetch-style handler,
`(request: Request) => Promise<Response>`. It refuses a request with no
`Origin` (400), from an origin outside `allowedOrigins` (403, before calling
Baselayer), or with a method other than POST (405). Its options:

| Option           | Value                                                                          |
| ---------------- | ------------------------------------------------------------------------------ |
| `apiKey`         | your API key; required                                                         |
| `apiBaseUrl`     | defaults to `DEFAULT_API_BASE_URL`, `https://api.baselayer.com`                |
| `fetch`          | defaults to `globalThis.fetch`                                                 |
| `allowedOrigins` | a list, or a function handed the raw `Origin`                                  |
| `scope`          | a scope for every mint, or a function of the request that answers one, or none |

Without `allowedOrigins`, every origin may mint. A list's entries and the
incoming `Origin` are compared trimmed, without a trailing slash and
lower-cased. The handler forwards `request.signal`, passes `Retry-After`
and `X-Request-ID` back, and marks every answer `Cache-Control: no-store`.

Next.js App Router:

```ts
// app/api/ac-session/route.ts
import { createMintHandler } from "@baselayer-sdk/autocomplete/server";

export const POST = createMintHandler({
  apiKey: process.env.BASELAYER_API_KEY!,
  allowedOrigins: ["https://app.example.com"],
  // Optional: what each session may search.
  scope: {
    routes: { businesses: ["addresses", "people"], people: ["businesses"] },
    maxLimit: 10,
  },
});
```

`scope` is `{ routes, maxLimit }`, typed so a route takes only the relations
its rows carry. A function of the request answers a scope per caller (the
signed-in user's plan, say), or none to mint without one.

Bun (`Bun.serve({ fetch: handler })`), Deno (`Deno.serve(handler)`) and a
Cloudflare Worker (`export default { fetch: handler }`) take the same
handler as it is. Hono takes it through
`app.mount("/api/ac-session", handler)` or as `c => handler(c.req.raw)`, and
a Remix action is `({ request }) => handler(request)`.

Express, with `mintForOrigin`, which returns `{ status, headers, body }`:

```ts
import { mintForOrigin } from "@baselayer-sdk/autocomplete/server";

app.post("/api/ac-session", requireLogin, async (req, res) => {
  const origin = req.get("Origin");
  if (!origin || !ALLOWED.has(origin)) {
    return res.status(403).end();
  }
  const out = await mintForOrigin({
    apiKey: process.env.BASELAYER_API_KEY!,
    origin,
  });
  res.status(out.status).set(out.headers).json(out.body);
});
```

`mintForOrigin` also takes `apiBaseUrl`, `fetch`, `signal` and `scope`,
with the handler's defaults, and POSTs to `SESSIONS_PATH`,
`/autocomplete/sessions`, under `apiBaseUrl`, with the scope as its JSON body
when there is one and no body when there is not. It throws on an empty
`apiKey`, on an empty `origin` rather than mint an unbound session, and on a
scope that names no route or asks for a `maxLimit` outside 1 to 20, which the
API would refuse. `headers` holds
`Content-Type: application/json`, plus `Retry-After` and `X-Request-ID` when
the API sent them; `body` is the API's JSON, or null when it sent no JSON.
`toResponse(out)` turns the result into a WHATWG `Response` marked
`Cache-Control: no-store`, for a fetch-style route that does its own origin
check.

## Other backends

Make the curl request above from your server with the incoming request's
`Origin` header, and a `scope` body if you narrow the session, and write
Baselayer's status, body and `Retry-After` back.
In Python:

```python
@app.post("/api/ac-session")
async def ac_session(request: Request) -> Response:
    origin = request.headers.get("origin")
    if origin not in ALLOWED_ORIGINS:
        return Response(status_code=403)
    async with httpx.AsyncClient() as client:
        r = await client.post(
            "https://api.baselayer.com/autocomplete/sessions",
            headers={"X-API-Key": settings.baselayer_api_key, "Origin": origin},
        )
    headers = {k: v for k, v in r.headers.items() if k.lower() == "retry-after"}
    return Response(r.content, status_code=r.status_code, headers=headers,
                    media_type="application/json")
```

## Pointing the SDK at it

```tsx
<BusinessAutocomplete baseUrl="https://api.baselayer.com"
                      mintUrl="/api/ac-session" … />
```

`mintUrl` is fetched with `credentials: "same-origin"`, so your session
cookie reaches your endpoint. For a CSRF token or a bearer, build the mint
yourself:

```ts
import { defaultMint } from "@baselayer-sdk/autocomplete";

const mint = defaultMint("/api/ac-session", {
  headers: () => ({ "X-CSRF-Token": readCsrfToken() }),
});
```

Give it to the component as `mint`, with `baseUrl`, in place of `mintUrl`
(or to `createAutocompleteClient`, as in [Headless use](headless.md)). The
component keeps the first `mint` it is given, so build it once, outside
render. `headers` is called before every mint, so a rotating token stays
current; `credentials` replaces `"same-origin"`, and `fetch` replaces
`globalThis.fetch`.
