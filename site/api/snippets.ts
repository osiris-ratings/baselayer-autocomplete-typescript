// The request block's samples, written from what Try it here holds, so a
// sample shows the request the form would send: curl for any request, the
// server helper for the mint, and fetch or the SDK for a search. Each keeps
// the shape of the sample it stands in for; one it has no way to write stays
// as the spec has it.

import { FILTER_PARAMS, type Route } from "@baselayer-sdk/autocomplete";

import { curlOf, type Pair } from "./curl";

/** A request as the form holds it. */
export interface FormRequest {
  method: string;
  /** The URL without its query. */
  url: string;
  headers: readonly Pair[];
  query: readonly Pair[];
  body: unknown;
}

/** The headers a browser sets itself, which page code never sends. */
const BROWSER_HEADERS = new Set(["origin", "host", "content-length", "cookie"]);

/** The filters that take a list, sent comma-joined, by their SDK path. */
const LIST_FILTERS = new Set(["state", "business.state"]);

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/** A value as TypeScript writes it on one line: `{ q: "a", limit: 5 }`. */
export function tsLiteral(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(tsLiteral).join(", ")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value).map(
      ([key, entry]) =>
        `${IDENTIFIER.test(key) ? key : JSON.stringify(key)}: ${tsLiteral(entry)}`,
    );
    return entries.length === 0 ? "{}" : `{ ${entries.join(", ")} }`;
  }
  return JSON.stringify(value ?? null);
}

/**
 * A header's value as code: `$NAME`, a stand-in, becomes the variable the
 * samples use for it, anything else a string.
 */
function valueCode(value: string, stands: Record<string, string>): string {
  const name = /^\$([A-Z_][A-Z0-9_]*)$/.exec(value.trim())?.[1];
  if (name !== undefined) {
    return stands[name] ?? `process.env.${name}!`;
  }
  return JSON.stringify(value);
}

const headerOf = (request: FormRequest, name: string) =>
  request.headers.find(
    header => header.name.toLowerCase() === name.toLowerCase(),
  )?.value;

/** The route a search URL is on, or null for any other URL. */
function routeOf(url: string): Route | null {
  const route = /\/autocomplete\/(businesses|people|addresses)$/.exec(
    new URL(url).pathname,
  )?.[1];
  return (route as Route | undefined) ?? null;
}

/** The mint, from a backend, with the SDK's server helper. */
function nodeMint(request: FormRequest): string | null {
  if (!new URL(request.url).pathname.endsWith("/autocomplete/sessions")) {
    return null;
  }
  const key = headerOf(request, "X-API-Key") ?? "$BASELAYER_API_KEY";
  const origin = headerOf(request, "Origin") ?? "";
  const body = (request.body ?? {}) as {
    scope?: { routes?: unknown; max_limit?: unknown };
  };
  const scope =
    body.scope === undefined
      ? null
      : {
          ...(body.scope.routes !== undefined
            ? { routes: body.scope.routes }
            : {}),
          ...(body.scope.max_limit !== undefined
            ? { maxLimit: body.scope.max_limit }
            : {}),
        };
  return [
    'import { mintForOrigin } from "@baselayer-sdk/autocomplete/server";',
    "",
    "const out = await mintForOrigin({",
    `  apiKey: ${valueCode(key, {})},`,
    `  origin: ${JSON.stringify(origin)},`,
    ...(scope === null
      ? []
      : [
          "  // Optional: what the session may search.",
          `  scope: ${tsLiteral(scope)},`,
        ]),
    "});",
    "// out.status, out.headers (Retry-After) and out.body, to pass through",
  ].join("\n");
}

/** A search with `fetch`, from the browser, with the session's token. */
function fetchSearch(request: FormRequest): string | null {
  if (request.method.toLowerCase() !== "get") {
    return null;
  }
  const headers = request.headers.filter(
    header =>
      header.name.trim() !== "" &&
      !BROWSER_HEADERS.has(header.name.toLowerCase()),
  );
  const headerCode = headers
    .map(
      header =>
        `${JSON.stringify(header.name)}: ${valueCode(header.value, { SESSION: "sessionToken" })}`,
    )
    .join(", ");
  return [
    `const url = new URL(${JSON.stringify(request.url)});`,
    ...request.query
      .filter(pair => pair.name.trim() !== "")
      .map(
        pair =>
          `url.searchParams.set(${JSON.stringify(pair.name)}, ${JSON.stringify(pair.value)});`,
      ),
    "",
    "const response = await fetch(url, {",
    `  headers: { ${headerCode} },`,
    '  credentials: "omit",',
    "  signal,",
    "});",
  ].join("\n");
}

/**
 * A search with the SDK's client: the query's parameters as its options, a
 * filter by the path the SDK names it, a list where it takes one.
 */
function sdkSearch(request: FormRequest): string | null {
  const route = routeOf(request.url);
  if (route === null) {
    return null;
  }
  const query: Record<string, unknown> = {};
  const filters: Record<string, unknown> = {};
  const other: string[] = [];
  for (const { name, value } of request.query) {
    if (name.trim() === "") continue;
    if (name === "q") {
      query.q = value;
    } else if (name === "limit") {
      const number = Number(value);
      query.limit = value !== "" && Number.isFinite(number) ? number : value;
    } else if (name === "include") {
      query.include = value
        .split(",")
        .map(item => item.trim())
        .filter(Boolean);
    } else {
      const filter = FILTER_PARAMS[route].find(each => each.param === name);
      if (filter === undefined) {
        other.push(`${name}=${value}`);
        continue;
      }
      const path = filter.path.join(".");
      const set = LIST_FILTERS.has(path)
        ? value
            .split(",")
            .map(item => item.trim())
            .filter(Boolean)
        : value;
      const [head, field] = filter.path;
      if (field === undefined) {
        filters[head] = set;
      } else {
        filters[head] = {
          ...((filters[head] as Record<string, unknown> | undefined) ?? {}),
          [field]: set,
        };
      }
    }
  }
  if (Object.keys(filters).length > 0) {
    query.filters = filters;
  }
  const lines =
    route === "businesses"
      ? [
          "const { response, indexTag, roundTripMs } = await client.suggest(",
          `  ${tsLiteral(query)},`,
          "  { signal },",
          ");",
        ]
      : [
          "const { response } = await client.search(",
          `  ${JSON.stringify(route)},`,
          `  ${tsLiteral(query)},`,
          "  { signal },",
          ");",
        ];
  return other.length === 0
    ? lines.join("\n")
    : [...lines, `// Not an SDK option: ${other.join(", ")}`].join("\n");
}

/** The samples, by their tab's label, written from the form. */
export function samplesOf(
  request: FormRequest,
  labels: readonly string[],
): Record<string, string> {
  const url = request.query.some(pair => pair.name.trim() !== "")
    ? `${request.url}?${request.query
        .filter(pair => pair.name.trim() !== "")
        .map(
          pair =>
            `${encodeURIComponent(pair.name.trim())}=${encodeURIComponent(pair.value)}`,
        )
        .join("&")}`
    : request.url;
  const out: Record<string, string> = {};
  for (const label of labels) {
    const code = (() => {
      switch (label.toLowerCase()) {
        case "curl":
          return curlOf({
            method: request.method,
            url,
            headers: request.headers,
            body: request.body,
          });
        case "node":
          return nodeMint(request);
        case "fetch":
          return fetchSearch(request);
        case "sdk":
          return sdkSearch(request);
        default:
          return null;
      }
    })();
    if (code !== null) out[label] = code;
  }
  return out;
}
