// The API the demo talks to under `DEMO_API=sample`: a session mint, the three
// autocomplete routes and the business search, answered from the made-up rows
// in ./sample, so the whole demo runs with no network and no key. The dev
// server serves it (see site/vite.config.ts); the published site never does.

import {
  LEGAL_RELATIONS,
  ROUTES,
  ROUTE_NAMES,
  queryTokens,
  type AddressSuggestion,
  type BusinessSuggestion,
  type PersonSuggestion,
  type RelatedItem,
  type RelatedSet,
  type Relation,
  type Route,
} from "@baselayer-sdk/autocomplete";

import {
  SAMPLE_ADDRESSES,
  SAMPLE_PEOPLE,
  SAMPLE_SUGGESTIONS,
  highlightFor,
} from "./sample";
import { SAMPLE_SEARCH, SAMPLE_WATCHLISTS } from "./sample-search";
import type { Address, Search } from "./searches";

export interface SampleRequest {
  method: string;
  /** The path after the dev server's prefix, with its query string. */
  path: string;
  /** Lower-cased names. */
  headers: Record<string, string | undefined>;
  body: string | null;
}

export interface SampleReply {
  status: number;
  body: unknown;
}

export interface SampleOptions {
  /** The routes a session may search, each with every relation its rows carry. */
  routes: readonly string[];
}

const SESSION_SECONDS = 300;

const NOT_REQUESTED: RelatedSet = {
  count: null,
  matched: null,
  truncated: false,
  items: [],
};

function base64url(value: unknown): string {
  return btoa(JSON.stringify(value))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function claimsOf(token: string | undefined): {
  scp: Partial<Record<Route, Relation[]>>;
} | null {
  const payload = token?.split(".")[1];
  if (payload === undefined) {
    return null;
  }
  try {
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return null;
  }
}

function refusal(status: number, code: number, message: string, metadata = {}) {
  return { status, body: { code, message, uri: null, metadata } };
}

function mint(request: SampleRequest, options: SampleOptions): SampleReply {
  if ((request.headers["x-api-key"] ?? "").trim() === "") {
    return refusal(401, 20, "An API key is required.");
  }
  const routes = Object.fromEntries(
    ROUTE_NAMES.filter(route => options.routes.includes(route)).map(route => [
      route,
      [...LEGAL_RELATIONS[route]],
    ]),
  );
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    exp: now + SESSION_SECONDS,
    iat: now,
    bud: 30,
    piv: 5,
    stem: 3,
    ori: request.headers.origin ?? null,
    org: "sample",
    scp: routes,
  };
  return {
    status: 201,
    body: {
      session_token: `${base64url({ alg: "none", typ: "sample" })}.${base64url(claims)}.sample`,
      expires_in: SESSION_SECONDS,
      expires_at: new Date(claims.exp * 1000).toISOString(),
      request_budget: claims.bud,
      pivot_allowance: claims.piv,
      filter_min_stem: claims.stem,
      scope: { routes, max_limit: 20 },
    },
  };
}

/** Whether every typed token starts a word of `text`. */
function fits(text: string, tokens: readonly string[]): boolean {
  const words = text.toLowerCase().split(/[^a-z0-9]+/);
  return tokens.every(token => words.some(word => word.startsWith(token)));
}

function list(value: string | null): string[] {
  return (value ?? "")
    .split(",")
    .map(item => item.trim().toUpperCase())
    .filter(item => item !== "");
}

const BUSINESS_BY_TOKEN = new Map(
  SAMPLE_SUGGESTIONS.map(row => [row.token, row]),
);

/** A set's items, those `matches` holds marked, and how many matched. */
function marked(
  set: RelatedSet,
  matches: (item: RelatedItem) => boolean,
): RelatedSet {
  const items = set.items.map(item => ({ ...item, matched: matches(item) }));
  return { ...set, items, matched: items.filter(item => item.matched).length };
}

type Row = BusinessSuggestion | PersonSuggestion | AddressSuggestion;

