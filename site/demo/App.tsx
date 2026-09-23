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
import { useEffect, useMemo, useRef, useState } from "react";

import { Collapsible, Field, Fold, Select } from "./controls";
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
  kind: "mint" | "request" | "session";
  text: string;
  ok: boolean;
}

function clock(): string {
  return new Date().toLocaleTimeString([], { hour12: false });
}

function useClient(
  baseUrl: string,
  mode: Mode,
  secret: string,
  network: NetworkLog,
) {
  return useMemo(() => {
    if (secret.trim().length === 0) {
      return null;
    }
    const mint =
      mode === "key"
        ? keyMint(baseUrl, secret.trim(), network.fetch)
        : tokenMint(secret);
    return createAutocompleteClient({ baseUrl, mint, fetch: network.fetch });
  }, [baseUrl, mode, secret, network]);
}

function useLog(client: AutocompleteClient | null): [LogLine[], () => void] {
  const [lines, setLines] = useState<LogLine[]>([]);
  const next = useRef(1);
  useEffect(() => {
    setLines([]);
    if (client === null) {
      return;
    }
    const push = (line: Omit<LogLine, "id" | "at">) =>
      setLines(previous =>
        [{ ...line, id: next.current++, at: clock() }, ...previous].slice(
          0,
          80,
        ),
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

function SessionMeters({ client }: { client: AutocompleteClient }) {
  const { snapshot } = useAutocompleteSession(client);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const session = snapshot.session;
  const usage = snapshot.usage;
  return (
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
          {usage.requestBudget !== null ? ` / ${usage.requestBudget}` : ""}
        </dd>
      </div>
      <div>
        <dt>Expires in</dt>
        <dd>
          {session.phase === "ready"
            ? `${Math.max(0, Math.round((session.grant.expiresAt - now) / 1000))} s`
            : session.phase === "backoff" || session.phase === "unavailable"
              ? `waiting ${Math.max(0, Math.round((session.until - now) / 1000))} s`
              : "–"}
        </dd>
      </div>
      <div>
        <dt>Index</dt>
        <dd className="mono">{snapshot.lastIndexTag ?? "–"}</dd>
      </div>
    </dl>
  );
}

/** Reports the session's phase to the page, for the Connect panel. */
function PhaseWatcher({
  client,
  onPhase,
}: {
  client: AutocompleteClient;
  onPhase(phase: PhaseName): void;
}) {
  const { snapshot } = useAutocompleteSession(client);
  const phase = snapshot.session.phase;
  useEffect(() => onPhase(phase), [phase, onPhase]);
  return null;
}

function parseStates(text: string): string[] {
  return text
    .split(/[\s,]+/)
    .map(s => s.trim().toUpperCase())
    .filter(s => /^[A-Z]{2}$/.test(s));
}

export function App() {
  const network = useMemo(() => new NetworkLog(), []);
  const [environment, setEnvironment] = useState<Environment>(ENVIRONMENTS[0]!);
  const [customUrl, setCustomUrl] = useState("");
  const [mode, setMode] = useState<Mode>("token");
  const [secret, setSecret] = useState("");
  const [connectOpen, setConnectOpen] = useState(true);
  const [stylingOpen, setStylingOpen] = useState(true);
  const [phase, setPhase] = useState<PhaseName | null>(null);
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
  const client = useClient(baseUrl, mode, secret, network);
  const [log, clearLog] = useLog(client);
  const claims = mode === "token" ? readClaims(secret) : null;

  // Fold Connect away once, when a session first lands; reopening is the reader's call.
  const folded = useRef<AutocompleteClient | null>(null);
  useEffect(() => {
    if (client !== null && phase === "ready" && folded.current !== client) {
      folded.current = client;
      setConnectOpen(false);
    }
  }, [client, phase]);

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

  const connectSummary = (
    <>
      {mode === "key" ? "API key" : "Session token"} ·{" "}
      {ENVIRONMENT_LABELS[environment]}
      {phase !== null && client !== null && (
        <span className="phase-pill" data-phase={phase}>
          {phase}
        </span>
      )}
    </>
  );

  return (
    <main className="demo">
      <div className="demo-intro wrap-wide">
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

      <div className="demo-split wrap-wide">
        <div className="demo-controls">
          <Collapsible
            num="01"
            title="Connect"
            icon="token"
            summary={connectSummary}
            open={connectOpen}
            onToggle={setConnectOpen}
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
                  setSecret("");
                }}
              >
                Session token (recommended)
              </button>
              <button
                role="tab"
                aria-selected={mode === "key"}
                onClick={() => {
                  setMode("key");
                  setSecret("");
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
                    value={secret}
                    onChange={e => setSecret(e.target.value)}
                    rows={3}
                    spellCheck={false}
                    placeholder="eyJhbGciOiJFZERTQSIs…"
                    data-testid="demo-token"
                  />
                </Field>
                {claims !== null && (
                  <p className="hint">
                    Expires {new Date(claims.exp * 1000).toLocaleTimeString()},{" "}
                    {claims.bud} requests, filters from {claims.stem}{" "}
                    characters, bound to {claims.ori ?? "any origin"}.
                  </p>
                )}
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
                    value={secret}
                    onChange={e => setSecret(e.target.value)}
                    data-testid="demo-key"
                  />
                </Field>
              </>
            )}
          </Collapsible>

          <section className="demo-card" aria-labelledby="demo-business-title">
            <h2 className="demo-card-title" id="demo-business-title">
              <span className="demo-num">02</span> Business
            </h2>
            <Fold
              title="Filters"
              summary={filterCount === 0 ? "none" : `${filterCount} set`}
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
            </Fold>
            <div className="demo-preview">
              {previewCss(style) !== "" && <style>{previewCss(style)}</style>}
              {client === null ? (
                <p className="hint">Connect first.</p>
              ) : (
                <>
                  <PhaseWatcher client={client} onPhase={setPhase} />
                  <BusinessAutocomplete
                    key={`${baseUrl}|${mode}|${secret}`}
                    client={client}
                    id="demo-business"
                    label={
                      <>
                        {style.label}
                        <span className="field-required" aria-hidden="true">
                          *
                        </span>
                      </>
                    }
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

        <aside className="demo-activity" aria-label="What the SDK did">
          <section className="activity-card" aria-labelledby="session-title">
            <div className="activity-head">
              <h2 id="session-title">Session</h2>
            </div>
            {client === null ? (
              <p className="hint">Not connected.</p>
            ) : (
              <SessionMeters client={client} />
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
      </div>
    </main>
  );
}
