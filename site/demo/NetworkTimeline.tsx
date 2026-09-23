// Every request the demo made, on one time axis: when it started, how long
// the server spent on it (Server-Timing) against the whole round trip, what
// came back and how big it was. Superseded keystrokes show as aborted.

import { Fragment, useEffect, useState, useSyncExternalStore } from "react";

import { Collapsible } from "./controls";
import type { NetworkEntry, NetworkLog } from "./network";

function bytes(n: number | null): string {
  if (n === null) return "–";
  if (n < 1024) return `${n} B`;
  return `${(n / 1024).toFixed(1)} kB`;
}

function ms(n: number | null): string {
  if (n === null) return "–";
  return n >= 1000 ? `${(n / 1000).toFixed(2)} s` : `${Math.round(n)} ms`;
}

function statusClass(entry: NetworkEntry): string {
  if (entry.outcome === "aborted") return "aborted";
  if (entry.outcome === "failed") return "failed";
  if (entry.status === null) return "pending";
  if (entry.status >= 500) return "failed";
  if (entry.status >= 400) return "refused";
  return "ok";
}

function statusText(entry: NetworkEntry): string {
  if (entry.outcome === "aborted") return "aborted";
  if (entry.outcome === "failed" && entry.status === null) return "failed";
  return entry.status === null ? "…" : String(entry.status);
}

/** The body as indented JSON, with a minted session's token cut short. */
function prettyBody(body: string): string {
  try {
    return JSON.stringify(
      JSON.parse(body),
      (key, value: unknown) =>
        key === "session_token" && typeof value === "string"
          ? `${value.slice(0, 16)}… (${value.length} characters)`
          : value,
      2,
    );
  } catch {
    return body;
  }
}

/** Re-render while anything is in flight, so its bar grows. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(performance.now()), 100);
    return () => window.clearInterval(id);
  }, [active]);
  return active ? now : performance.now();
}

const VISIBLE = 60;
const NOT_FILTERS = new Set(["q", "limit", "include"]);

/** The filters a tier request carried, by parameter name. */
function filtersOf(entry: NetworkEntry): string[] {
  return [...new URL(entry.url).searchParams.keys()].filter(
    key => !NOT_FILTERS.has(key),
  );
}

