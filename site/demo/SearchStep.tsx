// Step 03: the search a pick leads to, and not on the page until there is one.
// One button runs it, `POST /searches` with the pick's token and nothing else,
// and the report appears below. The call goes through the same recording
// `fetch` as every other request, so Debug shows it, its headers, its body and
// its answer. A search is a real, billable search on the key's organization:
// it never runs by itself.

import type { BusinessSuggestion } from "@baselayer-sdk/autocomplete";
import type { Pick as BusinessPick } from "@baselayer-sdk/autocomplete/react";
import { useEffect, useId, useRef, useState } from "react";

import { Icon } from "../shared/icons";
import { useNow } from "./clock";
import { formatRemaining } from "./connection";
import { FOLD_MS } from "./controls";
import { searchExample } from "./search";
import { SearchResult } from "./SearchResult";
import {
  SEARCH_WAIT_SECONDS,
  newIdempotencyKey,
  runSearch,
  type Search,
} from "./searches";
import {
  announcement,
  consoleHref,
  matchedOf,
  type Typed,
} from "./search-view";

type Phase =
  | { kind: "idle" }
  | { kind: "running"; startedAt: number }
  | { kind: "done"; search: Search; elapsedMs: number }
  | { kind: "error"; message: string; pickAgain: boolean };

export interface SearchStepProps {
  /** The applied API key. */
  apiKey: string;
  /** Where the page's calls go. */
  baseUrl: string;
  /** The API the search is for, as the request shown names it. */
  apiHost: string;
  picked: {
    suggestion: BusinessSuggestion;
    pick: BusinessPick;
    /** The state codes the visitor had filtered by when they picked. */
    asked: readonly string[];
    /** What else they had typed: the name, and the person and address filters. */
    typed: Typed;
  };
  /** `fetch`, recording what it does. */
  fetchImpl: (input: string, init?: RequestInit) => Promise<Response>;
  /** Opens Debug on its network tab. */
  onShowDebug(): void;
}

/** What the report will look like, while the search is still out. */
function ReportSkeleton() {
  return (
    <div className="sr-skeleton" aria-hidden="true">
      <span className="sr-skeleton-bar sr-skeleton-title" />
      <div className="sr-skeleton-row">
        <span className="sr-skeleton-bar sr-skeleton-box" />
        <span className="sr-skeleton-bar sr-skeleton-box" />
      </div>
      <span className="sr-skeleton-bar" />
      <span className="sr-skeleton-bar" />
      <span className="sr-skeleton-bar sr-skeleton-short" />
    </div>
  );
}

/** Smooth, unless the visitor asked for less motion. */
function scrollBehavior(): ScrollBehavior {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}

