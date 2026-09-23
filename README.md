# @baselayer/autocomplete

Business-name autocomplete for your own product, backed by Baselayer's
registry of US business registrations. Type three letters of a company and
get its canonical name, the states it is registered in, its lead address and
officers, and a `business_token` that pins your Baselayer search to exactly
that business.

> **Pre-release.** 0.x is being adopted by the Baselayer console and
> changes on minor versions. 1.0 freezes the API.

![The typeahead for "how con pum"](docs/images/typeahead-how-con-pum.png)

- **Framework-free core** (`@baselayer/autocomplete`): sessions, refresh,
  backoff, and every refusal the API can answer, handled for you.
- **React** (`@baselayer/autocomplete/react`): headless hooks, and a styled
  component that looks like the Baselayer console out of the box and can be
  restyled end to end.
- **Server helper** (`@baselayer/autocomplete/server`): the one endpoint
  your backend adds, so your API key never reaches a browser.

## Install

```sh
npm install @baselayer/autocomplete
```

React 18 or 19 is an optional peer; the core and the server helper need
neither React nor a DOM.

## How it fits together

```text
your page (browser)          your backend                 Baselayer
────────────────────         ────────────────────         ───────────────
SDK needs a session  ─────►  POST /api/ac-session  ─────► mint a session
                             (your route, your auth)       with your API key
                     ◄─────  status, body, Retry-After ◄── bound to the
                             passed straight through       page's Origin
keystrokes  ───────────────────────────────────────────► autocomplete tier
            X-Autocomplete-Session: <session>             rows
```

Your API key stays on your backend. The browser holds only a short-lived
session that is bound to your page's origin and carries its own request
budget.

## 1. Add the mint endpoint to your backend

Next.js (App Router), in `app/api/ac-session/route.ts`:

```ts
import { createMintHandler } from "@baselayer/autocomplete/server";

export const POST = createMintHandler({
  apiKey: process.env.BASELAYER_API_KEY!,
  allowedOrigins: ["https://app.example.com"],
});
```

Express:

```ts
import { mintForOrigin } from "@baselayer/autocomplete/server";

app.post("/api/ac-session", requireLogin, async (req, res) => {
  const out = await mintForOrigin({
    apiKey: process.env.BASELAYER_API_KEY!,
    origin: req.get("Origin") ?? "",
  });
  res.status(out.status).set(out.headers).json(out.body);
});
```

Any other backend: see [the mint endpoint contract](docs/mint-endpoint.md).
Put the route behind your own authentication, like the rest of your API:
every session your endpoint mints counts against your organization's pool.

## 2. Drop in the component

```tsx
import { BusinessAutocomplete } from "@baselayer/autocomplete/react";
import "@baselayer/autocomplete/react/styles.css";

export function LegalNameField() {
  const [name, setName] = useState("");
  const [businessToken, setBusinessToken] = useState<string>();
  return (
    <BusinessAutocomplete
      id="legal-name"
      label="Legal entity name"
      baseUrl="https://api.baselayer.com"
      mintUrl="/api/ac-session"
      value={name}
      onChange={value => {
        setName(value);
        setBusinessToken(undefined); // an edit is no longer the pick
      }}
      onPick={(_, pick) => setBusinessToken(pick.businessToken)}
    />
  );
}
```

## 3. Send the pick with your search

Your backend adds the token to its `POST /searches` call:

```json
{ "name": "HOWARD CONCRETE PUMPING CO., INC.", "business_token": "…" }
```

The search then resolves to exactly the business that was picked. A token
lives 15 minutes. If the search refuses it (expired, or the business is
gone), drop the token and submit the name as typed: `refusedThePin(status,
code)` tells you when that is the right move.

## Documentation

- [Mint endpoint contract](docs/mint-endpoint.md): the three rules, and
  examples for Next.js, Express and curl
- [Headless use](docs/headless.md): the hooks, and the core without React
- [Styling](docs/styling.md): CSS variables, class names, render props,
  `unstyled`
- [Error states](docs/error-states.md): what the SDK does with every answer
- [Security](docs/security.md): what the session is and what never leaves
  your backend
- [Live demo](docs/demo.md): try it with your own key or a session token
- [Design record](docs/design.md): why it is built the way it is

## Development

```sh
pnpm install
pnpm test          # vitest: core and server in node, react in jsdom
pnpm typecheck
pnpm lint
pnpm build         # dist/ with ESM, CJS and type declarations
pnpm demo          # the demo app on http://localhost:3000
```

Releases are tags; see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Apache-2.0
