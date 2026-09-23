# Live demo

The demo is the styled component against your own organization, with a
log of what the SDK does on every keystroke: each mint, each request, the
recovery it chose, the session's budget and expiry, and the index that
answered.

![The demo answering "osiris ra" in production](images/demo-typeahead-osiris-ra.png)

It is the `/demo/` page of [the site](site.md), which the `Site` workflow
publishes from this repository's `main` to GitHub Pages, at
<https://curly-adventure-y83og2w.pages.github.io/demo/>. While the
repository is private, so is the site: open it signed in to GitHub as a
member of the osiris-ratings organization.

The published page talks to the production API, `https://api.baselayer.com`,
from the browser. That needs the autocomplete tier to answer CORS for the
demo's origin and the API to accept its mint, which osiris-app ENG-7947
deploys; until it is in production the browser refuses both calls. Run
locally, the demo needs neither (see
[Running it locally](#running-it-locally)), and the screenshots below are
production answers to a local run.

## Connecting

Pick the environment, then one of two ways in. Run locally, the page
starts on **Production, through this dev server**.

**A session token (recommended).** Mint a session from your terminal, bound
to the demo's origin, and paste the token. Your API key never reaches the
browser:

```bash
curl -s -X POST https://api.baselayer.com/autocomplete/sessions \
  -H "X-API-Key: $BASELAYER_API_KEY" \
  -H "Origin: <the demo's origin, shown on the page>" \
  | jq -r .session_token
```

A session lasts a few minutes and carries its own request budget; paste a
new one when it runs out. The page reads the token's terms and shows them:

![Connecting with a session token](images/demo-connect-token.png)

**An API key.** The page mints for itself, the way your backend would. The
key stays in the tab's memory, is sent only to the API host you picked (or
to the local dev server, which forwards it there), and is never stored; the
page loads no third-party code and ships a Content-Security-Policy that
allows none. On the published page this mode needs the API to accept the
demo's origin.

![Connecting with an API key, with substring marks](images/demo-key-mode-how-con-pum.png)

Either way, every session is a real session on your organization's pool,
and the key must belong to a production application: sessions are not
minted for a sandbox application.

## Running it locally

```bash
pnpm install
pnpm demo        # the site, opened on http://localhost:3000/demo/
```

The page runs on `http://localhost:3000/demo/` and starts on **Production,
through this dev server**: it calls `/_baselayer/autocomplete/…` on its own
origin, and the dev server forwards those calls to production. That is the
shape of a real integration, the dev server standing in for your backend,
and it is why both modes work locally while production's CORS lists admit
neither localhost nor the published page. The browser makes no cross-origin
call at all.

The session stays bound to the page. The mint's POST carries the page's
`Origin`; the tier's GET, which a browser sends to its own origin without
one, is given the origin it came to. Point the forwarding at another API
with `DEMO_API=https://… pnpm demo`.

**Production (api.baselayer.com)** makes the calls from the browser, as the
published page does, and works once ENG-7947 is in production: a session
token from any origin, the API-key mode only from the published page's.
For another environment, pick **Custom URL** and give its API host.

## What it shows

Pick a row and the page shows the `business_token` and the search it
belongs in, beside the SDK's own account of the session: its phase, the
requests spent of its budget, when it expires, the index that answered,
and a log of every mint and request with its status, latency and recovery.

![A pick, and what the SDK did](images/demo-pick-and-log.png)
