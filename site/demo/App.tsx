import {
  createAutocompleteClient,
  type AutocompleteClient,
  type BusinessSuggestion,
  type Filters,
  type SessionPhase,
} from "@baselayer/autocomplete";
import {
  BusinessAutocomplete,
  useAutocompleteSession,
  type Pick,
} from "@baselayer/autocomplete/react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { Icon } from "../shared/icons";
import {
  testKey,
  testToken,
  withFirstGrant,
  type CheckResult,
} from "./connect";
import { connectionStatus, formatRemaining } from "./connection";
import { Collapsible, FOLD_MS, Field, Select } from "./controls";
import { keyMint, readClaims, tokenMint } from "./credentials";
import { NetworkLog } from "./network";
import { NetworkTimeline } from "./NetworkTimeline";
import {
  DEFAULT_STYLE,
  changedLook,
  previewCss,
  type StyleState,
} from "./style-state";
import { StylingPanel } from "./StylingPanel";

const PRODUCTION = "https://api.baselayer.com";
/**
 * `pnpm demo` forwards this path to production (site/vite.config.ts). The
 * published page is static, so it has no server to forward through.
 */
const DEV_SERVER_PATH = import.meta.env.DEV ? "/_baselayer" : null;
type Environment = "dev-server" | "production" | "custom";
type Mode = "token" | "key";
/** The session's phase by name: idle, minting, ready, backoff or unavailable. */
type PhaseName = SessionPhase["phase"];

/** The clock, ticking once a second, for the countdowns. */
function useNow(): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

const ENVIRONMENTS: Environment[] =
  DEV_SERVER_PATH === null
    ? ["production", "custom"]
    : ["dev-server", "production", "custom"];
const ENVIRONMENT_LABELS: Record<Environment, string> = {
  "dev-server": "Production, through this dev server",
  production: "Production (api.baselayer.com)",
  custom: "Custom URL",
};

interface LogLine {
  id: number;
  at: string;
  /** `performance.now()` when it was logged. */
  t: number;
  kind: "mint" | "request" | "session";
  text: string;
  ok: boolean;
}

function clock(): string {
  return new Date().toLocaleTimeString([], { hour12: false });
}

/** What Apply accepted: the credential, where it goes, and the session its test minted. */
interface Applied {
  id: number;
  mode: Mode;
  secret: string;
  baseUrl: string;
  environment: Environment;
  firstGrant?: Extract<CheckResult, { ok: true }>["grant"];
}

function useClient(applied: Applied | null, network: NetworkLog) {
  return useMemo(() => {
    if (applied === null) {
      return null;
    }
    const mint =
      applied.mode === "key"
        ? withFirstGrant(
            applied.firstGrant,
            keyMint(applied.baseUrl, applied.secret, network.fetch),
          )
        : tokenMint(applied.secret);
    return createAutocompleteClient({
      baseUrl: applied.baseUrl,
      mint,
      fetch: network.fetch,
    });
  }, [applied, network]);
}

function useLog(client: AutocompleteClient | null): [LogLine[], () => void] {
  const [lines, setLines] = useState<LogLine[]>([]);
  const next = useRef(1);
  useEffect(() => {
    setLines([]);
    if (client === null) {
      return;
    }
    const push = (line: Omit<LogLine, "id" | "at" | "t">) =>
      setLines(previous =>
        [
          { ...line, id: next.current++, at: clock(), t: performance.now() },
          ...previous,
        ].slice(0, 80),
      );
    let phase: PhaseName | null = null;
    const offState = client.on("stateChange", snapshot => {
      const now = snapshot.session.phase;
      if (now !== phase) {
        push({
          kind: "session",
          ok: now !== "unavailable",
          text: `${phase ?? "start"} → ${now}`,
        });
        phase = now;
      }
    });
    const offMint = client.on("mint", event => {
      const outcome = event.outcome;
      push({
        kind: "mint",
        ok: outcome.kind === "granted",
        text:
          outcome.kind === "granted"
            ? `${event.reason} mint: ${outcome.grant.expiresIn} s, ${outcome.grant.requestBudget} requests, ${event.durationMs} ms`
            : `${event.reason} mint refused: HTTP ${outcome.status}${outcome.code !== null ? ` code ${outcome.code}` : ""}${outcome.message ? `, ${outcome.message}` : ""}`,
      });
    });
    const offRequest = client.on("request", event => {
      push({
        kind: "request",
        ok: event.error === null,
        text:
          event.error === null
            ? `"${event.q}" → ${event.status} in ${event.roundTripMs} ms${event.recovery !== "none" ? ` after ${event.recovery}` : ""}${event.filtersWithheld ? ", filters held back" : ""}`
            : `"${event.q}" → ${event.error.kind}: ${event.error.message}`,
      });
    });
    return () => {
      offState();
      offMint();
      offRequest();
      client.reset();
    };
  }, [client]);
  return [lines, () => setLines([])];
}

