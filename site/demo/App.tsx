import {
  createAutocompleteClient,
  includeForParts,
  type AutocompleteClient,
  type BusinessSuggestion,
  type Filters,
  type SessionPhase,
} from "@baselayer-sdk/autocomplete";
import {
  BusinessAutocomplete,
  BusinessAutocompleteView,
  useAutocompleteSession,
  type Pick,
} from "@baselayer-sdk/autocomplete/react";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { flushSync } from "react-dom";

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
import { NetworkCount, NetworkTimeline } from "./NetworkTimeline";
import {
  INITIAL_STYLE,
  changedLook,
  previewCss,
  type StyleState,
} from "./style-state";
import { morph } from "./morph";
import { SAMPLE_META, SAMPLE_QUERY, sampleRows } from "./sample";
import { searchExample } from "./search";
import { StylingPanel } from "./StylingPanel";

const PRODUCTION = "https://api.baselayer.com";
/**
 * `pnpm demo` forwards this path to production (site/vite.config.ts). The
 * published page is static, so it has no server to forward through.
 */
const DEV_SERVER_PATH = import.meta.env.DEV ? "/_baselayer" : null;
type Environment = "dev-server" | "production" | "custom";
type Mode = "token" | "key";
/** What the right of the page shows, if anything: one or the other. */
type Panel = "debug" | "styling";
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

type DebugTab = "network" | "session" | "log";

const DEBUG_TABS: { tab: DebugTab; label: string }[] = [
  { tab: "network", label: "Network" },
  { tab: "session", label: "Session" },
  { tab: "log", label: "SDK log" },
];

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
            ? `${event.reason} mint: ${outcome.grant.expiresIn} s${outcome.grant.expiresAtUtc !== undefined ? ` (until ${new Date(outcome.grant.expiresAtUtc).toLocaleTimeString()})` : ""}, ${outcome.grant.requestBudget} requests, ${event.durationMs} ms`
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
  // The held grant's expiry as the API stated it, when it did.
  const expiresAtUtc =
    session.phase === "ready" ? session.grant.expiresAtUtc : undefined;
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
            {expiresAtUtc !== undefined && (
              <span className="meter-note">
                at {new Date(expiresAtUtc).toLocaleTimeString()}
              </span>
            )}
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

/**
 * How many characters of the business name the filters wait for: the
 * session's `filter_min_stem`, from the held grant or, before the SDK has
 * used a pasted token, from the token itself.
 */
function FilterStem({
  client,
  applied,
}: {
  client: AutocompleteClient;
  applied: Applied;
}) {
  const { snapshot } = useAutocompleteSession(client);
  const session = snapshot.session;
  const stem =
    session.phase === "ready"
      ? session.grant.filterMinStem
      : applied.mode === "token"
        ? (readClaims(applied.secret)?.stem ?? null)
        : null;
  return (
    <>
      {stem === null ? "enough characters to narrow by" : `${stem} characters`}
    </>
  );
}

