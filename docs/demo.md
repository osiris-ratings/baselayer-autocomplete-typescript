# Live demo

The demo is the styled component against your own organization. You
connect, type a business name with any filters, and restyle the component.
Beside it, folded away until you want it, is what the SDK did about it: the
session, every request on a network timeline with its timing and size, and
the SDK's own log.

![The demo with its debug panel open, typing "harbor concrete pum"](images/demo-split.png)

It is the `/demo/` page of [the site](site.md), which the `Site` workflow
publishes from this repository's `main` to GitHub Pages, at
<https://sdk.baselayer.com/autocomplete/demo/>.

The published page talks to the production API, `https://api.baselayer.com`,
from the browser. That needs the autocomplete tier to answer CORS for the
demo's origin and the API to accept its mint; where either does not, the
browser refuses the call. Run locally, the demo needs neither (see
[Running it locally](#running-it-locally)). The screenshots below are the
demo answering from made-up businesses, so no real company or person
appears in them.

## The layout

The page is the window's height and never scrolls itself. It has three panes,
side by side, each scrolling on its own: the introduction, the controls (**01
Connect** and **02 Try autocomplete here**), and Debug or Styling. The
introduction folds to a **Live demo** tab with its **Hide**; opening Debug or
Styling folds it too, to give that pane room, and the tab brings it back. On a
narrow screen the panes stack and the page scrolls as any other does.

The panes move as they change, so it is plain where each went. Opening one,
its tab turns a quarter about the square at its top, where its icon is, as it
moves to the top of the pane, never rising above the pane's top nor reaching
past its start; the pane's head extends out of it, and the rest unrolls
downward from under the head. Folding one away goes the other way, one step at
a time: the pane rolls up into its head and turns back into its tab where it
stands, and only then do the controls move over and widen. With reduced
motion, or in a browser without view transitions, the panes change at once.

## Connecting

Pick the environment, then one of two ways in, and press **Apply**. The button
stays gray until there is something to apply. Apply tests what you gave it
before the demo uses it, and says what was wrong: a key the API refused, a
token the tier refused or that is bound to another page, or one that has
expired (read from the token itself, before any call). Once it passes, Connect
folds away to one line that says how you are connected and, at its right, a
dot with how the session stands: pulsing green with the time it has left
(`valid 2:56`), blue while it is `idle` or `minting`, and red once a pasted
token has `expired`, while the SDK backs off (`retry in m:ss`) or once it is
`unavailable`. With a key it reads `idle` until the component takes its first
session (on focus, by default). A pasted token's connection ends when the
token expires; a key's does not, since the next search mints a new session,
and until then the line reads `renews on the next search`. Open Connect again
to change anything. Run locally, the page starts on **Production, through this
dev server**.

**An API key.** The page mints for itself, the way your backend would. The key
stays in the tab's memory, is sent only to the API host you picked (or to the
local dev server, which forwards it there), and is never stored; the page
loads no third-party code, and the published page ships a
Content-Security-Policy that allows none (`pnpm demo` adds none: its hot
reload needs an inline script). An API key has no test but a mint, so Apply
mints one session and the demo hands it to the component as its first: the
test costs nothing the component's own first mint (on focus, by default) would
not have. On the published page this mode needs the API to accept the demo's
origin.

**A session token.** Mint a session from your terminal, bound to the demo's
origin, and paste the token. Your API key never reaches the browser:

```bash
curl -s -X POST https://api.baselayer.com/autocomplete/sessions \
  -H "X-API-Key: $BASELAYER_API_KEY" \
  -H "Origin: <the demo's origin, shown on the page>" \
  | jq -r .session_token
```

A session lasts a few minutes and carries its own request budget; paste a
new one when it runs out. Its terms show in the debug panel once it is
applied. Apply checks the token against the tier's
`GET /autocomplete/version`, which verifies it (signature, expiry, the origin
it is bound to) on a budget of its own, so the check spends none of the
token's requests:

![Connecting with a session token](images/demo-connect-token.png)

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
published page does: a session token from any origin, the API-key mode only
from the published page's.
For another environment, pick **Custom URL** and give its API host.

## The test form

**02 Try autocomplete here** is the component on a form of its own. The
business name is always there; its suggestions open beneath it. The filters it
can carry (an officer or agent's name, the states the business is registered
in, an address) fold away behind **Add filters**, beside the title, which
counts the ones set. The SDK holds them back until the business name (not the
officer's) has as many characters as the session's `filter_min_stem` asks for,
which the hint above the filters names, and the log says when it did. Pick a
row and the form shows the business, where it is domiciled and registered, the
time its `business_token` is good until (15 minutes after the pick), and the
`POST /searches` body it belongs in, with the token cut short.

## Styling

Styling and the debug panel share the right of the page: one or the other,
or neither. Folded, each is a tab beside the controls, **Debug here** and
**Style here**, reading up their spines; open one and a switch at the top of
the panel flips between the two, and **Hide** folds it back. The switch stays
put as the panel scrolls, as far below the site's header as the controls
start, with what scrolls under it blurred. Opened, the page below the header
widens to make room; on a narrow screen the tabs lie side by side under the
controls, and the panel opens below them.

Opening Styling folds Connect away, so the component is what you look at. Its
menu stays open, blur or no blur, and takes its place in the page rather than
lying over it. With nothing typed it shows made-up rows, as many as Rows asks
for (five by default, eight at most), that carry every part of a row
(highlighted words, a matched alternative name, the domicile square and the
overflow, an address, officers with a +N, a registered agent, the count), so
every knob can be judged before a keystroke; type a name and the real rows
take their place. The rows pretend "harbor concr" was typed, one word in full
and the next only begun, so the region shows its difference: whole word
highlights CONCRETE, typed characters only its CONCR.

Behavior acts on the sample rows as it would on real ones: Rows sets how many
there are, up to the sample's eight. The characters, the pause and the session
act only as you type. What a row fetches follows from its components: leave
out the subtitle and the addresses are not asked for, leave out the secondary
subtitle and the people (officers and agents) are not. Leave out both and no
`include` is sent, since the tier refuses an empty one, so its default, people
and addresses, comes back all the same, only not drawn.

First come six presets, each a color theme drawn as a small row in its own
colors: Light (the default, with matched ink in green), Baselayer, Midnight,
Monokai, Sepia and Rosé. A preset sets the colors, the corners and the shadow,
and leaves your sizes, behavior and text alone. Then every knob the styled
component has, in sections that start folded: the components a row shows
(beside its title, which always shows, its flags, subtitle and secondary
subtitle: on a business, the states, the lead address and the officers or the
registered agent), how matched words are highlighted (the emphasis, the
region, and one color override for every emphasis) and whether the footer
shows the round trip and the index that answered (`look.showDebugInfo`, a
switch in the same fold), every color (the `look` prop's and the stylesheet's
own variables, each with a swatch that opens a color picker), shape and size,
behavior (rows, 1 to 20; the characters typed before it asks, 2 to 10 and 3 by
default; the pause before asking; when the session is minted: on focus, on the
first keystroke or with the first request; and whether the menu is as wide as
the input, as it is by default), the text (the label, and every message that
is a string: `more` and `httpFallback` are functions, so they keep their
defaults), and the structural switches (`classNames`, `unstyled`). Changes
apply as you make them. A color changed from its preset's carries a reset
inside its field, which puts back the value the last preset chosen gave it.
**Your configuration** at the bottom is the code that reproduces the result,
in a React tab and a CSS tab with a **Copy**: the props that differ from the
defaults, and the CSS variables to set. Its **Reset** puts the whole panel
back as it opened: the Light preset and every default.

![The styling panel](images/demo-styling.png)

![The component in the Midnight preset](images/demo-styled.png)

## Debug

Its tab carries the number of requests so far. When a request is refused or
fails, or the SDK logs an error, while the panel is not showing, a red dot
pulses on the tab's bug (and on the switch's, while Styling is up) until you
open it. Folded, the page is as wide as the site's other pages.

![The demo with its debug panel folded](images/demo-folded.png)

The panel is one card, down to the foot of the page, with three tabs:
**Network**, first, counting the requests; **Session**, with the connection's
dot; and **SDK log**, counting its entries. What a tab holds scrolls inside
the card.

Network is the timeline of every request the page made: when it started,
whether it was a mint (`mint`), a query (`tier`, with the query and any
filters) or another call (`http`, such as the token check's
`GET /autocomplete/version`), its status, the size of the body, and how long
it took. It draws the last 60, under a line that counts the requests, the
mints, the aborted ones and the bytes, beside a **Clear**. The waterfall puts
them on one time axis, with the tier's own time (`Server-Timing`) drawn inside
each round trip, and a request a newer keystroke aborted drawn hatched. Click
a row for its URL, timings, headers and body; credentials are cut short before
anything is shown.

![A request's details](images/demo-network.png)

Session has its phase, the requests spent of its budget, when it expires, and
the index that answered. Under those, what the session's token says beyond
them: the origin it is bound to, how many characters of the name the officer,
state and address filters wait for, and how often the name can be replaced by
another before the tier wants a new session. SDK log is the SDK's own account
of every mint, request, recovery and change of phase, newest first and the
last 80 kept, with a **Clear** of its own.