function SessionMeters({
  client,
  applied,
}: {
  client: AutocompleteClient;
  applied: Applied;
}) {
  const { snapshot } = useAutocompleteSession(client);
  const now = useNow();
  const session = snapshot.session;
  const usage = snapshot.usage;
  // What the session's token says: the held grant's or, before the SDK has
  // first used a pasted token, that token's.
  const token =
    session.phase === "ready"
      ? session.grant.sessionToken
      : applied.mode === "token"
        ? applied.secret
        : null;
  const facts = token === null ? null : readClaims(token);
  const budget = usage.requestBudget ?? facts?.bud ?? null;
  const expiresAt =
    session.phase === "ready"
      ? session.grant.expiresAt
      : facts !== null
        ? facts.exp * 1000
        : null;
  return (
    <>
      <dl className="meters">
        <div>
          <dt>Session</dt>
          <dd data-testid="demo-phase" data-phase={session.phase}>
            {session.phase}
          </dd>
        </div>
        <div>
          <dt>Requests</dt>
          <dd>
            {usage.requestsSinceMint}
            {budget !== null ? ` / ${budget}` : ""}
          </dd>
        </div>
        <div>
          <dt>Expires in</dt>
          <dd>
            {session.phase === "backoff" || session.phase === "unavailable"
              ? `waiting ${formatRemaining(session.until - now)}`
              : expiresAt !== null
                ? formatRemaining(expiresAt - now)
                : "–"}
          </dd>
        </div>
        <div>
          <dt>Index</dt>
          <dd className="mono">{snapshot.lastIndexTag ?? "–"}</dd>
        </div>
      </dl>
      {/* What the session's token says, beyond its budget and its expiry. */}
      {facts !== null && (
        <dl className="session-facts">
          <div>
            <dt>Bound to</dt>
            <dd>
              <code>{facts.ori ?? "any origin"}</code>
              <span className="hint">
                {facts.ori !== null
                  ? "The tier answers this session only on pages from this origin."
                  : "Minted without an Origin, so it works on any page."}
              </span>
            </dd>
          </div>
          <div>
            <dt>Filters</dt>
            <dd>
              from {facts.stem} characters
              <span className="hint">
                Officer, state and address filters wait until the name has{" "}
                {facts.stem} characters (punctuation aside); until then the SDK
                holds them back.
              </span>
            </dd>
          </div>
          <div>
            <dt>Name changes</dt>
            <dd>
              {facts.piv}
              <span className="hint">
                How often the name can be replaced by another before the tier
                wants a new session. Typing on, backspacing and fixing a typo
                are not changes.
              </span>
            </dd>
          </div>
        </dl>
      )}
    </>
  );
}

/** Folded Connect's far right: a dot for the connection and its timer. */
function ConnectionIndicator({
  client,
  applied,
}: {
  client: AutocompleteClient;
  applied: Applied;
}) {
  const { snapshot } = useAutocompleteSession(client);
  const now = useNow();
  const claims = applied.mode === "token" ? readClaims(applied.secret) : null;
  const status = connectionStatus(
    applied.mode,
    snapshot.session,
    now,
    claims === null ? null : claims.exp * 1000,
  );
  return (
    <span
      className="connection"
      data-state={status.state}
      data-testid="demo-connection"
    >
      <span className="connection-dot" aria-hidden="true" />
      {status.label}
    </span>
  );
}