/** The route's rows that fit the query and its filters, filtered rows marked. */
function rowsFor(
  route: Route,
  tokens: string[],
  params: URLSearchParams,
): Row[] {
  switch (route) {
    case "businesses": {
      const states = list(params.get("state"));
      const person = params.get("person.name")?.toLowerCase() ?? "";
      const address = params.get("address.text") ?? "";
      return SAMPLE_SUGGESTIONS.filter(row =>
        fits(`${row.label} ${row.matched_name ?? ""}`, tokens),
      ).flatMap(row => {
        if (states.length > 0 && !row.states.some(s => states.includes(s))) {
          return [];
        }
        let { people, addresses } = row.related;
        if (person !== "") {
          people = marked(people, item =>
            fits(item.label, queryTokens(person)),
          );
          if (people.matched === 0) return [];
        }
        if (address !== "") {
          addresses = marked(addresses, item =>
            fits(item.label, queryTokens(address)),
          );
          if (addresses.matched === 0) return [];
        }
        return [{ ...row, related: { people, addresses } }];
      });
    }
    case "people": {
      const states = list(params.get("business.state"));
      return SAMPLE_PEOPLE.filter(row => fits(row.label, tokens)).flatMap(
        row => {
          if (states.length === 0) return [row];
          const businesses = marked(row.related.businesses, item =>
            (BUSINESS_BY_TOKEN.get(item.token ?? "")?.states ?? []).some(s =>
              states.includes(s),
            ),
          );
          return businesses.matched === 0
            ? []
            : [{ ...row, related: { ...row.related, businesses } }];
        },
      );
    }
    case "addresses": {
      const states = list(params.get("state"));
      return SAMPLE_ADDRESSES.filter(
        row =>
          fits(row.label, tokens) &&
          (states.length === 0 || states.includes(row.components.state)),
      );
    }
  }
}

function suggest(
  route: Route,
  request: SampleRequest,
  params: URLSearchParams,
): SampleReply {
  const claims = claimsOf(request.headers["x-autocomplete-session"]);
  if (claims === null) {
    return refusal(401, 27, "Autocomplete session missing. Mint one.", {
      reason: "session_missing",
      action: "mint",
    });
  }
  const granted = claims.scp[route];
  if (granted === undefined) {
    return refusal(
      403,
      501,
      "This session's scope does not reach this autocomplete route.",
      {
        reason: "route_not_in_scope",
        route,
      },
    );
  }
  const q = (params.get("q") ?? "").trim();
  if (q.length < 2) {
    return {
      status: 422,
      body: {
        detail: [
          {
            type: "too_short",
            loc: ["query", "q"],
            msg: "q is too short",
            ctx: {},
          },
        ],
      },
    };
  }
  const legal: readonly Relation[] = LEGAL_RELATIONS[route];
  const asked = params.get("include");
  const include =
    asked === null
      ? ROUTES[route].defaultInclude.filter(r => granted.includes(r))
      : asked
          .split(",")
          .filter((r): r is Relation => legal.includes(r as Relation));
  const tokens = queryTokens(q);
  const rows = rowsFor(route, tokens, params);
  const limit = Number(params.get("limit") ?? 10);
  const suggestions = rows.slice(0, limit).map(row => ({
    ...row,
    highlight: highlightFor(row.matched_name ?? row.label, tokens),
    related: Object.fromEntries(
      legal.map(relation => [
        relation,
        include.includes(relation)
          ? (row.related as Record<Relation, RelatedSet>)[relation]
          : NOT_REQUESTED,
      ]),
    ),
  }));
  return {
    status: 200,
    body: {
      query: q,
      found: rows.length,
      found_capped: false,
      truncated: false,
      sources: Object.fromEntries(
        legal.map(relation => [
          relation,
          { status: include.includes(relation) ? "ok" : "not_requested" },
        ]),
      ),
      suggestions,
    },
  };
}

/** `"1200 River Rd, Pittsburgh, PA 15212"` as a search's address. */
function addressOf(label: string): Address {
  const [street = "", city = "", stateZip = ""] = label.split(", ");
  const [state = "", zip = ""] = stateZip.split(" ");
  return {
    street: street.toUpperCase(),
    city: city.toUpperCase(),
    state,
    zip,
    rdi: "Commercial",
    deliverable: true,
    cmra: false,
  };
}

