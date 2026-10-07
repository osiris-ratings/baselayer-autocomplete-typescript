import {
  DEFAULT_SESSION_SCOPE,
  ROUTE_NAMES,
  allowedFilters,
  createAutocompleteClient,
  includeForLayout,
  offeredRoutes,
  pickedNameOf,
  type AddressesFilters,
  type AutocompleteClient,
  type BusinessPick,
  type Filters,
  type PeopleFilters,
  type Route,
  type SessionPhase,
  type SessionScope,
} from "@baselayer-sdk/autocomplete";
import {
  AddressAutocomplete,
  AddressAutocompleteView,
  BusinessAutocomplete,
  BusinessAutocompleteView,
  PersonAutocomplete,
  PersonAutocompleteView,
  useAutocompleteSession,
} from "@baselayer-sdk/autocomplete/react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { flushSync } from "react-dom";

import { Icon } from "../shared/icons";
import { useNow } from "./clock";
import { testKey, withFirstGrant, type CheckResult } from "./connect";
import { connectionStatus, formatRemaining } from "./connection";
import { Collapsible, FOLD_MS, Field, Select } from "./controls";
import { keyMint, readClaims } from "./credentials";
import { useExit } from "./exit";
import { useFocusWithin } from "./focus";
import { pickFromRow, pickThrough, type PickToSearch } from "./search-view";
import { NetworkLog } from "./network";
import { NetworkCount, NetworkTimeline } from "./NetworkTimeline";
import {
  INITIAL_STYLE,
  changedLook,
  previewCss,
  type StyleState,
} from "./style-state";
import { morph } from "./morph";
import {
  SAMPLE_ADDRESSES,
  SAMPLE_ADDRESSES_QUERY,
  SAMPLE_META,
  SAMPLE_PEOPLE,
  SAMPLE_PEOPLE_QUERY,
  SAMPLE_QUERY,
  sampleRows,
} from "./sample";
import { SearchStep } from "./SearchStep";
import { SearchTitle } from "./SearchTitle";
import { StylingPanel } from "./StylingPanel";

const PRODUCTION = "https://api.baselayer.com";
/**
 * `pnpm demo` forwards this path to production (site/vite.config.ts). The
 * published page is static, so it has no server to forward through.
 */
const DEV_SERVER_PATH = import.meta.env.DEV ? "/_baselayer" : null;
type Environment = "dev-server" | "production" | "custom";
/** What the right of the page shows, if anything: one or the other. */
type Panel = "debug" | "styling";
/** The session's phase by name: idle, minting, ready, backoff or unavailable. */
type PhaseName = SessionPhase["phase"];

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
/** What the dev server forwards to, for the page to name: `sample` is made up. */
const DEV_SERVER_TARGET =
  typeof __DEMO_API__ === "undefined" ? PRODUCTION : __DEMO_API__;

const ENVIRONMENT_LABELS: Record<Environment, string> = {
  "dev-server":
    DEV_SERVER_TARGET === "sample"
      ? "Made-up data, from this dev server"
      : DEV_SERVER_TARGET.replace(/\/+$/, "") === PRODUCTION
        ? "Production, through this dev server"
        : `${DEV_SERVER_TARGET.replace(/^https?:\/\//, "").replace(/\/+$/, "")}, through this dev server`,
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

/** What Apply accepted: the key, where it goes, and the session its test minted. */
interface Applied {
  id: number;
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
    const mint = withFirstGrant(
      applied.firstGrant,
      keyMint(applied.baseUrl, applied.secret, network.fetch),
    );
    return createAutocompleteClient({
      baseUrl: applied.baseUrl,
      mint,
      fetch: network.fetch,
    });
  }, [applied, network]);
}

/**
 * What the connected session may search: its grant's scope, the first grant's
 * until one is held, and the default before any key is applied.
 */
