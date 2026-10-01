// The report a finished search is drawn as: the verdict, the two ratings, how
// the search matched, the business, its filings, its people and the lists it
// was screened against. One scrolling page of sections rather than tabs, so
// all of it is on screen at once, and a section the search has nothing for is
// left out. What each field says is in ./search-view; this only lays it out.

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { Icon, type IconName } from "../shared/icons";
import {
  deliveryChips,
  elapsedLabel,
  entityType,
  formatAddress,
  formatDay,
  glance,
  hitLines,
  matchRows,
  monthsLabel,
  orderedRegistrations,
  plural,
  ratingOf,
  readable,
  registrationKind,
  registrationStatus,
  verdictOf,
  watchlistRows,
  type Chip,
  type Rating,
  type VerdictKind,
} from "./search-view";
import type {
  Address,
  Business,
  Officer,
  Registration,
  Search,
} from "./searches";

function ChipView({ chip }: { chip: Chip }) {
  return (
    <span className="sr-chip" data-tone={chip.tone}>
      {chip.label}
    </span>
  );
}

const VERDICT_ICONS: Record<VerdictKind, IconName> = {
  verified: "check",
  "not-verified": "cross",
  fraud: "alert",
  "no-match": "search",
  failed: "alert",
  cancelled: "cross",
};

/** The search's id, which copies itself: what support would ask for. */
function CopyId({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(id);
    } catch {
      // No clipboard here (a page that is not a secure context), or the write
      // was refused: the id stays on screen to select by hand.
      return;
    }
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 1500);
  };
  return (
    <>
      <button
        type="button"
        className="sr-copy"
        aria-label={`Copy the search id ${id}`}
        onClick={() => void copy()}
      >
        <code>{id}</code>
        <Icon name={copied ? "check" : "copy"} size={14} />
      </button>
      {/* Beside the button, not in it: a button's children are not exposed to
          assistive technology, which would leave "Copied" unread. */}
      <span className="visually-hidden" role="status">
        {copied ? "Copied" : ""}
      </span>
    </>
  );
}

/** A rating's gauge: a 240 degree arc, drawn up to the score. */
const GAUGE_FROM = 150;
const GAUGE_SWEEP = 240;