/**
 * A finished search of a sample business: the sample search itself for the
 * business it is of, and for any other its name, its domicile, and the people
 * and addresses the sample rows tie to it.
 */
function searchOf(row: BusinessSuggestion): Search {
  if (row.label === SAMPLE_SEARCH.name) {
    return SAMPLE_SEARCH;
  }
  const officers = [
    ...row.related.people.items
      .filter(item => item.role === "officer")
      .map(item => item.label),
    ...SAMPLE_PEOPLE.filter(person =>
      person.related.businesses.items.some(
        item => item.token === row.token && item.role === "officer",
      ),
    ).map(person => person.label),
  ].map(name => name.toUpperCase());
  const unique = [...new Set(officers)];
  const labels = [
    ...row.related.addresses.items.map(item => item.label),
    ...SAMPLE_ADDRESSES.filter(address =>
      address.related.businesses.items.some(item => item.token === row.token),
    ).map(address => address.label),
  ];
  const addresses = [...new Set(labels)].map(addressOf);
  const primary = addresses[0] ?? null;
  // Its own search has no console link, and an address only when it has one.
  const template: Search = { ...SAMPLE_SEARCH };
  delete template.console_url;
  delete template.address;
  return {
    ...template,
    id: `sample-search-${row.token}`,
    name: row.label,
    ...(primary !== null
      ? {
          address: `${primary.street}, ${primary.city}, ${primary.state} ${primary.zip}`,
        }
      : {}),
    search_address: primary,
    watchlist_hits: SAMPLE_WATCHLISTS,
    business: {
      ...SAMPLE_SEARCH.business!,
      id: `sample-business-${row.token}`,
      name: row.label,
      structure: row.structure,
      incorporation_state: row.domicile_state,
      addresses: addresses.map(address => ({ ...address, sources: ["SOS"] })),
      primary_address: primary,
      alternative_names: row.matched_name === null ? [] : [row.matched_name],
      registrations: row.states.map((state, index) => ({
        id: `sample-registration-${row.token}-${state}`,
        name: row.label,
        issue_date: "2015-06-01",
        dissolution_date: null,
        file_number: `${1_000_000 + index * 7_919}`,
        state,
        address: state === row.domicile_state ? primary : null,
        registration_type:
          state === row.domicile_state ? "domestic" : "foreign",
        status: "active",
        standing: "Active",
        registered_agent: null,
        officers:
          state === row.domicile_state
            ? unique.map(name => ({ name, titles: ["OFFICER"] }))
            : [],
      })),
      business_officers: unique.map(name => ({
        name,
        titles: ["OFFICER"],
        states: [row.domicile_state],
        sources: ["SOS"],
      })),
    },
  };
}

function search(request: SampleRequest): SampleReply {
  let token: unknown = null;
  try {
    token = (JSON.parse(request.body ?? "{}") as { business_token?: unknown })
      .business_token;
  } catch {
    token = null;
  }
  const row =
    typeof token === "string" ? BUSINESS_BY_TOKEN.get(token) : undefined;
  if (row === undefined) {
    return refusal(
      422,
      3040,
      "This business token was not sealed for your organization.",
    );
  }
  return { status: 201, body: searchOf(row) };
}

/** The made-up API's answer to a request, or null for a path it does not serve. */
export function answerSample(
  request: SampleRequest,
  options: SampleOptions,
): SampleReply | null {
  const url = new URL(request.path, "http://sample.invalid");
  if (request.method === "POST" && url.pathname === "/autocomplete/sessions") {
    return mint(request, options);
  }
  if (request.method === "POST" && url.pathname === "/searches") {
    return search(request);
  }
  const route = ROUTE_NAMES.find(name => url.pathname === ROUTES[name].path);
  if (request.method === "GET" && route !== undefined) {
    return suggest(route, request, url.searchParams);
  }
  return null;
}
