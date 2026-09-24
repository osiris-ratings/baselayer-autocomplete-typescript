import { useState, type ReactNode } from "react";

import substringShot from "../../docs/images/typeahead-har-con-pum-substring.png";
import { Code, type Snippet } from "../shared/Code";
import { links } from "../shared/links";
import { SiteFooter } from "../shared/SiteFooter";
import { SiteHeader } from "../shared/SiteHeader";
import { ArchitectureDiagram } from "./ArchitectureDiagram";
import { Icon, type IconName } from "../shared/icons";
import { RequestFlow } from "./RequestFlow";
import { TypeaheadReel } from "./TypeaheadReel";

const INSTALL = "npm install @baselayer-sdk/autocomplete";

const ENTITIES: {
  name: string;
  icon: IconName;
  live: boolean;
  links: string;
}[] = [
  {
    name: "Businesses",
    icon: "name",
    live: true,
    links:
      "Every state registration of a company folded into one, with its footprint, officers, agents and addresses.",
  },
  {
    name: "People",
    icon: "people",
    live: false,
    links: "Officers and registered agents, with the businesses they serve.",
  },
  {
    name: "Addresses",
    icon: "address",
    live: false,
    links: "Registered addresses, with the businesses and people at them.",
  },
  {
    name: "Liens",
    icon: "lien",
    live: false,
    links: "Liens, with the businesses they name.",
  },
];

/** One suggestion for `harbor concrete`, and what it links to (made up). */
const GRAPH = {
  label: "HARBOR CONCRETE PUMPING CO., INC.",
  states: ["PA", "MD", "NY"],
  moreStates: 2,
  people: {
    count: 4,
    items: [
      { label: "DANA WHITFIELD", role: "officer" },
      { label: "LUIS ORTEGA", role: "officer" },
      { label: "MARCUS BELL", role: "officer" },
    ],
  },
  addresses: {
    count: 3,
    items: [
      { label: "1200 River Rd, Pittsburgh, PA 15212", role: "principal" },
      { label: "45 Ferry Landing, Erie, PA 16507", role: "principal" },
      { label: "300 Liberty Ave, Pittsburgh, PA 15222", role: "officer" },
    ],
  },
};

function EntityGraph() {
  return (
    <figure className="graph">
      <figcaption className="mono-label">
        One suggestion, and what it links to
      </figcaption>
      <div className="graph-root">
        <Icon name="name" />
        <div>
          <p className="graph-root-label">{GRAPH.label}</p>
          <p className="graph-states">
            {GRAPH.states.map((state, i) => (
              <span key={state} data-domicile={i === 0 ? "true" : undefined}>
                {state}
              </span>
            ))}
            <span data-more="true">+{GRAPH.moreStates}</span>
          </p>
        </div>
      </div>
      <ul className="graph-branches">
        <li>
          <p className="graph-branch">
            <code>related.people</code> <span>{GRAPH.people.count}</span>
          </p>
          <ul>
            {GRAPH.people.items.map(item => (
              <li key={item.label}>
                <Icon name="people" size={18} />
                {item.label}
                <span className="graph-role">{item.role}</span>
              </li>
            ))}
          </ul>
        </li>
        <li>
          <p className="graph-branch">
            <code>related.addresses</code> <span>{GRAPH.addresses.count}</span>
          </p>
          <ul>
            {GRAPH.addresses.items.map(item => (
              <li key={item.label}>
                <Icon name="address" size={18} />
                {item.label}
                <span className="graph-role">{item.role}</span>
              </li>
            ))}
          </ul>
        </li>
        <li data-soon="true">
          <p className="graph-branch">
            <code>related.liens</code> <span>coming soon</span>
          </p>
        </li>
      </ul>
      <p className="graph-source">
        <span className="mono-label">Answer for</span>{" "}
        <code>harbor concrete</code>
      </p>
    </figure>
  );
}

const FIELDS_LEFT: { icon: IconName; title: string; field: string }[] = [
  { icon: "name", title: "Canonical name", field: "label" },
  {
    icon: "states",
    title: "Registered states",
    field: "states · domicile_state",
  },
  { icon: "address", title: "Lead address", field: "related.addresses" },
];

const FIELDS_RIGHT: { icon: IconName; title: string; field: string }[] = [
  { icon: "people", title: "Officers and agents", field: "related.people" },
  { icon: "marks", title: "What matched", field: "highlight" },
  { icon: "token", title: "A token for your search", field: "token" },
];

