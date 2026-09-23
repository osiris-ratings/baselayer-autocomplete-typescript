# The mint endpoint

The browser needs a session to query autocomplete, and a session is minted
with your API key. Your key must never reach a browser, so your backend
mints on the page's behalf with one small endpoint.

## The three rules

1. **Forward the page's `Origin`.** Baselayer binds the session to the
   `Origin` it receives, and the autocomplete tier then refuses that session
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
  "request_budget": 30,
  "pivot_allowance": 5,
  "filter_min_stem": 5
}
```

| Answer              | Meaning                                                  |
| ------------------- | -------------------------------------------------------- |
| 201                 | a session                                                |
| 401, codes 20 to 24 | the key is not recognized                                |
| 402, code 3004      | the organization is locked                               |
| 403, code 30        | the key lacks the `autocomplete.read` permission         |
| 403, code 37        | autocomplete is not enabled for the organization         |
| 422, code 483       | the key belongs to a sandbox application                 |
| 429, code 429       | a session pool is spent; `Retry-After` says for how long |
| 503, code 481       | the deployment cannot mint sessions right now            |

A 429's `metadata.scope` names the pool:
`autocomplete_session_mint:organization` is the ten-minute window,
`autocomplete_session_mint_day:organization` the rolling day.

## Node: `@baselayer/autocomplete/server`

`createMintHandler` returns a fetch-style handler,
`(request: Request) => Promise<Response>`. It refuses a request with no
`Origin` (400), from an origin outside `allowedOrigins` (403, before calling
Baselayer), or with a method other than POST (405).

Next.js App Router:

```ts
// app/api/ac-session/route.ts
import { createMintHandler } from "@baselayer/autocomplete/server";

export const POST = createMintHandler({
  apiKey: process.env.BASELAYER_API_KEY!,
  allowedOrigins: ["https://app.example.com"],
});
```

Hono, Remix, a Cloudflare Worker, Bun and Deno take the same handler.

Express, with `mintForOrigin`, which returns `{ status, headers, body }`:

```ts
import { mintForOrigin } from "@baselayer/autocomplete/server";

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

## Other backends

Make the curl request above from your server with the incoming request's
`Origin` header, and write Baselayer's status, body and `Retry-After` back.
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
import { defaultMint } from "@baselayer/autocomplete";

const mint = defaultMint("/api/ac-session", {
  headers: () => ({ "X-CSRF-Token": readCsrfToken() }),
});
```