export function SearchStep({
  apiKey,
  baseUrl,
  apiHost,
  picked,
  fetchImpl,
  onShowDebug,
}: SearchStepProps) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const now = useNow();
  const abort = useRef<AbortController | null>(null);
  // The key the pick's search is named by. The API answers a call that carries
  // a key it has seen with the search that call made, and makes no other: so a
  // retry after a failure that may have come after the search was made (an
  // answer lost on the way, a 5xx, a wait given up on) keeps the key and
  // cannot bill a second search. A search that came back ends it; running
  // again then is a new search on purpose. The step starts over with each
  // pick, so a key is one pick's.
  const idempotencyKey = useRef<string | null>(null);
  const card = useRef<HTMLElement>(null);
  const report = useRef<HTMLDivElement>(null);
  // The request the Run button will send, folded out from under its note.
  const [peeking, setPeeking] = useState(false);
  const peekId = useId();
  const peek = useRef<HTMLDivElement>(null);

  // Leaving the step (a new pick, a new key) stops waiting for the search; the
  // API still finishes it.
  useEffect(() => () => abort.current?.abort(), []);

  // The step arrives below the pick, which a short window or a phone does not
  // reach: bring it into view, by as little as that takes.
  useEffect(() => {
    card.current?.scrollIntoView({
      block: "nearest",
      behavior: scrollBehavior(),
    });
  }, []);

  // Once the request has unfolded, bring all of it into view, by as little as
  // that takes: under a short window it opens below the fold.
  useEffect(() => {
    if (!peeking) return;
    const timer = window.setTimeout(
      () =>
        peek.current?.scrollIntoView({
          block: "nearest",
          behavior: scrollBehavior(),
        }),
      FOLD_MS,
    );
    return () => window.clearTimeout(timer);
  }, [peeking]);

  // The report takes focus when it arrives, and a screen reader hears it. A
  // visitor who has moved on while it was out keeps their focus and their
  // place: the status line below is what tells them.
  const arrived = phase.kind === "done";
  useEffect(() => {
    if (!arrived) return;
    const at = document.activeElement;
    if (
      at !== null &&
      at !== document.body &&
      card.current?.contains(at) !== true
    ) {
      return;
    }
    const title = report.current?.querySelector<HTMLElement>(".sr-title");
    title?.focus({ preventScroll: true });
    // The whole head comes into view, not the title alone: the label and the
    // verdict sit above it.
    title
      ?.closest(".sr-head")
      ?.scrollIntoView({ block: "start", behavior: scrollBehavior() });
  }, [arrived]);

  const running = phase.kind === "running";
  const waiting = useRef<HTMLParagraphElement>(null);
  // The wait is the news while it lasts: keep it in view, where the page is short.
  useEffect(() => {
    if (running) waiting.current?.scrollIntoView({ block: "nearest" });
  }, [running]);
  const expired = now >= picked.pick.expiresAt;
  // The API refused the pick (expired, another organization's, gone): running
  // it again would only get the same refusal.
  const refused = phase.kind === "error" && phase.pickAgain;

  const run = async () => {
    if (running || expired || refused) return;
    const controller = new AbortController();
    abort.current = controller;
    const key = idempotencyKey.current ?? newIdempotencyKey();
    idempotencyKey.current = key;
    const started = performance.now();
    setPhase({ kind: "running", startedAt: Date.now() });
    try {
      const outcome = await runSearch({
        baseUrl,
        apiKey,
        businessToken: picked.pick.businessToken,
        fetchImpl,
        signal: controller.signal,
        idempotencyKey: key,
      });
      if (controller.signal.aborted) return;
      if (outcome.kind === "done") {
        idempotencyKey.current = null;
      }
      setPhase(
        outcome.kind === "done"
          ? {
              kind: "done",
              search: outcome.search,
              elapsedMs: performance.now() - started,
            }
          : {
              kind: "error",
              message: outcome.message,
              pickAgain: outcome.kind === "refused" && outcome.pickAgain,
            },
      );
    } catch (error) {
      if (controller.signal.aborted) return;
      setPhase({
        kind: "error",
        message: error instanceof Error ? error.message : String(error),
        pickAgain: false,
      });
    }
  };

  const href = phase.kind === "done" ? consoleHref(phase.search) : null;

  return (
    <section
      ref={card}
      className="demo-card demo-search"
      aria-labelledby="demo-search-title"
      data-testid="demo-search"
    >
      <div className="demo-card-head">
        <h2 className="demo-card-title" id="demo-search-title">
          <span className="demo-num">03</span> Run a business search
        </h2>
      </div>

      {/* One live region for the whole run, mounted before it starts. What it
          says changes when the search goes out and when it ends (a report or
          a refusal), and never as the time ticks, which would be read out
          again every second. A message inserted already written, as the
          refusal's callout is, may not be read out at all. */}
      <p className="visually-hidden" role="status">
        {running
          ? `Searching. The API holds the call for up to ${SEARCH_WAIT_SECONDS} seconds.`
          : phase.kind === "done"
            ? announcement(phase.search, phase.elapsedMs)
            : phase.kind === "error"
              ? phase.message
              : ""}
      </p>

      <div className="sr-pick" data-testid="demo-search-pick">
        <p className="sr-pick-name">{picked.suggestion.label}</p>
        <p className="sr-pick-meta">
          Domiciled in {picked.suggestion.domicile_state}, registered in{" "}
          {picked.suggestion.states.join(", ")}.
        </p>
        <p className="sr-pick-meta">
          {refused ? (
            <span className="sr-expired">The API refused this pick.</span>
          ) : expired ? (
            <span className="sr-expired">Its token expired.</span>
          ) : (
            <>
              Its token is good for{" "}
              <span className="mono">
                {formatRemaining(picked.pick.expiresAt - now)}
              </span>
              .
            </>
          )}
        </p>
      </div>

      <div className="apply-row">
        <button
          type="button"
          className="btn btn-primary"
          disabled={expired}
          // Not `disabled` while it runs, or once the API has refused the
          // pick: either would drop keyboard focus to the page.
          aria-disabled={running || refused || undefined}
          onClick={() => void run()}
          data-testid="demo-search-run"
        >
          {running
            ? "Searching…"
            : phase.kind === "done"
              ? "Run again"
              : "Run business search"}
        </button>
        <p className="hint apply-note">
          {refused
            ? "Pick the business again."
            : expired
              ? "Pick the business again: a pick's token lasts 15 minutes."
              : "A real search on your organization, and billable. The token goes alone: name and address come from your pick."}{" "}
          <button
            type="button"
            className="sr-link sr-peek"
            aria-expanded={peeking}
            aria-controls={peekId}
            onClick={() => setPeeking(open => !open)}
          >
            See the request body
            <span
              className="fold-chevron"
              data-open={peeking ? "true" : "false"}
              aria-hidden="true"
            />
          </button>
        </p>
      </div>
      {/* Folds by animating its height, as the demo's other folds do; inert
          while folded, so nothing out of sight can take focus. */}
      <div
        id={peekId}
        ref={peek}
        className="fold-body"
        data-open={peeking ? "true" : "false"}
        inert={!peeking}
      >
        <div className="fold-body-inner">
          <p className="hint">
            Send the token with your search; it is good until{" "}
            {new Date(picked.pick.expiresAt).toLocaleTimeString()}.
          </p>
          <pre className="demo-code" data-testid="demo-search-request">
            {searchExample(apiHost, picked.pick.businessToken)}
          </pre>
        </div>
      </div>

      {phase.kind === "running" && (
        <>
          <p className="sr-waiting" ref={waiting}>
            <span className="sr-spinner" aria-hidden="true" />
            <span>
              Waiting for the search,{" "}
              <span className="mono">
                {formatRemaining(Math.max(0, now - phase.startedAt))}
              </span>
              . The API holds the call for up to {SEARCH_WAIT_SECONDS} s, then
              this page asks after the search.{" "}
              <button type="button" className="sr-link" onClick={onShowDebug}>
                Watch it in Debug
              </button>
            </span>
          </p>
          <ReportSkeleton />
        </>
      )}

      {phase.kind === "error" && (
        <>
          <p
            className="sr-callout"
            data-tone="bad"
            data-testid="demo-search-error"
          >
            <Icon name="alert" size={18} />
            {phase.message}
          </p>
          <p className="sr-after">
            <button type="button" className="sr-link" onClick={onShowDebug}>
              See the request in Debug
            </button>
          </p>
        </>
      )}

      {phase.kind === "done" && (
        <>
          <div ref={report}>
            <SearchResult
              search={phase.search}
              elapsedMs={phase.elapsedMs}
              matched={matchedOf(
                picked.pick.matchedOn,
                picked.asked,
                picked.typed,
              )}
            />
          </div>
          <footer className="sr-foot">
            <details className="sr-raw">
              <summary>View raw response</summary>
              <pre className="demo-code">
                {JSON.stringify(phase.search, null, 2)}
              </pre>
            </details>
            <p className="sr-after">
              <button type="button" className="sr-link" onClick={onShowDebug}>
                See the request in Debug
              </button>
              {href !== null && (
                <a
                  className="sr-link"
                  href={href}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  Open in the console
                  <Icon name="external" size={14} />
                </a>
              )}
            </p>
          </footer>
        </>
      )}
    </section>
  );
}