function useSessionScope(
  client: AutocompleteClient | null,
  applied: Applied | null,
): SessionScope {
  const subscribe = useCallback(
    (onChange: () => void) =>
      client === null ? () => {} : client.on("stateChange", onChange),
    [client],
  );
  const phase = useSyncExternalStore(
    subscribe,
    () => client?.getSnapshot().session ?? null,
  );
  if (phase?.phase === "ready") {
    return phase.grant.scope;
  }
  return applied?.firstGrant?.grant.scope ?? DEFAULT_SESSION_SCOPE;
}

/** What the switch above the field calls each search. */
/** The field's label in each search but the business one, which Styling sets. */
const FIELD_LABELS: Record<Exclude<Route, "businesses">, string> = {
  people: "Person's name",
  addresses: "Address",
};

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
            ? `${event.relation} "${event.q}" → ${event.status} in ${event.roundTripMs} ms${event.recovery !== "none" ? ` after ${event.recovery}` : ""}${event.filtersWithheld ? ", filters held back" : ""}`
            : `${event.relation} "${event.q}" → ${event.error.kind}: ${event.error.message}`,
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
  const now = useNow();
  const session = snapshot.session;
  const usage = snapshot.usage;
  // What the held grant's token says.
  const token = session.phase === "ready" ? session.grant.sessionToken : null;
  const facts = token === null ? null : readClaims(token);
  const budget = usage.requestBudget ?? facts?.bud ?? null;
  const expiresAt = session.phase === "ready" ? session.grant.expiresAt : null;
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
                  ? "The autocomplete service answers this session only on pages from this origin."
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
                How often the name can be replaced by another before the
                autocomplete service wants a new session. Typing on, backspacing
                and fixing a typo are not changes.
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
 * session's `filter_min_stem`, from the held grant.
 */
function FilterStem({ client }: { client: AutocompleteClient }) {
  const { snapshot } = useAutocompleteSession(client);
  const session = snapshot.session;
  const stem = session.phase === "ready" ? session.grant.filterMinStem : null;
  return (
    <>
      {stem === null ? "enough characters to narrow by" : `${stem} characters`}
    </>
  );
}