const MINT_SNIPPETS: Snippet[] = [
  {
    label: "Next.js",
    lang: "typescript",
    code: `// app/api/ac-session/route.ts
import { createMintHandler } from "@baselayer-sdk/autocomplete/server";

export const POST = createMintHandler({
  apiKey: process.env.BASELAYER_API_KEY!,
  allowedOrigins: ["https://app.example.com"],
});`,
  },
  {
    label: "Express",
    lang: "typescript",
    code: `import { mintForOrigin } from "@baselayer-sdk/autocomplete/server";

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
});`,
  },
  {
    label: "Python",
    lang: "python",
    code: `@app.post("/api/ac-session")
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
                    media_type="application/json")`,
  },
  {
    label: "curl",
    lang: "shell",
    code: `curl -s -X POST https://api.baselayer.com/autocomplete/sessions \\
  -H "X-API-Key: $BASELAYER_API_KEY" \\
  -H "Origin: https://app.example.com"`,
  },
];

const PAGE_SNIPPETS: Snippet[] = [
  {
    label: "React component",
    lang: "typescript",
    code: `import { useState } from "react";
import { BusinessAutocomplete } from "@baselayer-sdk/autocomplete/react";
import "@baselayer-sdk/autocomplete/react/styles.css";

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
}`,
  },
  {
    label: "React hooks",
    lang: "typescript",
    code: `import {
  useBusinessAutocomplete,
  useBusinessCombobox,
} from "@baselayer-sdk/autocomplete/react";

function Field() {
  const [value, setValue] = useState("");
  const state = useBusinessAutocomplete({ query: value, enabled: true });
  const combobox = useBusinessCombobox({
    id: "legal-name",
    items: state.suggestions,
    inputValue: value,
    onInputChange: setValue,
    onPick: item => setValue(item.label),
    hasFooter: state.isSearching || state.error !== null,
  });
  // Your label, input and rows, wired with combobox.getInputProps(),
  // getMenuProps() and getItemProps({ item, index }).
}`,
  },
  {
    label: "No framework",
    lang: "typescript",
    code: `import { createAutocompleteClient, defaultMint } from "@baselayer-sdk/autocomplete";

const client = createAutocompleteClient({
  baseUrl: "https://api.baselayer.com",
  mint: defaultMint("/api/ac-session"),
});

const controller = new AbortController();
const { response, roundTripMs, indexTag } = await client.suggest(
  { q: "harbor concrete pum", limit: 5 },
  { signal: controller.signal },
);
response.suggestions.forEach(row => console.log(row.label, row.token));`,
  },
];

const SEARCH_SNIPPET: Snippet[] = [
  {
    label: "POST /searches",
    lang: "json",
    code: `{
  "name": "HARBOR CONCRETE PUMPING CO., INC.",
  "business_token": "A4uYMdTtN1PuVsmNF8…"
}`,
  },
];

const STYLE_SNIPPETS: Snippet[] = [
  {
    label: "CSS variables",
    lang: "css",
    code: `.bl-ac {
  --bl-ac-title: #1c1b1c;
  --bl-ac-pill-bg: #c6dbf6;
  --bl-ac-pill-fg: #09234f;
  --bl-ac-underline: #384ce3;
  --bl-ac-radius: 2px;
}`,
  },
  {
    label: "look prop",
    lang: "typescript",
    code: `<BusinessAutocomplete
  look={{
    matchEmphasis: "background", // plain | weight | ink | underline | background
    matchEmphasisRegion: "substring", // token | substring
    pillBackgroundColor: "#DBEAFE",
    pillForegroundColor: "#1E3A8A",
  }}
  …
/>`,
  },
];

function FieldCard({
  icon,
  title,
  field,
  side,
}: {
  icon: IconName;
  title: string;
  field: string;
  side: "left" | "right";
}) {
  return (
    <div className={`field-card field-card-${side}`}>
      <div className="field-card-title">
        <Icon name={icon} />
        {title}
      </div>
      <div className="field-card-field">
        <span>Field:</span> <code>{field}</code>
      </div>
    </div>
  );
}

function Panel({
  num,
  id,
  children,
}: {
  num: string;
  id?: string;
  children: ReactNode;
}) {
  return (
    <section
      className="panel"
      id={id}
      aria-labelledby={id ? `${id}-title` : undefined}
    >
      <div className="panel-num">{num}</div>
      <div className="panel-body">{children}</div>
    </section>
  );
}