export function NetworkTimeline({
  log,
  open: shown,
  onToggle,
}: {
  log: NetworkLog;
  open: boolean;
  onToggle(open: boolean): void;
}) {
  const all = useSyncExternalStore(log.subscribe, log.getSnapshot);
  const [open, setOpen] = useState<number | null>(null);
  const entries = all.slice(-VISIBLE);
  const pending = entries.some(e => e.outcome === "pending");
  const now = useNow(pending);
  const first = all[0]?.startedAt ?? 0;
  const t0 = entries[0]?.startedAt ?? 0;
  const t1 = Math.max(t0 + 1000, ...entries.map(e => e.endedAt ?? now));
  const span = t1 - t0;
  const totalBytes = all.reduce((sum, e) => sum + (e.size ?? 0), 0);
  const mints = all.filter(e => e.kind === "mint").length;
  const aborted = all.filter(e => e.outcome === "aborted").length;

  return (
    <Collapsible
      className="activity-card"
      title="Network"
      testId="demo-network"
      open={shown}
      onToggle={onToggle}
      keepSummary
      summary={
        <span className="mono-label">
          {all.length} requests · {mints} mint{mints === 1 ? "" : "s"} ·{" "}
          {aborted} aborted · {bytes(totalBytes)}
        </span>
      }
      actions={
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={() => log.clear()}
          disabled={all.length === 0}
        >
          Clear
        </button>
      }
    >
      {all.length > VISIBLE && (
        <p className="hint">
          The last {VISIBLE} of {all.length}.
        </p>
      )}
      {entries.length === 0 ? (
        <p className="hint">
          Nothing yet. Connect, then focus the business name.
        </p>
      ) : (
        <div className="net" role="table" aria-label="Requests">
          <div className="net-row net-header" role="row">
            <span role="columnheader">At</span>
            <span role="columnheader">Request</span>
            <span role="columnheader">Status</span>
            <span role="columnheader">Size</span>
            <span role="columnheader">Time</span>
            <span role="columnheader" className="net-waterfall-head">
              Waterfall{" "}
              <span className="net-legend">
                <i data-part="server" /> server
              </span>
            </span>
          </div>
          {entries.map(entry => {
            const end = entry.endedAt ?? now;
            const total = end - entry.startedAt;
            const left = ((entry.startedAt - t0) / span) * 100;
            const width = Math.max(0.6, (total / span) * 100);
            const server =
              entry.serverMs !== null && total > 0
                ? Math.min(100, (entry.serverMs / total) * 100)
                : 0;
            const isOpen = open === entry.id;
            return (
              <Fragment key={entry.id}>
                <button
                  type="button"
                  role="row"
                  className="net-row"
                  data-status={statusClass(entry)}
                  data-open={isOpen ? "true" : undefined}
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? null : entry.id)}
                >
                  <span role="cell" className="net-at">
                    +{((entry.startedAt - first) / 1000).toFixed(2)}s
                  </span>
                  <span role="cell" className="net-name">
                    <span className="net-kind" data-kind={entry.kind}>
                      {entry.kind === "mint"
                        ? "mint"
                        : entry.kind === "tier"
                          ? "tier"
                          : "http"}
                    </span>
                    <span className="net-path">
                      {entry.kind === "tier" && entry.q !== null ? (
                        <>
                          <q>{entry.q}</q>
                          {filtersOf(entry).length > 0 && (
                            <span className="net-filters">
                              {" "}
                              + {filtersOf(entry).join(", ")}
                            </span>
                          )}
                        </>
                      ) : entry.kind === "mint" ? (
                        "sessions"
                      ) : (
                        entry.path
                      )}
                    </span>
                  </span>
                  <span role="cell" className="net-status">
                    {statusText(entry)}
                  </span>
                  <span role="cell" className="net-size">
                    {bytes(entry.size)}
                  </span>
                  <span role="cell" className="net-time">
                    {entry.outcome === "pending" ? "…" : ms(total)}
                  </span>
                  <span
                    role="cell"
                    className="net-waterfall"
                    aria-hidden="true"
                  >
                    <span
                      className="net-bar"
                      style={{ left: `${left}%`, width: `${width}%` }}
                    >
                      {server > 0 && (
                        <span
                          className="net-bar-server"
                          style={{
                            width: `${server}%`,
                            left: `${(100 - server) / 2}%`,
                          }}
                        />
                      )}
                    </span>
                  </span>
                </button>
                {isOpen && (
                  <div className="net-detail" role="row">
                    <dl role="cell">
                      <div>
                        <dt>{entry.method}</dt>
                        <dd>
                          <code>{entry.url}</code>
                          {entry.viaDevServer && (
                            <span className="hint">
                              {" "}
                              forwarded to production by the dev server
                            </span>
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>Timing</dt>
                        <dd>
                          headers after{" "}
                          {ms(
                            entry.headersAt !== null
                              ? entry.headersAt - entry.startedAt
                              : null,
                          )}
                          , body after{" "}
                          {ms(
                            entry.endedAt !== null
                              ? entry.endedAt - entry.startedAt
                              : null,
                          )}
                          {entry.serverMs !== null && (
                            <>, of which the tier spent {ms(entry.serverMs)}</>
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>Request headers</dt>
                        <dd>
                          {Object.entries(entry.requestHeaders).map(
                            ([name, value]) => (
                              <code key={name} className="net-header-line">
                                {name}: {value}
                              </code>
                            ),
                          )}
                        </dd>
                      </div>
                      {Object.keys(entry.responseHeaders).length > 0 && (
                        <div>
                          <dt>Response headers</dt>
                          <dd>
                            {Object.entries(entry.responseHeaders).map(
                              ([name, value]) => (
                                <code key={name} className="net-header-line">
                                  {name}: {value}
                                </code>
                              ),
                            )}
                          </dd>
                        </div>
                      )}
                    </dl>
                    {entry.body !== null && (
                      <pre className="net-body">{prettyBody(entry.body)}</pre>
                    )}
                  </div>
                )}
              </Fragment>
            );
          })}
        </div>
      )}
    </Collapsible>
  );
}