/** Folded Connect's far right: a dot for the connection and its timer. */
function ConnectionIndicator({
  client,
  dotOnly = false,
}: {
  client: AutocompleteClient;
  /** Only the dot, its state spelled out for screen readers (Debug's tab). */
  dotOnly?: boolean;
}) {
  const { snapshot } = useAutocompleteSession(client);
  const now = useNow();
  const status = connectionStatus(snapshot.session, now);
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
  // Focus is in a filter field: the menu stays open as the filter is typed, so
  // the list narrowing is in view, rather than closing as the name loses focus.
  const [filtering, filterFocus] = useFocusWithin();
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
  // Debug on its network tab, from wherever the side pane stands.
  const showDebug = () => {
    setDebugTab("network");
    if (panel === null) openSide("debug");
    else if (panel === "styling") switchSide("debug");
  };
  const debugTabsId = useId();
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<{
    /** The business step 03 searches for. */
    toSearch: PickToSearch;
    /** What the pick wrote into the field: editing it lets the pick go. */
    fill: string;
  } | null>(null);
  // Which search the field runs.
  const [searchBy, setSearchBy] = useState<Route>("businesses");
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
  // The searches the session may offer, and the filters each may send: the
  // switch and the filter fields show nothing the session would refuse.
  const scope = useSessionScope(client, applied);
  // Before a key is applied there is no session to hold the switch to: it
  // offers every search, so Styling can preview each one's rows.
  const offered: Route[] =
    client === null ? [...ROUTE_NAMES] : offeredRoutes(scope);
  const mode: Route = offered.includes(searchBy) ? searchBy : "businesses";
  const allowed = new Set(
    allowedFilters(scope, mode).map(({ param }) => param),
  );

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
    applied.secret === draft.trim() &&
    applied.baseUrl === baseUrl;

  const apply = async () => {
    const secret = draft.trim();
    setCheck("testing");
    setAnnounced("");
    const result = await testKey(baseUrl, secret, network.fetch);
    if (!result.ok) {
      setCheck(result);
      return;
    }
    appliedCount.current += 1;
    setApplied({
      id: appliedCount.current,
      secret,
      baseUrl,
      environment,
      ...(result.grant !== undefined ? { firstGrant: result.grant } : {}),
    });
    // A pick's token belongs to the organization whose session received it:
    // after another key, the search for it would be refused.
    setPicked(null);
    setCheck(null);
    setAnnounced(result.message);
    setConnectOpen(false);
    connectToggle.current?.focus();
    // The result joins the section once it has folded: arriving with the
    // fold, it would make the section grow just as it starts to shrink.
    window.setTimeout(() => setCheck(result), FOLD_MS);
  };

  // One field per filter, read by the search that takes it: the officer and
  // address only by the business search, the states by all three (a
  // business's own, a person's businesses', an address's own).
  const showPerson = mode === "businesses" && allowed.has("person.name");
  const showAddress = mode === "businesses" && allowed.has("address.text");
  const showStates = allowed.has(
    mode === "people" ? "business.state" : "state",
  );
  const codes = useMemo(() => parseStates(states), [states]);
  const filters: Filters | undefined = useMemo(() => {
    const f: Filters = {};
    if (showPerson && person.trim()) f.person = { name: person.trim() };
    if (codes.length > 0) f.state = codes;
    if (showAddress && address.trim()) f.address = { text: address.trim() };
    return Object.keys(f).length > 0 ? f : undefined;
  }, [person, codes, address, showPerson, showAddress]);
  const peopleFilters: PeopleFilters | undefined = useMemo(
    () =>
      showStates && codes.length > 0
        ? { business: { state: codes } }
        : undefined,
    [codes, showStates],
  );
  const addressFilters: AddressesFilters | undefined = useMemo(
    () => (showStates && codes.length > 0 ? { state: codes } : undefined),
    [codes, showStates],
  );
  const filterCount = [
    showPerson ? person.trim() : "",
    showStates ? codes.join("") : "",
    showAddress ? address.trim() : "",
  ].filter(Boolean).length;

  // A business picked through a person or an address: the field keeps to the
  // search it was made in, with the person's or the address's name, the
  // component names the business under it, and step 03 searches for it with
  // the person or address it came through.
  const pickedThrough = (pick: BusinessPick) => {
    setPicked({
      toSearch: pickThrough(pick, {
        typed: name,
        asked: mode === "people" ? codes : [],
      }),
      fill:
        pick.through.route === "people"
          ? pick.through.person.label
          : pick.through.address.label,
    });
  };
  const editName = (value: string) => {
    setName(value);
    if (picked !== null && value !== picked.fill) setPicked(null);
  };

  // The third step is for the pick it was made from: when the name or a filter
  // changes the pick goes, and the step closes up before it is taken away. It
  // is kept whole while it does, with the key and the pick it ran under.
  const step = useMemo(
    () => (applied !== null && picked !== null ? { applied, picked } : null),
    [applied, picked],
  );
  const { shown: shownStep } = useExit(step, FOLD_MS);

  const connectSummary =
    applied === null ? (
      "Not connected"
    ) : (
      <>
        <span className="fold-summary-text">
          API key · {ENVIRONMENT_LABELS[applied.environment]}
        </span>
        {client !== null && <ConnectionIndicator client={client} />}
      </>
    );

  const label = (
    <>
      {mode === "businesses" ? style.label : FIELD_LABELS[mode]}
      <span className="field-required" aria-hidden="true">
        *
      </span>
    </>
  );
  // The strings and the structure flags, as one `messages`.
  const messages = { ...style.messages, structures: style.structures };

  return (
    <main className="demo">
      {/* Three panes, each scrolling on its own: the introduction, which folds
          to a tab; the controls; and Debug or Styling, or their tabs. */}
      <div
        className={`demo-panes ${panel !== null ? "wrap-wide" : "wrap"}`}
        data-intro={introOpen ? "open" : "folded"}
        data-side={panel !== null ? "open" : "closed"}
        data-panel={panel ?? undefined}
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
                The typeahead, against your own Baselayer account
              </h1>
              <p className="lede">
                Configure the component and watch every request it makes, as it
                makes it. Every session this page mints, and every search it
                runs, is real and billable on your organization.
              </p>
            </div>
          </section>
        ) : (
          <div className="pane-rail">
            <h1 className="visually-hidden">
              The typeahead, against your own Baselayer account
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
            <p className="warning">
              Your key stays in this tab&apos;s memory and is sent only to{" "}
              {environment === "dev-server" &&
              DEV_SERVER_TARGET === "sample" ? (
                <>this dev server, which answers with made-up data</>
              ) : environment === "dev-server" ? (
                <>
                  this dev server, which forwards it to{" "}
                  <code>{DEV_SERVER_TARGET.replace(/\/+$/, "")}</code>
                </>
              ) : (
                <code>{apiHost || "the API"}</code>
              )}
              . It is not stored, and this page loads no third-party code. In
              your product, the key belongs on your backend (
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
                    : "Apply API key"}
              </button>
              <p className="hint apply-note">
                Apply mints one session to test the key, and the demo uses it.
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
              <SearchTitle
                id="demo-business-title"
                panelId="demo-search-panel"
                routes={offered}
                route={mode}
                onRoute={setSearchBy}
              />
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
              {...filterFocus}
            >
              <p className="hint" data-testid="demo-filters-hint">
                Filters apply once the{" "}
                {mode === "businesses"
                  ? "business name"
                  : mode === "people"
                    ? "person's name"
                    : "address"}{" "}
                has{" "}
                {client === null ? (
                  "enough characters to narrow by"
                ) : (
                  <FilterStem client={client} />
                )}
                . Until then the SDK holds them back, and says so in the log. A
                filter narrows the list, and the row says which one it matched:
                the officer or the address is marked, a state on its flag.
              </p>
              {showPerson && (
                <Field label="Officer or agent name" optional>
                  <input
                    value={person}
                    onChange={e => {
                      setPerson(e.target.value);
                      setPicked(null);
                    }}
                    placeholder="dana"
                    autoComplete="off"
                  />
                </Field>
              )}
              {showStates && (
                <Field
                  label={
                    mode === "people" ? "Their businesses' states" : "States"
                  }
                  optional
                  hint="Two-letter codes, separated by commas."
                >
                  <input
                    value={states}
                    onChange={e => {
                      setStates(e.target.value);
                      setPicked(null);
                    }}
                    placeholder="PA, OH"
                    autoComplete="off"
                  />
                </Field>
              )}
              {showAddress && (
                <Field label="Address" optional>
                  <input
                    value={address}
                    onChange={e => {
                      setAddress(e.target.value);
                      setPicked(null);
                    }}
                    placeholder="1200 Tallowmere Rd"
                    autoComplete="off"
                  />
                </Field>
              )}
            </div>
            <div
              className="demo-preview"
              data-held={styling ? "true" : "false"}
              // The title's words switch what the field searches for.
              {...(offered.length > 1
                ? {
                    id: "demo-search-panel",
                    role: "tabpanel",
                    "aria-labelledby": `demo-business-title-tab-${mode}`,
                  }
                : {})}
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
                    placeholder={`Connect first, then type ${
                      mode === "businesses"
                        ? "a business name"
                        : mode === "people"
                          ? "a person's name"
                          : "an address"
                    }`}
                  />
                </div>
              ) : (
                <>
                  {mode === "businesses" ? (
                    <BusinessAutocomplete
                      key={`${applied?.id}:businesses`}
                      client={client}
                      id="demo-business"
                      label={label}
                      value={name}
                      onChange={editName}
                      onPick={(suggestion, pick) =>
                        setPicked({
                          toSearch: pickFromRow(
                            suggestion,
                            pick,
                            filters?.state ?? [],
                            // The field holds the pick's fill by now; the
                            // closure still holds what was typed to find it.
                            { name, person, address },
                          ),
                          fill: pickedNameOf(suggestion),
                        })
                      }
                      look={{ ...changedLook(style) }}
                      limit={style.limit}
                      minChars={style.minChars}
                      debounceMs={style.debounceMs}
                      mintOn={style.mintOn}
                      menuFollowsInputWidth={style.menuFollowsInputWidth}
                      messages={messages}
                      unstyled={style.unstyled}
                      open={styling || filtering}
                      layout={style.layout}
                      {...(style.pageInput
                        ? { classNames: { input: "demo-input" } }
                        : {})}
                      {...(filters !== undefined ? { filters } : {})}
                    />
                  ) : mode === "people" ? (
                    <PersonAutocomplete
                      key={`${applied?.id}:people`}
                      client={client}
                      id="demo-person"
                      label={label}
                      value={name}
                      onChange={editName}
                      onPick={pickedThrough}
                      // A person or an address picked: nothing redeems its
                      // token, so there is no business for step 03 to search.
                      onPickEntity={() => setPicked(null)}
                      layout={style.personLayout}
                      list={style.personInclude}
                      pickable={style.personPickable}
                      look={{ ...changedLook(style) }}
                      limit={style.limit}
                      minChars={style.minChars}
                      debounceMs={style.debounceMs}
                      mintOn={style.mintOn}
                      menuFollowsInputWidth={style.menuFollowsInputWidth}
                      messages={messages}
                      unstyled={style.unstyled}
                      open={styling || filtering}
                      {...(style.pageInput
                        ? { classNames: { input: "demo-input" } }
                        : {})}
                      {...(peopleFilters !== undefined
                        ? { filters: peopleFilters }
                        : {})}
                    />
                  ) : (
                    <AddressAutocomplete
                      key={`${applied?.id}:addresses`}
                      client={client}
                      id="demo-address"
                      label={label}
                      value={name}
                      onChange={editName}
                      onPick={pickedThrough}
                      onPickEntity={() => setPicked(null)}
                      layout={style.addressLayout}
                      list={style.addressInclude}
                      pickable={style.addressPickable}
                      look={{ ...changedLook(style) }}
                      limit={style.limit}
                      minChars={style.minChars}
                      debounceMs={style.debounceMs}
                      mintOn={style.mintOn}
                      menuFollowsInputWidth={style.menuFollowsInputWidth}
                      messages={messages}
                      unstyled={style.unstyled}
                      open={styling || filtering}
                      {...(style.pageInput
                        ? { classNames: { input: "demo-input" } }
                        : {})}
                      {...(addressFilters !== undefined
                        ? { filters: addressFilters }
                        : {})}
                    />
                  )}
                </>
              )}
              {styling && name.trim() === "" && (
                <>
                  {/* Sample rows under the empty field, drawn by the same view
                      the live component uses, so every knob shows on them. */}
                  <div className="demo-sample" aria-hidden="true">
                    {mode === "businesses" ? (
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
                          include: includeForLayout(style.layout),
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
                        messages={messages}
                        unstyled={style.unstyled}
                        layout={style.layout}
                        // The sample rows answer to the filters above, so a state
                        // typed there marks its flag on them.
                        {...(filters !== undefined
                          ? { appliedFilters: filters }
                          : {})}
                        menuFollowsInputWidth={style.menuFollowsInputWidth}
                      />
                    ) : mode === "people" ? (
                      <PersonAutocompleteView
                        id="demo-sample"
                        value={SAMPLE_PEOPLE_QUERY}
                        onInputChange={() => {}}
                        onSelect={() => {}}
                        renderInput={inputProps => (
                          <input {...inputProps} hidden tabIndex={-1} />
                        )}
                        suggestions={SAMPLE_PEOPLE.slice(0, style.limit)}
                        layout={style.personLayout}
                        list={style.personInclude}
                        pickable={style.personPickable}
                        found={SAMPLE_PEOPLE.length}
                        foundCapped={false}
                        truncated={false}
                        indexTag={SAMPLE_META.indexTag}
                        roundTripMs={SAMPLE_META.roundTripMs}
                        isSearching={false}
                        error={null}
                        open
                        look={{ ...changedLook(style) }}
                        messages={messages}
                        unstyled={style.unstyled}
                        menuFollowsInputWidth={style.menuFollowsInputWidth}
                      />
                    ) : (
                      <AddressAutocompleteView
                        id="demo-sample"
                        value={SAMPLE_ADDRESSES_QUERY}
                        onInputChange={() => {}}
                        onSelect={() => {}}
                        renderInput={inputProps => (
                          <input {...inputProps} hidden tabIndex={-1} />
                        )}
                        suggestions={SAMPLE_ADDRESSES.slice(0, style.limit)}
                        layout={style.addressLayout}
                        list={style.addressInclude}
                        pickable={style.addressPickable}
                        found={SAMPLE_ADDRESSES.length}
                        foundCapped={false}
                        truncated={false}
                        indexTag={SAMPLE_META.indexTag}
                        roundTripMs={SAMPLE_META.roundTripMs}
                        isSearching={false}
                        error={null}
                        open
                        look={{ ...changedLook(style) }}
                        messages={messages}
                        unstyled={style.unstyled}
                        menuFollowsInputWidth={style.menuFollowsInputWidth}
                      />
                    )}
                  </div>
                  <p className="hint demo-sample-note">
                    Sample rows for &ldquo;
                    {mode === "businesses"
                      ? SAMPLE_QUERY
                      : mode === "people"
                        ? SAMPLE_PEOPLE_QUERY
                        : SAMPLE_ADDRESSES_QUERY}
                    &rdquo; while Styling is open.{" "}
                    {client === null
                      ? "Connect and type to see real ones."
                      : "Type to see real ones."}
                  </p>
                </>
              )}
            </div>
          </section>

          {/* The page has two steps until a business is picked. A new pick, a
              new key, or a change to the name or a filter starts this one
              over: it closes up and goes. Its slot stays, empty, so that the
              column does not change when the step is taken away. Every pick is
              a step of its own, the same business picked again included, so
              that one made while the last is still closing does not take over
              its run and its idempotency key. */}
          <div
            className="step-exit"
            data-open={step !== null ? "true" : "false"}
            aria-hidden={step !== null ? undefined : "true"}
            inert={step === null}
            data-testid="demo-step-exit"
          >
            <div className="step-exit-inner">
              {shownStep !== null && (
                <SearchStep
                  key={`${shownStep.applied.id}:${shownStep.picked.toSearch.businessToken}:${shownStep.picked.toSearch.expiresAt}`}
                  apiKey={shownStep.applied.secret}
                  baseUrl={shownStep.applied.baseUrl}
                  // The host the applied connection reaches, not the form's:
                  // the request the step shows must be the one Run sends.
                  apiHost={
                    shownStep.applied.environment === "custom"
                      ? shownStep.applied.baseUrl
                      : PRODUCTION
                  }
                  picked={shownStep.picked.toSearch}
                  fetchImpl={network.fetch}
                  onShowDebug={showDebug}
                />
              )}
            </div>
          </div>
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
                        {tab === "session" && client !== null && (
                          <ConnectionIndicator client={client} dotOnly />
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
                      (client === null ? (
                        <p className="hint" data-testid="demo-session">
                          Not connected.
                        </p>
                      ) : (
                        <div data-testid="demo-session">
                          <div className="debug-toolbar">
                            <ConnectionIndicator client={client} />
                          </div>
                          <SessionMeters client={client} />
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
                  <StylingPanel
                    state={style}
                    onChange={setStyle}
                    route={mode}
                    routes={offered}
                    onRoute={setSearchBy}
                  />
                </section>
              )}
            </div>
          </aside>
        )}
      </div>
    </main>
  );
}
