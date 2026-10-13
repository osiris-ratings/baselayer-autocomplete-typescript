// The request a reader builds in an operation's "Try it here" tab: where it
// starts (the operation's own curl sample, read back), the URL it calls, and
// the curl it copies as. Pure, so the page and the tests read it alike.

/** A header or a query parameter: a name and what it is set to. */
export interface Pair {
  name: string;
  value: string;
}

/** A request as a curl sample spells it. */
export interface Sample {
  /** The URL without its query. */
  url: string;
  headers: Pair[];
  query: Pair[];
  /** The JSON body, or undefined where the sample sends none. */
  body: unknown;
}

/**
 * The request a curl sample makes: its URL and query, each `-H "Name: value"`
 * and the JSON of its `-d '…'`. Null where the sample names no URL.
 */
export function parseCurl(source: string): Sample | null {
  const url = /(https?:\/\/[^\s"']+)/.exec(source)?.[1];
  if (url === undefined) {
    return null;
  }
  const parsed = new URL(url);
  const headers = [...source.matchAll(/-H\s+"([^":]+):\s*([^"]*)"/g)].map(
    match => ({ name: match[1]!, value: match[2]! }),
  );
  const query = [...parsed.searchParams.entries()].map(([name, value]) => ({
    name,
    value,
  }));
  const data = /-d\s+'([\s\S]*?)'\s*$/.exec(source)?.[1];
  let body: unknown = undefined;
  if (data !== undefined) {
    try {
      body = JSON.parse(data);
    } catch {
      body = undefined;
    }
  }
  return { url: `${parsed.origin}${parsed.pathname}`, headers, query, body };
}

/** The URL with its query, each pair with a name encoded. */
export function urlOf(base: string, query: readonly Pair[]): string {
  const pairs = query
    .filter(pair => pair.name.trim() !== "")
    .map(
      pair =>
        `${encodeURIComponent(pair.name.trim())}=${encodeURIComponent(pair.value)}`,
    );
  return pairs.length === 0 ? base : `${base}?${pairs.join("&")}`;
}

/** JSON on one line, spaced as the samples space it: `{"a": [1, 2]}`. */
export function compactJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(compactJson).join(", ")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .map(([key, entry]) => `${JSON.stringify(key)}: ${compactJson(entry)}`)
      .join(", ")}}`;
  }
  return JSON.stringify(value ?? null);
}

/** The curl for a request, laid out as the samples lay theirs. */
export function curlOf({
  method,
  url,
  headers,
  body,
}: {
  method: string;
  url: string;
  headers: readonly Pair[];
  body: unknown;
}): string {
  const quoted = (text: string) => text.replace(/["\\]/g, "\\$&");
  const lines = [
    method.toLowerCase() === "get"
      ? `curl -s "${quoted(url)}"`
      : `curl -s -X ${method.toUpperCase()} "${quoted(url)}"`,
    ...headers
      .filter(header => header.name.trim() !== "")
      .map(header => `  -H "${quoted(header.name)}: ${quoted(header.value)}"`),
  ];
  if (body !== undefined) {
    lines.push(`  -d '${compactJson(body).replace(/'/g, "'\\''")}'`);
  }
  return lines.join(" \\\n");
}