function InstallLine() {
  return (
    <div className="install">
      <Code
        title="Install"
        snippets={[{ label: "npm", lang: "shell", code: INSTALL }]}
      />
    </div>
  );
}

/**
 * Stops the page's moving parts, the coming-soon lane and the reel, and
 * starts them again: both loop for as long as the page is open. Hidden
 * with reduced motion, when nothing moves.
 */
function MotionToggle({
  paused,
  onToggle,
}: {
  paused: boolean;
  onToggle(): void;
}) {
  return (
    <button
      type="button"
      className="motion-toggle"
      aria-label="Pause the animations"
      aria-pressed={paused}
      title={paused ? "Play the animations" : "Pause the animations"}
      onClick={onToggle}
    >
      <svg viewBox="0 0 16 16" width={12} height={12} aria-hidden="true">
        {paused ? (
          <path d="M4.5 2.5 L13 8 L4.5 13.5 Z" fill="currentColor" />
        ) : (
          <path d="M4 2.5h3v11H4zM9 2.5h3v11H9z" fill="currentColor" />
        )}
      </svg>
    </button>
  );
}

export function Home() {
  const [paused, setPaused] = useState(false);
  const toggle = () => setPaused(value => !value);
  return (
    <>
      <SiteHeader current="home" />
      <main data-motion={paused ? "paused" : undefined}>
        <section
          className="hero wrap"
          id="overview"
          aria-labelledby="hero-title"
        >
          <div className="hero-copy">
            <p className="eyebrow">
              <span className="eyebrow-icon" aria-hidden="true">
                <Icon name="caret" />
              </span>
              Autocomplete SDK
            </p>
            <h1 className="display" id="hero-title">
              Pick the right business as you type
            </h1>
          </div>
          <div className="hero-aside">
            <p className="lede">
              Every suggestion is a canonical entity from Baselayer&apos;s
              registry, already linked to the entities around it: a business
              arrives with its officers, agents and addresses. Pick one, and
              your Baselayer search is pinned to exactly that business.
            </p>
            {/* What is served, then what is coming, running past in a lane
                that fades out on the right. */}
            <div className="entity-row">
              <ul className="entity-chips" aria-label="What it searches">
                {ENTITIES.filter(entity => entity.live).map(entity => (
                  <li key={entity.name} data-live="true">
                    {entity.name}
                  </li>
                ))}
                <li className="entity-lane">
                  {/* Four copies end to end: the loop moves by one, and the
                    other three always cover the lane, however wide. */}
                  <div className="entity-lane-track">
                    {[0, 1, 2, 3].map(copy => (
                      <ul
                        key={copy}
                        className="entity-lane-set"
                        aria-hidden={copy > 0 ? true : undefined}
                      >
                        {ENTITIES.filter(entity => !entity.live).map(entity => (
                          <li key={entity.name} data-live="false">
                            {entity.name}
                            <span>soon</span>
                          </li>
                        ))}
                      </ul>
                    ))}
                  </div>
                </li>
              </ul>
              <MotionToggle paused={paused} onToggle={toggle} />
            </div>
            <div className="hero-actions">
              <a className="btn btn-primary" href={links.demo}>
                Try the demo
              </a>
              <a className="btn btn-outline" href={links.api}>
                API reference
              </a>
            </div>
            <InstallLine />
            <p className="mono-label hero-note">
              Pre-release 0.x · React 18 or 19, optional · Node 20+ for the
              server helper
            </p>
          </div>
        </section>

        <section className="wrap" aria-label="What a suggestion carries">
          <div className="specimen">
            <div className="specimen-side">
              {FIELDS_LEFT.map(f => (
                <FieldCard key={f.title} {...f} side="left" />
              ))}
            </div>
            <figure className="specimen-card">
              <div className="specimen-label mono-label">
                Your product, powered by Baselayer
              </div>
              <MotionToggle paused={paused} onToggle={toggle} />
              <TypeaheadReel paused={paused} />
            </figure>
            <div className="specimen-side">
              {FIELDS_RIGHT.map(f => (
                <FieldCard key={f.title} {...f} side="right" />
              ))}
            </div>
          </div>
        </section>

        <div className="wrap sections">
          <Panel num="01" id="entities">
            <div className="entities">
              <div>
                <h2 className="display-sm" id="entities-title">
                  Every entity, linked to the rest
                </h2>
                <p className="lede">
                  Search by the entity you have in hand. Each result comes back
                  as a canonical entity with the entities it is linked to, so
                  the person typing can tell the right Harbor Concrete Pumping
                  from the others by who runs it and where it is.
                </p>
                <div className="entity-cards">
                  {ENTITIES.map(entity => (
                    <article
                      key={entity.name}
                      className="entity-card"
                      data-live={entity.live ? "true" : "false"}
                    >
                      <div className="entity-card-head">
                        <Icon name={entity.icon} />
                        <h3>{entity.name}</h3>
                        <span className="pill">
                          {entity.live ? "Live" : "Coming soon"}
                        </span>
                      </div>
                      <p>{entity.links}</p>
                    </article>
                  ))}
                </div>
              </div>
              <EntityGraph />
            </div>
          </Panel>

          <Panel num="02" id="layers">
            <h2 className="display-sm" id="layers-title">
              One package, three layers
            </h2>
            <p className="lede">
              Stop at whichever layer your design system wants. Each one is a
              subpath of the same package, at the same version.
            </p>
            <div className="layers">
              <article className="layer">
                <code className="layer-path">@baselayer-sdk/autocomplete</code>
                <h3>A framework-free core</h3>
                <p>
                  Sessions, refresh, backoff, and every refusal the API can
                  answer, handled for you. Runs anywhere with <code>fetch</code>
                  .
                </p>
              </article>
              <article className="layer">
                <code className="layer-path">
                  @baselayer-sdk/autocomplete/react
                </code>
                <h3>Hooks and a styled component</h3>
                <p>
                  Headless hooks with the accessibility wired in, and a
                  component that looks like the Baselayer console out of the box
                  and restyles end to end.
                </p>
              </article>
              <article className="layer">
                <code className="layer-path">
                  @baselayer-sdk/autocomplete/server
                </code>
                <h3>The one endpoint your backend adds</h3>
                <p>
                  Mints a session with your key, forwards the page&apos;s{" "}
                  <code>Origin</code>, and passes Baselayer&apos;s answer
                  through. Your key never reaches a browser.
                </p>
              </article>
            </div>
          </Panel>

          <Panel num="03" id="how-it-works">
            <h2 className="display-sm" id="how-it-works-title">
              Your key stays home. Keystrokes go direct.
            </h2>
            <p className="lede">
              Your backend adds one endpoint that mints short-lived sessions.
              The browser uses a session to ask Baselayer for rows itself, so
              typing never waits on your servers, and your API key never leaves
              them.
            </p>
            <figure className="diagram-frame">
              <div className="diagram-scroll">
                <ArchitectureDiagram paused={paused} />
              </div>
              <div className="diagram-foot">
                <p className="diagram-hint mono-label">
                  Scroll sideways for all three zones
                </p>
                <MotionToggle paused={paused} onToggle={toggle} />
              </div>
            </figure>
            <ol className="hops">
              <li>
                When the field gets focus, the SDK asks your endpoint for a
                session. Your own cookie authenticates the call.
              </li>
              <li>
                Your backend mints it with your API key, forwarding the
                page&apos;s <code>Origin</code>, and returns Baselayer&apos;s
                answer unchanged.
              </li>
              <li>
                Every keystroke goes straight to Baselayer with the session in a
                header: no cookies, no key.
              </li>
              <li>
                Picking a row hands your form its <code>business_token</code>.
              </li>
              <li>
                Your backend sends the token with <code>POST /searches</code>,
                so the search resolves to exactly the business that was picked.
              </li>
            </ol>
          </Panel>

          <Panel num="04" id="request-flow">
            <h2 className="display-sm" id="request-flow-title">
              Request by request
            </h2>
            <p className="lede">
              What crosses each boundary, from the moment the field gets focus
              to the search your backend sends.
            </p>
            <figure className="diagram-frame">
              <div className="diagram-scroll">
                <RequestFlow />
              </div>
              <p className="diagram-hint mono-label">
                Scroll sideways for all three lanes
              </p>
            </figure>
          </Panel>

          <Panel num="05" id="quick-start">
            <h2 className="display-sm" id="quick-start-title">
              Three steps to a working field
            </h2>
            <div className="steps">
              <div className="step">
                <div className="step-copy">
                  <p className="mono-label">Step 1</p>
                  <h3>Add the mint endpoint to your backend</h3>
                  <p>
                    It forwards the page&apos;s <code>Origin</code>, passes
                    Baselayer&apos;s status, body and <code>Retry-After</code>{" "}
                    through unchanged, and never forwards cookies.
                  </p>
                  <p>
                    Put it behind your own authentication: every session it
                    mints counts against your organization&apos;s pool.
                  </p>
                  <a href={links.apiSessions}>The sessions reference</a>
                </div>
                <Code title="Mint endpoint" snippets={MINT_SNIPPETS} />
              </div>
              <div className="step">
                <div className="step-copy">
                  <p className="mono-label">Step 2</p>
                  <h3>Drop in the component</h3>
                  <p>
                    Point it at your endpoint with <code>mintUrl</code> and at
                    Baselayer with <code>baseUrl</code>. It warms a session up
                    on focus, asks as the user types, and handles every refusal
                    itself.
                  </p>
                  <p>
                    Prefer your own markup? Use the hooks, or the core alone.
                  </p>
                </div>
                <Code title="Your page" snippets={PAGE_SNIPPETS} />
              </div>
              <div className="step">
                <div className="step-copy">
                  <p className="mono-label">Step 3</p>
                  <h3>Send the pick with your search</h3>
                  <p>
                    Your backend adds the row&apos;s token to its{" "}
                    <code>POST /searches</code> call. A token lives 15 minutes.
                  </p>
                  <p>
                    If the search refuses it, drop the token and submit the name
                    as typed: <code>refusedThePin(status, code)</code> says
                    when.
                  </p>
                </div>
                <Code
                  title="POST /searches, from your backend"
                  snippets={SEARCH_SNIPPET}
                />
              </div>
            </div>
          </Panel>

          <Panel num="06" id="security">
            <h2 className="display-sm" id="security-title">
              The browser holds a session, never a key
            </h2>
            <div className="facts">
              <div className="fact">
                <Icon name="token" />
                <h3>Your key stays on your server</h3>
                <p>
                  Only your backend mints sessions, so no page ever sees your
                  API key or needs one.
                </p>
              </div>
              <div className="fact">
                <Icon name="lock" />
                <h3>Bound to your origin</h3>
                <p>
                  Baselayer seals the page&apos;s <code>Origin</code> into the
                  session, and the tier refuses it from any other page.
                </p>
              </div>
              <div className="fact">
                <Icon name="clock" />
                <h3>Minutes long, and budgeted</h3>
                <p>
                  A session lasts a few minutes and carries its own request
                  budget. The SDK refreshes it before anyone notices.
                </p>
              </div>
              <div className="fact">
                <Icon name="nocookie" />
                <h3>No cookies on the tier</h3>
                <p>
                  The tier reads one credential, the session header, and never
                  allows credentials, so no cookie is sent from any origin.
                </p>
              </div>
            </div>
          </Panel>

          <Panel num="07" id="styling">
            <div className="styling">
              <div>
                <h2 className="display-sm" id="styling-title">
                  Looks like the Baselayer console. Restyles to look like you.
                </h2>
                <p className="lede">
                  Out of the box it is the console&apos;s typeahead, pixel for
                  pixel. CSS variables, the <code>look</code> prop, class names
                  and render props take it the rest of the way, down to{" "}
                  <code>unstyled</code>.
                </p>
                <Code title="Styling" snippets={STYLE_SNIPPETS} />
              </div>
              <figure className="styling-shot">
                <img
                  src={substringShot}
                  alt="The typeahead for “har con pum” with only the typed characters of each word underlined."
                />
                <figcaption>
                  <code>matchEmphasisRegion: &quot;substring&quot;</code>
                </figcaption>
              </figure>
            </div>
          </Panel>
        </div>

        <section className="cta" aria-labelledby="cta-title">
          <div className="wrap cta-inner">
            <h2 className="display" id="cta-title">
              Try it against your own organization
            </h2>
            <div>
              <p>
                Paste a session token or an API key into the demo and watch
                every mint, request and recovery the SDK makes, against
                production.
              </p>
              <div className="hero-actions">
                <a className="btn btn-primary" href={links.demo}>
                  Try the demo
                </a>
                <a className="btn btn-light" href={links.api}>
                  API reference
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
