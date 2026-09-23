import {
  createAutocompleteClient,
  type AutocompleteClient,
  type BusinessSuggestion,
  type Filters,
  type Look,
  type MatchEmphasis,
  type MatchRegion,
} from "@baselayer/autocomplete";
import {
  BusinessAutocomplete,
  useAutocompleteSession,
  type Pick,
} from "@baselayer/autocomplete/react";
import { useEffect, useMemo, useState } from "react";

import { keyMint, readClaims, tokenMint } from "./credentials";

const ENVIRONMENTS = {
  production: "https://api.baselayer.com",
  staging: "https://api.staging.baselayer.com",
} as const;
type Environment = keyof typeof ENVIRONMENTS | "custom";
type Mode = "token" | "key";

interface LogLine {
  at: string;
  kind: "mint" | "request";
  text: string;
  ok: boolean;
}

function clock(): string {
  return new Date().toLocaleTimeString([], { hour12: false });
}

function useClient(baseUrl: string, mode: Mode, secret: string) {
  return useMemo(() => {
    if (secret.trim().length === 0) {
      return null;
    }
    const mint =
      mode === "key" ? keyMint(baseUrl, secret.trim()) : tokenMint(secret);
    return createAutocompleteClient({ baseUrl, mint });
  }, [baseUrl, mode, secret]);
}