function arc(from: number, to: number): string {
  const point = (degrees: number) => {
    const radians = (degrees * Math.PI) / 180;
    return [48 + 38 * Math.cos(radians), 48 + 38 * Math.sin(radians)] as const;
  };
  const [x1, y1] = point(from);
  const [x2, y2] = point(to);
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A 38 38 0 ${to - from > 180 ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

function Gauge({ rating }: { rating: Rating }) {
  const fraction = Math.min(1, Math.max(0, rating.score / 100));
  return (
    <svg
      className="sr-gauge"
      viewBox="0 0 96 96"
      role="img"
      aria-label={`${rating.title}: ${rating.grade ?? "not graded"}, ${rating.score} out of 100`}
      data-grade={rating.grade ?? "none"}
    >
      <path
        className="sr-gauge-track"
        d={arc(GAUGE_FROM, GAUGE_FROM + GAUGE_SWEEP)}
        pathLength={1}
      />
      {fraction > 0 && (
        <path
          className="sr-gauge-value"
          d={arc(GAUGE_FROM, GAUGE_FROM + GAUGE_SWEEP * fraction)}
          pathLength={1}
        />
      )}
      <text className="sr-gauge-letter" x="48" y="55" textAnchor="middle">
        {rating.grade ?? "–"}
      </text>
      <text className="sr-gauge-score" x="48" y="73" textAnchor="middle">
        {rating.score}
      </text>
    </svg>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section className="sr-section" aria-labelledby={id}>
      <h4 className="sr-heading" id={id}>
        {title}
        {count !== undefined && <span className="sr-count">{count}</span>}
      </h4>
      {children}
    </section>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </>
  );
}

/** An address as a line, with what is known about delivering to it. */
function AddressLine({ address }: { address: Address }) {
  return (
    <span className="sr-address">
      {formatAddress(address)}
      {deliveryChips(address).map(chip => (
        <ChipView key={chip.label} chip={chip} />
      ))}
    </span>
  );
}

const OTHER_ADDRESSES = 4;

/** A string the API sent, or null for none or an empty one. */
function textOrNull(value: string | null | undefined): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

/** What the business is, as a list of facts; nothing at all when it has none. */
function BusinessFacts({ business }: { business: Business }) {
  const type = entityType(business.structure);
  const primary = business.primary_address ?? business.addresses?.[0] ?? null;
  const others = (business.addresses ?? []).filter(
    address => formatAddress(address) !== formatAddress(primary),
  );
  const incorporated = [
    textOrNull(business.incorporation_state),
    formatDay(business.incorporation_date),
    typeof business.months_in_business === "number"
      ? `(${monthsLabel(business.months_in_business)})`
      : null,
  ].filter(part => part !== null);
  const aliases = business.alternative_names ?? [];
  const phones = business.phone_numbers ?? [];
  const email = textOrNull(business.email);
  const website = textOrNull(business.website);
  const listed = (business.sec_registrations ?? []).map(sec =>
    [(sec.tickers ?? []).join(", "), (sec.exchanges ?? []).join(", ")]
      .filter(Boolean)
      .join(" on "),
  );
  if (
    type === null &&
    incorporated.length === 0 &&
    primary === null &&
    aliases.length === 0 &&
    phones.length === 0 &&
    email === null &&
    website === null &&
    listed.length === 0
  ) {
    return null;
  }
  return (
    <Section title="Business">
      <dl className="sr-facts">
        {type !== null && <Fact label="Entity type">{type}</Fact>}
        {incorporated.length > 0 && (
          <Fact label="Incorporated">{incorporated.join(" · ")}</Fact>
        )}
        {primary !== null && (
          <Fact label="Address">
            <AddressLine address={primary} />
          </Fact>
        )}
        {others.length > 0 && (
          <Fact label="Also on file">
            <ul className="sr-plain">
              {/* The API may list one address twice (under two sources), so the
                  line alone is not a key. */}
              {others.slice(0, OTHER_ADDRESSES).map((address, index) => (
                <li key={`${formatAddress(address)}#${index}`}>
                  <AddressLine address={address} />
                </li>
              ))}
              {others.length > OTHER_ADDRESSES && (
                <li className="sr-muted">
                  and {others.length - OTHER_ADDRESSES} more
                </li>
              )}
            </ul>
          </Fact>
        )}
        {aliases.length > 0 && (
          <Fact label="Also known as">
            {aliases.map(alias => readable(alias)).join(", ")}
          </Fact>
        )}
        {phones.length > 0 && <Fact label="Phone">{phones.join(", ")}</Fact>}
        {email !== null && <Fact label="Email">{email}</Fact>}
        {website !== null && (
          <Fact label="Website">
            {/^https?:\/\//i.test(website) ? (
              <a href={website} target="_blank" rel="noreferrer noopener">
                {website}
              </a>
            ) : (
              website
            )}
          </Fact>
        )}
        {listed.length > 0 && (
          <Fact label="Public company">
            {listed.filter(Boolean).join("; ") || "Registered with the SEC"}
          </Fact>
        )}
      </dl>
    </Section>
  );
}

/** An officer's titles as one phrase, or null when there are none. */
function titlesOf(titles: readonly string[] | undefined): string | null {
  const list = (titles ?? []).map(title => readable(title));
  return list.length > 0 ? list.join(", ") : null;
}

function Filing({ registration }: { registration: Registration }) {
  const status = registrationStatus(registration);
  const kind = registrationKind(registration);
  const filed = formatDay(registration.issue_date);
  const ended = formatDay(registration.dissolution_date);
  const agent = registration.registered_agent ?? null;
  const officers = registration.officers ?? [];
  // The state's word for how the filing stands, unless the chip already said it.
  const said = textOrNull(registration.standing);
  const standing =
    said !== null && said.toLowerCase() !== status.label.toLowerCase()
      ? said
      : null;
  return (
    <li className="sr-filing">
      <span
        className="sr-state"
        data-kind={registration.registration_type ?? undefined}
        aria-hidden="true"
      >
        {registration.state}
      </span>
      <div className="sr-filing-body">
        <p className="sr-filing-head">
          <strong>
            {kind === null ? "Filing" : `${kind} filing`} in{" "}
            {registration.state}
          </strong>
          <span className="sr-filing-status">
            {standing !== null && (
              <span className="sr-muted">{readable(standing)}</span>
            )}
            <ChipView chip={status} />
          </span>
        </p>
        <dl className="sr-facts sr-facts-tight">
          <Fact label="File number">
            <code>{registration.file_number}</code>
          </Fact>
          {filed !== null && <Fact label="Filed">{filed}</Fact>}
          {ended !== null && <Fact label="Ended">{ended}</Fact>}
          {agent !== null && (
            <Fact label="Registered agent">
              {readable(agent.name)}
              {agent.address !== null && agent.address !== undefined && (
                <span className="sr-muted sr-block">
                  {formatAddress(agent.address)}
                </span>
              )}
            </Fact>
          )}
          {officers.length > 0 && (
            <Fact label="Officers">
              {officers
                .map(officer => {
                  const role = titlesOf(officer.titles);
                  return `${readable(officer.name)}${role === null ? "" : ` (${role})`}`;
                })
                .join("; ")}
            </Fact>
          )}
        </dl>
      </div>
    </li>
  );
}

function initials(name: string): string {
  return readable(name)
    .split(/\s+/)
    .filter(word => /^[A-Za-z]/.test(word))
    .slice(0, 2)
    .map(word => word.charAt(0).toUpperCase())
    .join("");
}

function Person({ officer }: { officer: Officer }) {
  const role = titlesOf(officer.titles);
  return (
    <li className="sr-person">
      <span className="sr-avatar" aria-hidden="true">
        {initials(officer.name) || "?"}
      </span>
      <span className="sr-person-name">
        <strong>{readable(officer.name)}</strong>
        {role !== null && <span className="sr-muted">{role}</span>}
      </span>
      <span className="sr-tags">
        {(officer.states ?? []).map(state => (
          <span className="sr-tag" key={state}>
            {state}
          </span>
        ))}
        {(officer.sources ?? []).map(source => (
          <span className="sr-tag" key={source} data-source={source}>
            {source === "SOS" ? "SoS" : source}
          </span>
        ))}
      </span>
    </li>
  );
}

function Watchlists({ search }: { search: Search }) {
  const rows = watchlistRows(search);
  if (rows.length === 0) {
    return null;
  }
  const hits = rows.filter(row => row.count > 0).length;
  return (
    <Section title="Watchlists and sanctions">
      <p className="sr-caption">
        {hits === 0
          ? `Screened against ${plural(rows.length, "list", "lists")}: no hits.`
          : `Screened against ${plural(rows.length, "list", "lists")}: ${hits} with hits.`}
      </p>
      <ul className="sr-lists">
        {rows.map(row => (
          <li key={row.code} className="sr-list" data-hit={row.count > 0}>
            <span className="sr-list-code">{row.code}</span>
            <span className="sr-list-name">{row.name}</span>
            <ChipView
              chip={
                row.count > 0
                  ? {
                      label: `${row.count} ${row.count === 1 ? "hit" : "hits"}`,
                      tone: "bad",
                    }
                  : { label: "No hits", tone: "good" }
              }
            />
            {row.count > 0 && (
              <details className="sr-list-details">
                <summary>Who</summary>
                <ul className="sr-plain">
                  {/* Entries a list names alike (or not at all, each just
                      "Entry") read as the same line. */}
                  {hitLines(row).map((line, index) => (
                    <li key={`${line}#${index}`}>{line}</li>
                  ))}
                </ul>
              </details>
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function SearchResult({
  search,
  elapsedMs,
}: {
  search: Search;
  /** How long the page waited for the search, when it knows. */
  elapsedMs: number | null;
}) {
  const titleId = useId();
  const business = search.business ?? null;
  const verdict = verdictOf(search);
  const ratings = [ratingOf(search, "kyb"), ratingOf(search, "risk")].filter(
    (rating): rating is Rating => rating !== null,
  );
  const rows = matchRows(search);
  const registrations = orderedRegistrations(business?.registrations);
  const officers = business?.business_officers ?? [];
  const finished = search.state === "COMPLETED" && business !== null;
  const warnings = search.warnings ?? [];
  const summary = glance(search);
  const searched =
    search.created_at === undefined
      ? null
      : new Date(search.created_at).toLocaleTimeString();
  return (
    <article
      className="sr"
      aria-labelledby={titleId}
      data-testid="demo-search-result"
      data-state={search.state}
    >
      <header className="sr-head">
        <div className="sr-head-main">
          <p className="mono-label">
            Search result
            {elapsedMs !== null && ` · finished in ${elapsedLabel(elapsedMs)}`}
          </p>
          <h3 className="sr-title" id={titleId} tabIndex={-1}>
            {readable(business?.name ?? search.name ?? "Business")}
          </h3>
          {summary.length > 0 && (
            <ul className="sr-glance">
              {summary.map(part => (
                <li key={part}>{part}</li>
              ))}
            </ul>
          )}
          <p className="sr-meta">
            <CopyId id={search.id} />
            {searched !== null && <span>searched {searched}</span>}
          </p>
        </div>
        {verdict !== null && (
          <span className="sr-verdict" data-kind={verdict.kind}>
            <Icon name={VERDICT_ICONS[verdict.kind]} size={18} />
            {verdict.label}
          </span>
        )}
      </header>

      {!finished && (
        <p className="sr-callout" data-tone="bad" role="note">
          <Icon name="alert" size={18} />
          {search.error ?? "The search ended without a business."}
        </p>
      )}
      {warnings.length > 0 && (
        <div className="sr-callout" data-tone="warn" role="note">
          <Icon name="alert" size={18} />
          <ul className="sr-plain">
            {warnings.map((warning, index) => (
              <li key={`${warning}#${index}`}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      {finished && ratings.length > 0 && (
        <section className="sr-ratings" aria-label="Ratings">
          {ratings.map(rating => (
            <div
              className="sr-rating"
              key={rating.type}
              data-grade={rating.grade ?? "none"}
            >
              <Gauge rating={rating} />
              <div>
                <p className="sr-rating-title">{rating.title}</p>
                <p className="sr-rating-label">
                  {rating.label ?? "Not graded"}
                </p>
              </div>
            </div>
          ))}
        </section>
      )}

      {finished && rows.length > 0 && (
        <Section title="How it matched">
          <table className="sr-match">
            <thead>
              <tr>
                <th scope="col">
                  <span className="visually-hidden">Field</span>
                </th>
                <th scope="col">Your search</th>
                <th scope="col">Matched business</th>
                <th scope="col">Match</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.key}>
                  <th scope="row">{row.label}</th>
                  <td data-label="Your search">{row.yours ?? "–"}</td>
                  <td data-label="Matched business">{row.found ?? "–"}</td>
                  <td data-label="Match">
                    {row.pill === null ? "–" : <ChipView chip={row.pill} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="sr-caption">
            A picked business is searched by its token alone, so the name and
            address come from the pick and match themselves.
          </p>
        </Section>
      )}

      {finished && <BusinessFacts business={business} />}

      {finished && registrations.length > 0 && (
        <Section
          title="Secretary of State filings"
          count={registrations.length}
        >
          <ul className="sr-filings">
            {registrations.map(registration => (
              <Filing key={registration.id} registration={registration} />
            ))}
          </ul>
        </Section>
      )}

      {finished && officers.length > 0 && (
        <Section title="Officers" count={officers.length}>
          <ul className="sr-people">
            {officers.map((officer, index) => (
              <Person key={`${officer.name}#${index}`} officer={officer} />
            ))}
          </ul>
        </Section>
      )}

      {finished && <Watchlists search={search} />}
    </article>
  );
}