/** Folded Connect's far right: a dot for the connection and its timer. */
function ConnectionIndicator({
  client,
  applied,
  dotOnly = false,
}: {
  client: AutocompleteClient;
  applied: Applied;
  /** Only the dot, its state spelled out for screen readers (Debug's tab). */
  dotOnly?: boolean;
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
  if (dotOnly) {
    return (
      <span className="connection" data-state={status.state}>
        <span className="connection-dot" aria-hidden="true" />
        <span className="visually-hidden">{status.label}</span>
      </span>
    );
  }
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
  const [mode, setMode] = useState<Mode>("key");
  const [draft, setDraft] = useState("");
  const [applied, setApplied] = useState<Applied | null>(null);
  const [check, setCheck] = useState<CheckResult | "testing" | null>(null);
  // A successful check, for screen readers: the section it would show in is
  // folded away (and inert) by the same click.
  const [announced, setAnnounced] = useState("");
  const appliedCount = useRef(0);
  const [connectOpen, setConnectOpen] = useState(true);
  const connectToggle = useRef<HTMLButtonElement>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [panel, setPanelState] = useState<Panel | null>(null);
  const [introOpen, setIntroOpen] = useState(true);
  // Opening either side pane folds the introduction, to give the pane room;
  // opening Styling folds Connect too, so the eye goes to the component.
  const setPanel = (next: Panel | null) => {
    setPanelState(next);
    if (next !== null) setIntroOpen(false);
    if (next === "styling") setConnectOpen(false);
  };
  // The side tab a pane grows out of, and folds back into.
  const [lastPanel, setLastPanel] = useState<Panel>("debug");
  // Every change of the panes morphs (./morph): a pane out of its tab, its
  // label turning from the tab's spine into the pane's head, and back.
  const openSide = (next: Panel) => {
    // The tab it grows out of carries the pane's name before the morph.
    flushSync(() => setLastPanel(next));
    morph(() => setPanel(next), {
      side: "open",
      ...(introOpen ? { intro: "close" as const } : {}),
    });
  };
  const switchSide = (next: Panel) =>
    morph(() => {
      setLastPanel(next);
      setPanel(next);
    });
  const hideSide = () => morph(() => setPanel(null), { side: "close" });
  const showIntro = (open: boolean) =>
    morph(() => setIntroOpen(open), { intro: open ? "open" : "close" });
  const debugOpen = panel === "debug";
  const styling = panel === "styling";
  // Debug keeps its tab while Styling is up.
  const [debugTab, setDebugTab] = useState<DebugTab>("network");
  const debugTabsId = useId();
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<{
    suggestion: BusinessSuggestion;
    pick: Pick;
  } | null>(null);
  const [person, setPerson] = useState("");
  const [states, setStates] = useState("");
  const [address, setAddress] = useState("");
  const [style, setStyle] = useState<StyleState>(INITIAL_STYLE);

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
      {/* Three panes, each scrolling on its own: the introduction, which folds
          to a tab; the controls; and Debug or Styling, or their tabs. */}
      <div
        className={`demo-panes ${panel !== null ? "wrap-wide" : "wrap"}`}
        data-intro={introOpen ? "open" : "folded"}
        data-side={panel !== null ? "open" : "closed"}
      >
        {introOpen ? (
          <section
            className="demo-pane demo-intro"
            id="demo-intro"
            aria-labelledby="demo-title"
          >
            <div className="demo-intro-head" data-vt="intro-head">
              <p className="eyebrow">Live demo</p>
              <button
                type="button"
                className="side-hide"
                aria-expanded="true"
                aria-controls="demo-intro"
                onClick={() => showIntro(false)}
                data-testid="demo-intro-close"
              >
                Hide
                <span
                  className="fold-chevron"
                  data-open="true"
                  aria-hidden="true"
                />
              </button>
            </div>
            <div className="demo-intro-body" data-vt="intro-body">
              <h1 className="display-sm" id="demo-title">
                The typeahead, against your own organization
              </h1>
              <p className="lede">
                Configure the component and watch every request it makes, as it
                makes it. Every session this page mints is a real, billable
                session on your organization&apos;s pool.
              </p>
            </div>
          </section>
        ) : (
          <div className="pane-rail">
            <h1 className="visually-hidden">
              The typeahead, against your own organization
            </h1>
            <button
              type="button"
              className="side-tab"
              aria-expanded="false"
              aria-controls="demo-intro"
              onClick={() => showIntro(true)}
              data-testid="demo-intro-open"
              data-vt="intro-head"
            >
              <Icon name="info" />
              <span className="side-tab-label">Live demo</span>
            </button>
          </div>
        )}

        <div className="demo-pane demo-controls" data-vt="controls-pane">
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
                aria-selected={mode === "key"}
                onClick={() => {
                  setMode("key");
                  setDraft("");
                  setCheck(null);
                }}
              >
                API key
              </button>
              <button
                role="tab"
                aria-selected={mode === "token"}
                onClick={() => {
                  setMode("token");
                  setDraft("");
                  setCheck(null);
                }}
              >
                Session token
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
                  <code>@baselayer-sdk/autocomplete/server</code>).
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
                <span className="demo-num">02</span> Try autocomplete here
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
              <p className="hint" data-testid="demo-filters-hint">
                Filters apply once the business name has{" "}
                {client === null || applied === null ? (
                  "enough characters to narrow by"
                ) : (
                  <FilterStem client={client} applied={applied} />
                )}
                . Until then the SDK holds them back, and says so in the log.
              </p>
              <Field label="Officer or agent name" optional>
                <input
                  value={person}
                  onChange={e => setPerson(e.target.value)}
                  placeholder="dana"
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
                  placeholder="1200 River Rd"
                />
              </Field>
            </div>
            <div
              className="demo-preview"
              data-held={styling ? "true" : "false"}
            >
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
                    minChars={style.minChars}
                    debounceMs={style.debounceMs}
                    mintOn={style.mintOn}
                    menuFollowsInputWidth={style.menuFollowsInputWidth}
                    messages={style.messages}
                    unstyled={style.unstyled}
                    open={styling}
                    parts={style.parts}
                    {...(style.pageInput
                      ? { classNames: { input: "demo-input" } }
                      : {})}
                    {...(filters !== undefined ? { filters } : {})}
                  />
                </>
              )}
              {styling && name.trim() === "" && (
                <>
                  {/* Sample rows under the empty field, drawn by the same view
                      the live component uses, so every knob shows on them. */}
                  <div className="demo-sample" aria-hidden="true">
                    <BusinessAutocompleteView
                      id="demo-sample"
                      value={SAMPLE_QUERY}
                      onInputChange={() => {}}
                      onSelect={() => {}}
                      renderInput={inputProps => (
                        <input {...inputProps} hidden tabIndex={-1} />
                      )}
                      suggestions={sampleRows({
                        limit: style.limit,
                        include: includeForParts(style.parts),
                      })}
                      found={SAMPLE_META.found}
                      foundCapped={false}
                      truncated={false}
                      indexTag={SAMPLE_META.indexTag}
                      roundTripMs={SAMPLE_META.roundTripMs}
                      isSearching={false}
                      error={null}
                      open
                      look={{ ...changedLook(style) }}
                      messages={style.messages}
                      unstyled={style.unstyled}
                      parts={style.parts}
                      menuFollowsInputWidth={style.menuFollowsInputWidth}
                    />
                  </div>
                  <p className="hint demo-sample-note">
                    Sample rows for &ldquo;{SAMPLE_QUERY}&rdquo; while Styling
                    is open.{" "}
                    {client === null
                      ? "Connect and type a name to see real ones."
                      : "Type a name to see real ones."}
                  </p>
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
                <pre className="demo-code">
                  {searchExample(apiHost, picked.pick.businessToken)}
                </pre>
              </div>
            )}
          </section>
        </div>

        {panel === null ? (
          <div className="side-rail">
            <button
              type="button"
              className="side-tab"
              aria-expanded="false"
              aria-controls="demo-side"
              onClick={() => openSide("debug")}
              data-testid="demo-debug-open"
              data-vt={lastPanel === "debug" ? "side-head" : "side-tab"}
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
              <span className="side-tab-label">Debug here</span>
              {requests > 0 && (
                <span className="debug-tab-count">{requests}</span>
              )}
            </button>
            <button
              type="button"
              className="side-tab"
              aria-expanded="false"
              aria-controls="demo-side"
              onClick={() => openSide("styling")}
              data-testid="demo-styling-open"
              data-vt={lastPanel === "styling" ? "side-head" : "side-tab"}
            >
              <Icon name="palette" />
              <span className="side-tab-label">Style here</span>
            </button>
          </div>
        ) : (
          <aside
            className="demo-pane demo-activity"
            id="demo-side"
            aria-label={debugOpen ? "Debug" : "Styling"}
          >
            <div className="side-head" data-vt="side-head">
              <div className="side-switch" role="group" aria-label="Show">
                <button
                  type="button"
                  aria-pressed={debugOpen}
                  onClick={() => switchSide("debug")}
                  data-testid="demo-switch-debug"
                >
                  <span className="debug-tab-icon">
                    <Icon name="bug" size={18} />
                    {unseenErrors && (
                      <span className="debug-tab-alert">
                        <span className="visually-hidden">New errors</span>
                      </span>
                    )}
                  </span>
                  Debug
                </button>
                <button
                  type="button"
                  aria-pressed={styling}
                  onClick={() => switchSide("styling")}
                  data-testid="demo-switch-styling"
                >
                  <Icon name="palette" size={18} />
                  Styling
                </button>
              </div>
              <button
                type="button"
                className="side-hide"
                aria-expanded="true"
                aria-controls="demo-side"
                onClick={hideSide}
                data-testid="demo-side-close"
              >
                Hide
                <span
                  className="fold-chevron"
                  data-open="true"
                  aria-hidden="true"
                />
              </button>
            </div>
            <div
              className="side-body"
              data-vt="side-body"
              data-panel={debugOpen ? "debug" : "styling"}
            >
              {debugOpen ? (
                <section
                  className="activity-card debug-card"
                  aria-label="Debug"
                >
                  <div className="tabs debug-tabs" role="tablist">
                    {DEBUG_TABS.map(({ tab, label }) => (
                      <button
                        key={tab}
                        type="button"
                        role="tab"
                        id={`${debugTabsId}-${tab}`}
                        aria-selected={debugTab === tab}
                        aria-controls={`${debugTabsId}-panel`}
                        onClick={() => setDebugTab(tab)}
                        data-testid={`demo-debug-tab-${tab}`}
                      >
                        {label}
                        {tab === "network" && <NetworkCount log={network} />}
                        {tab === "session" &&
                          client !== null &&
                          applied !== null && (
                            <ConnectionIndicator
                              client={client}
                              applied={applied}
                              dotOnly
                            />
                          )}
                        {tab === "log" && log.length > 0 && (
                          <span className="debug-count">{log.length}</span>
                        )}
                      </button>
                    ))}
                  </div>
                  <div
                    className="debug-panel"
                    role="tabpanel"
                    id={`${debugTabsId}-panel`}
                    aria-labelledby={`${debugTabsId}-${debugTab}`}
                  >
                    {debugTab === "network" && (
                      <NetworkTimeline log={network} />
                    )}
                    {debugTab === "session" &&
                      (client === null || applied === null ? (
                        <p className="hint" data-testid="demo-session">
                          Not connected.
                        </p>
                      ) : (
                        <div data-testid="demo-session">
                          <div className="debug-toolbar">
                            <ConnectionIndicator
                              client={client}
                              applied={applied}
                            />
                          </div>
                          <SessionMeters client={client} applied={applied} />
                        </div>
                      ))}
                    {debugTab === "log" && (
                      <div data-testid="demo-log-card">
                        <div className="debug-toolbar">
                          <span className="mono-label">
                            {log.length === 0
                              ? "nothing yet"
                              : `${log.length} ${log.length === 1 ? "entry" : "entries"}, newest first`}
                          </span>
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
                          {log.length === 0 && (
                            <li className="hint">Nothing yet.</li>
                          )}
                          {log.map(line => (
                            <li
                              key={line.id}
                              className={line.ok ? "ok" : "bad"}
                            >
                              <span className="mono">{line.at}</span>{" "}
                              <span className="tag" data-kind={line.kind}>
                                {line.kind}
                              </span>{" "}
                              {line.text}
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}
                  </div>
                </section>
              ) : (
                <section
                  className="activity-card"
                  aria-label="Styling"
                  data-testid="demo-styling"
                >
                  <StylingPanel state={style} onChange={setStyle} />
                </section>
              )}
            </div>
          </aside>
        )}
      </div>
    </main>
  );
}