function useLog(client: AutocompleteClient | null): LogLine[] {
  const [lines, setLines] = useState<LogLine[]>([]);
  useEffect(() => {
    setLines([]);
    if (client === null) {
      return;
    }
    const push = (line: LogLine) =>
      setLines(previous => [line, ...previous].slice(0, 40));
    const offMint = client.on("mint", event => {
      const outcome = event.outcome;
      push({
        at: clock(),
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
        at: clock(),
        kind: "request",
        ok: event.error === null,
        text:
          event.error === null
            ? `"${event.q}" → ${event.status} in ${event.roundTripMs} ms${event.recovery !== "none" ? ` after ${event.recovery}` : ""}${event.filtersWithheld ? ", filters held back" : ""}`
            : `"${event.q}" → ${event.error.kind}: ${event.error.message}`,
      });
    });
    return () => {
      offMint();
      offRequest();
      client.reset();
    };
  }, [client]);
  return lines;
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
        <dd data-testid="demo-phase">{session.phase}</dd>
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

export function App() {
  const [environment, setEnvironment] = useState<Environment>("staging");
  const [customUrl, setCustomUrl] = useState("");
  const [mode, setMode] = useState<Mode>("token");
  const [secret, setSecret] = useState("");
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<{
    suggestion: BusinessSuggestion;
    pick: Pick;
  } | null>(null);
  const [emphasis, setEmphasis] = useState<MatchEmphasis>("underline");
  const [region, setRegion] = useState<MatchRegion>("token");
  const [debug, setDebug] = useState(true);
  const [person, setPerson] = useState("");
  const [state, setState] = useState("");

  const baseUrl =
    environment === "custom"
      ? customUrl.replace(/\/+$/, "")
      : ENVIRONMENTS[environment];
  const client = useClient(baseUrl, mode, secret);
  const log = useLog(client);
  const origin = typeof location === "undefined" ? "" : location.origin;
  const claims = mode === "token" ? readClaims(secret) : null;

  const filters: Filters | undefined = useMemo(() => {
    const f: Filters = {};
    if (person.trim()) f.person = { name: person.trim() };
    if (state.trim())
      f.state = state
        .split(",")
        .map(s => s.trim().toUpperCase())
        .filter(Boolean);
    return Object.keys(f).length > 0 ? f : undefined;
  }, [person, state]);

  const look: Partial<Look> = {
    matchEmphasis: emphasis,
    matchEmphasisRegion: region,
    showDebugInfo: debug,
  };

  const curl = `curl -s -X POST ${baseUrl || "https://api.baselayer.com"}/autocomplete/sessions \\
  -H "X-API-Key: $BASELAYER_API_KEY" \\
  -H "Origin: ${origin}" | jq -r .session_token`;

  return (
    <div className="page">
      <header>
        <h1>Baselayer autocomplete</h1>
        <p>
          The <code>@baselayer/autocomplete</code> typeahead against your own
          organization. Every session this page mints is a real, billable
          session on your organization&apos;s pool.
        </p>
      </header>

      <section className="panel">
        <h2>1. Connect</h2>
        <div className="row">
          <label>
            Environment
            <select
              value={environment}
              onChange={e => setEnvironment(e.target.value as Environment)}
            >
              <option value="staging">
                Staging (api.staging.baselayer.com)
              </option>
              <option value="production">Production (api.baselayer.com)</option>
              <option value="custom">Custom URL</option>
            </select>
          </label>
          {environment === "custom" && (
            <label>
              API URL
              <input
                value={customUrl}
                onChange={e => setCustomUrl(e.target.value)}
                placeholder="https://…"
              />
            </label>
          )}
        </div>
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
              Mint a session from your terminal, bound to this page, and paste
              it below. Your key never reaches the browser. A session lasts a
              few minutes.
            </p>
            <pre className="code">{curl}</pre>
            <label>
              Session token
              <textarea
                value={secret}
                onChange={e => setSecret(e.target.value)}
                rows={3}
                spellCheck={false}
                placeholder="eyJhbGciOiJFZERTQSIs…"
                data-testid="demo-token"
              />
            </label>
            {claims !== null && (
              <p className="hint">
                Expires {new Date(claims.exp * 1000).toLocaleTimeString()},{" "}
                {claims.bud} requests, filters from {claims.stem} characters,
                bound to {claims.ori ?? "any origin"}.
              </p>
            )}
          </>
        ) : (
          <>
            <p className="warning">
              Your key stays in this tab&apos;s memory and is sent only to{" "}
              <code>{baseUrl || "the API"}</code>. It is not stored, and this
              page loads no third-party code. In your product, the key belongs
              on your backend (<code>@baselayer/autocomplete/server</code>).
            </p>
            <label>
              API key
              <input
                type="password"
                autoComplete="off"
                value={secret}
                onChange={e => setSecret(e.target.value)}
                data-testid="demo-key"
              />
            </label>
          </>
        )}
      </section>

      <section className="panel">
        <h2>2. Type a business name</h2>
        {client === null ? (
          <p className="hint">Connect first.</p>
        ) : (
          <div className="field">
            <BusinessAutocomplete
              key={`${baseUrl}|${mode}|${secret}`}
              client={client}
              id="demo-business"
              label="Legal entity name"
              value={name}
              onChange={value => {
                setName(value);
                if (picked !== null && value !== picked.suggestion.label)
                  setPicked(null);
              }}
              onPick={(suggestion, pick) => setPicked({ suggestion, pick })}
              look={look}
              {...(filters !== undefined ? { filters } : {})}
            />
          </div>
        )}
        <details>
          <summary>Look and filters</summary>
          <div className="row">
            <label>
              Match emphasis
              <select
                value={emphasis}
                onChange={e => setEmphasis(e.target.value as MatchEmphasis)}
              >
                {["underline", "background", "weight", "ink", "plain"].map(
                  v => (
                    <option key={v}>{v}</option>
                  ),
                )}
              </select>
            </label>
            <label>
              Match region
              <select
                value={region}
                onChange={e => setRegion(e.target.value as MatchRegion)}
              >
                <option>token</option>
                <option>substring</option>
              </select>
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={debug}
                onChange={e => setDebug(e.target.checked)}
              />
              Round trip and index in the footer
            </label>
          </div>
          <div className="row">
            <label>
              Officer or agent name
              <input
                value={person}
                onChange={e => setPerson(e.target.value)}
                placeholder="frank"
              />
            </label>
            <label>
              States
              <input
                value={state}
                onChange={e => setState(e.target.value)}
                placeholder="PA, OH"
              />
            </label>
          </div>
          <p className="hint">
            Filters wait until the name is as long as the session allows (5
            characters by default); below that they are held back.
          </p>
        </details>
      </section>

      {picked !== null && (
        <section className="panel" data-testid="demo-pick">
          <h2>3. The pick</h2>
          <p>
            <strong>{picked.suggestion.label}</strong>, domiciled in{" "}
            {picked.suggestion.domicile_state}, registered in{" "}
            {picked.suggestion.states.join(", ")}.
          </p>
          <p className="hint">
            Send the token with your search; it is good until{" "}
            {new Date(picked.pick.expiresAt).toLocaleTimeString()}.
          </p>
          <pre className="code">{`POST ${baseUrl}/searches
{
  "name": ${JSON.stringify(picked.suggestion.label)},
  "address": ${JSON.stringify(picked.suggestion.related.addresses.items[0]?.label ?? "")},
  "business_token": "${picked.pick.businessToken.slice(0, 24)}…"
}`}</pre>
        </section>
      )}

      {client !== null && (
        <section className="panel">
          <h2>What the SDK did</h2>
          <SessionMeters client={client} />
          <ol className="log" data-testid="demo-log">
            {log.length === 0 && <li className="hint">Nothing yet.</li>}
            {log.map((line, index) => (
              <li key={index} className={line.ok ? "ok" : "bad"}>
                <span className="mono">{line.at}</span>{" "}
                <span className="tag">{line.kind}</span> {line.text}
              </li>
            ))}
          </ol>
        </section>
      )}

      <footer>
        <a href="https://github.com/osiris-ratings/baselayer-autocomplete-typescript">
          Source and docs
        </a>
      </footer>
    </div>
  );
}