function parseStates(text: string): string[] {
  return text
    .split(/[\s,]+/)
    .map(s => s.trim().toUpperCase())
    .filter(s => /^[A-Z]{2}$/.test(s));
}

export function App() {
  const network = useMemo(() => new NetworkLog(), []);
  const entries = useSyncExternalStore(network.subscribe, network.getSnapshot);
  const requests = entries.length;
  const [environment, setEnvironment] = useState<Environment>(ENVIRONMENTS[0]!);
  const [customUrl, setCustomUrl] = useState("");
  const [mode, setMode] = useState<Mode>("token");
  const [draft, setDraft] = useState("");
  const [applied, setApplied] = useState<Applied | null>(null);
  const [check, setCheck] = useState<CheckResult | "testing" | null>(null);
  // A successful check, for screen readers: the section it would show in is
  // folded away (and inert) by the same click.
  const [announced, setAnnounced] = useState("");
  const appliedCount = useRef(0);
  const [connectOpen, setConnectOpen] = useState(true);
  const connectToggle = useRef<HTMLButtonElement>(null);
  const [stylingOpen, setStylingOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<{
    suggestion: BusinessSuggestion;
    pick: Pick;
  } | null>(null);
  const [person, setPerson] = useState("");
  const [states, setStates] = useState("");
  const [address, setAddress] = useState("");
  const [style, setStyle] = useState<StyleState>(DEFAULT_STYLE);

  const origin = typeof location === "undefined" ? "" : location.origin;
  const customBase = customUrl.replace(/\/+$/, "");
  // Where the page's calls go, and the API they reach (the two differ only
  // when the dev server forwards them).
  const baseUrl =
    environment === "dev-server"
      ? `${origin}${DEV_SERVER_PATH ?? ""}`
      : environment === "custom"
        ? customBase
        : PRODUCTION;
  const apiHost = environment === "custom" ? customBase : PRODUCTION;
  const client = useClient(applied, network);
  const [log, clearLog] = useLog(client);

  // When the last error happened, a refused or failed request or an error in
  // the log, against when the debug panel last showed it: the folded tab
  // pulses only for errors nobody has seen, and clearing a list hides none.
  const lastErrorAt = Math.max(
    0,
    ...entries
      .filter(
        e => e.outcome === "failed" || (e.status !== null && e.status >= 400),
      )
      .map(e => e.endedAt ?? e.startedAt),
    ...log.filter(line => !line.ok).map(line => line.t),
  );
  const [seenAt, setSeenAt] = useState(0);
  useEffect(() => {
    if (debugOpen) setSeenAt(performance.now());
  }, [debugOpen, lastErrorAt]);
  const unseenErrors = !debugOpen && lastErrorAt > seenAt;
  const isApplied =
    applied !== null &&
    applied.mode === mode &&
    applied.secret === draft.trim() &&
    applied.baseUrl === baseUrl;

  const apply = async () => {
    const secret = draft.trim();
    setCheck("testing");
    setAnnounced("");
    const result =
      mode === "key"
        ? await testKey(baseUrl, secret, network.fetch)
        : await testToken(baseUrl, secret, network.fetch);
    if (!result.ok) {
      setCheck(result);
      return;
    }
    appliedCount.current += 1;
    setApplied({
      id: appliedCount.current,
      mode,
      secret,
      baseUrl,
      environment,
      ...(result.grant !== undefined ? { firstGrant: result.grant } : {}),
    });
    setCheck(null);
    setAnnounced(result.message);
    setConnectOpen(false);
    connectToggle.current?.focus();
    // The result joins the section once it has folded: arriving with the
    // fold, it would make the section grow just as it starts to shrink.
    window.setTimeout(() => setCheck(result), FOLD_MS);
  };

  const filters: Filters | undefined = useMemo(() => {
    const f: Filters = {};
    if (person.trim()) f.person = { name: person.trim() };
    const codes = parseStates(states);
    if (codes.length > 0) f.state = codes;
    if (address.trim()) f.address = { text: address.trim() };
    return Object.keys(f).length > 0 ? f : undefined;
  }, [person, states, address]);
  const filterCount = [
    person.trim(),
    parseStates(states).join(""),
    address.trim(),
  ].filter(Boolean).length;

  const curl = `curl -s -X POST ${apiHost || PRODUCTION}/autocomplete/sessions \\
  -H "X-API-Key: $BASELAYER_API_KEY" \\
  -H "Origin: ${origin}" | jq -r .session_token`;

  const connectSummary =
    applied === null ? (
      "Not connected"
    ) : (
      <>
        <span className="fold-summary-text">
          {applied.mode === "key" ? "API key" : "Session token"} ·{" "}
          {ENVIRONMENT_LABELS[applied.environment]}
        </span>
        {client !== null && (
          <ConnectionIndicator client={client} applied={applied} />
        )}
      </>
    );

  const label = (
    <>
      {style.label}
      <span className="field-required" aria-hidden="true">
        *
      </span>
    </>
  );

  return (
    <main className="demo">
      <div className={`demo-intro ${debugOpen ? "wrap-wide" : "wrap"}`}>
        <p className="eyebrow">Live demo</p>
        <h1 className="display-sm">
          The typeahead, against your own organization
        </h1>
        <p className="lede">
          Configure the component and watch every request it makes, as it makes
          it. Every session this page mints is a real, billable session on your
          organization&apos;s pool.
        </p>
      </div>

      <div
        className={`demo-split ${debugOpen ? "wrap-wide" : "wrap"}`}
        data-debug={debugOpen ? "open" : "closed"}
      >
        <div className="demo-controls">
          <Collapsible
            num="01"
            title="Connect"
            icon="token"
            summary={connectSummary}
            open={connectOpen}
            onToggle={setConnectOpen}
            toggleRef={connectToggle}
            testId="demo-connect"
          >
            <Field label="Environment">
              <Select<Environment>
                value={environment}
                options={ENVIRONMENTS}
                labels={ENVIRONMENT_LABELS}
                onChange={setEnvironment}
              />
            </Field>
            {environment === "custom" && (
              <Field label="API URL">
                <input
                  value={customUrl}
                  onChange={e => setCustomUrl(e.target.value)}
                  placeholder="https://…"
                />
              </Field>
            )}
            <div className="tabs" role="tablist">
              <button
                role="tab"
                aria-selected={mode === "token"}
                onClick={() => {
                  setMode("token");
                  setDraft("");
                  setCheck(null);
                }}
              >
                Session token (recommended)
              </button>
              <button
                role="tab"
                aria-selected={mode === "key"}
                onClick={() => {
                  setMode("key");
                  setDraft("");
                  setCheck(null);
                }}
              >
                API key
              </button>
            </div>
            {mode === "token" ? (
              <>
                <p className="hint">
                  Mint a session from your terminal, bound to this page, and
                  paste it below. Your key never reaches the browser. A session
                  lasts a few minutes.
                </p>
                <pre className="demo-code">{curl}</pre>
                <Field label="Session token">
                  <textarea
                    value={draft}
                    onChange={e => {
                      setDraft(e.target.value);
                      setCheck(null);
                    }}
                    rows={3}
                    spellCheck={false}
                    placeholder="eyJhbGciOiJFZERTQSIs…"
                    data-testid="demo-token"
                  />
                </Field>
              </>
            ) : (
              <>
                <p className="warning">
                  Your key stays in this tab&apos;s memory and is sent only to{" "}
                  {environment === "dev-server" ? (
                    <>
                      this dev server, which forwards it to{" "}
                      <code>{PRODUCTION}</code>
                    </>
                  ) : (
                    <code>{apiHost || "the API"}</code>
                  )}
                  . It is not stored, and this page loads no third-party code.
                  In your product, the key belongs on your backend (
                  <code>@baselayer/autocomplete/server</code>).
                </p>
                <Field label="API key">
                  <input
                    type="password"
                    autoComplete="off"
                    value={draft}
                    onChange={e => {
                      setDraft(e.target.value);
                      setCheck(null);
                    }}
                    data-testid="demo-key"
                  />
                </Field>
              </>
            )}
            <div className="apply-row">
              <button
                type="button"
                className="btn btn-primary"
                disabled={draft.trim() === "" || isApplied}
                // Not `disabled` while testing: that would drop keyboard
                // focus to the page.
                aria-disabled={check === "testing" || undefined}
                onClick={() => {
                  if (check !== "testing") void apply();
                }}
                data-testid="demo-apply"
              >
                {check === "testing"
                  ? "Testing…"
                  : isApplied
                    ? "Applied"
                    : mode === "key"
                      ? "Apply API key"
                      : "Apply session token"}
              </button>
              <p className="hint apply-note">
                {mode === "key"
                  ? "Apply mints one session to test the key, and the demo uses it."
                  : "Apply checks the token with the tier; none of its request budget is spent."}
              </p>
            </div>
            {check !== null && check !== "testing" && (
              <p
                className="check"
                data-ok={check.ok ? "true" : "false"}
                role={check.ok ? undefined : "status"}
              >
                {check.message}
              </p>
            )}
          </Collapsible>
          <p className="visually-hidden" role="status">
            {announced}
          </p>

          <section className="demo-card" aria-labelledby="demo-business-title">
            <div className="demo-card-head">
              <h2 className="demo-card-title" id="demo-business-title">
                <span className="demo-num">02</span> Business
              </h2>
              <button
                type="button"
                className="link-toggle"
                aria-expanded={filtersOpen}
                aria-controls="demo-filters"
                onClick={() => setFiltersOpen(open => !open)}
              >
                {filterCount > 0 ? `Filters · ${filterCount}` : "+ Add filters"}
                <span
                  className="fold-chevron"
                  data-open={filtersOpen ? "true" : "false"}
                  aria-hidden="true"
                />
              </button>
            </div>
            <div
              id="demo-filters"
              className="filters-panel"
              hidden={!filtersOpen}
            >
              <p className="hint">
                Filters apply once the name is long enough to narrow by. Until
                then the SDK holds them back, and says so in the log.
              </p>
              <Field label="Officer or agent name" optional>
                <input
                  value={person}
                  onChange={e => setPerson(e.target.value)}
                  placeholder="frank"
                />
              </Field>
              <Field
                label="States"
                optional
                hint="Two-letter codes, separated by commas."
              >
                <input
                  value={states}
                  onChange={e => setStates(e.target.value)}
                  placeholder="PA, OH"
                />
              </Field>
              <Field label="Address" optional>
                <input
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  placeholder="2327 Hill Church"
                />
              </Field>
            </div>
            <div className="demo-preview">
              {previewCss(style) !== "" && <style>{previewCss(style)}</style>}
              {client === null ? (
                <div className="bl-ac">
                  <label
                    className="bl-ac-label"
                    htmlFor="demo-business-offline"
                  >
                    {label}
                  </label>
                  <input
                    id="demo-business-offline"
                    className={
                      style.pageInput ? "bl-ac-input demo-input" : "bl-ac-input"
                    }
                    disabled
                    placeholder="Connect first, then type a business name"
                  />
                </div>
              ) : (
                <>
                  <BusinessAutocomplete
                    key={applied?.id}
                    client={client}
                    id="demo-business"
                    label={label}
                    value={name}
                    onChange={value => {
                      setName(value);
                      if (picked !== null && value !== picked.suggestion.label)
                        setPicked(null);
                    }}
                    onPick={(suggestion, pick) =>
                      setPicked({ suggestion, pick })
                    }
                    look={{ ...changedLook(style) }}
                    limit={style.limit}
                    include={style.include}
                    minChars={style.minChars}
                    debounceMs={style.debounceMs}
                    prewarmOnFocus={style.prewarmOnFocus}
                    messages={style.messages}
                    unstyled={style.unstyled}
                    {...(style.pageInput
                      ? { classNames: { input: "demo-input" } }
                      : {})}
                    {...(filters !== undefined ? { filters } : {})}
                  />
                </>
              )}
            </div>
            {picked !== null && (
              <div className="demo-pick" data-testid="demo-pick">
                <p className="mono-label">The pick</p>
                <p>
                  <strong>{picked.suggestion.label}</strong>, domiciled in{" "}
                  {picked.suggestion.domicile_state}, registered in{" "}
                  {picked.suggestion.states.join(", ")}.
                </p>
                <p className="hint">
                  Send the token with your search; it is good until{" "}
                  {new Date(picked.pick.expiresAt).toLocaleTimeString()}.
                </p>
                <pre className="demo-code">{`POST ${apiHost}/searches
{
  "name": ${JSON.stringify(picked.suggestion.label)},
  "address": ${JSON.stringify(picked.suggestion.related.addresses.items[0]?.label ?? "")},
  "business_token": "${picked.pick.businessToken.slice(0, 24)}…"
}`}</pre>
              </div>
            )}
          </section>

          <Collapsible
            num="03"
            title="Styling"
            open={stylingOpen}
            onToggle={setStylingOpen}
            testId="demo-styling"
          >
            <StylingPanel state={style} onChange={setStyle} />
          </Collapsible>
        </div>

        {debugOpen ? (
          <aside
            className="demo-activity"
            id="demo-activity"
            aria-label="Debug"
          >
            <button
              type="button"
              className="debug-bar"
              aria-expanded="true"
              aria-controls="demo-activity"
              onClick={() => setDebugOpen(false)}
              data-testid="demo-debug-close"
            >
              <Icon name="bug" />
              <span>Debug</span>
              <span className="debug-bar-hide">Hide</span>
              <span
                className="fold-chevron"
                data-open="true"
                aria-hidden="true"
              />
            </button>
            <section className="activity-card" aria-labelledby="session-title">
              <div className="activity-head">
                <h2 id="session-title">Session</h2>
              </div>
              {client === null || applied === null ? (
                <p className="hint">Not connected.</p>
              ) : (
                <SessionMeters client={client} applied={applied} />
              )}
            </section>
            <NetworkTimeline log={network} />
            <section className="activity-card" aria-labelledby="log-title">
              <div className="activity-head">
                <h2 id="log-title">SDK log</h2>
                <p className="mono-label">newest first</p>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={clearLog}
                  disabled={log.length === 0}
                >
                  Clear
                </button>
              </div>
              <ol className="log" data-testid="demo-log">
                {log.length === 0 && <li className="hint">Nothing yet.</li>}
                {log.map(line => (
                  <li key={line.id} className={line.ok ? "ok" : "bad"}>
                    <span className="mono">{line.at}</span>{" "}
                    <span className="tag" data-kind={line.kind}>
                      {line.kind}
                    </span>{" "}
                    {line.text}
                  </li>
                ))}
              </ol>
            </section>
          </aside>
        ) : (
          <button
            type="button"
            className="debug-tab"
            aria-expanded="false"
            aria-controls="demo-activity"
            onClick={() => setDebugOpen(true)}
            data-testid="demo-debug-open"
          >
            <span className="debug-tab-icon">
              <Icon name="bug" />
              {unseenErrors && (
                <span
                  className="debug-tab-alert"
                  data-testid="demo-debug-alert"
                >
                  <span className="visually-hidden">New errors</span>
                </span>
              )}
            </span>
            <span className="debug-tab-label">Debug here</span>
            {requests > 0 && (
              <span className="debug-tab-count">{requests}</span>
            )}
          </button>
        )}
      </div>
    </main>
  );
}
