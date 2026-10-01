// A fetch that records every request the demo makes, for the network
// timeline: when it started, when its headers and its body arrived, its
// status and size, the server's own time, and whether a newer keystroke
// aborted it. Credentials are redacted before anything is kept.

export type NetworkKind = "mint" | "autocomplete" | "search" | "other";
export type NetworkOutcome = "pending" | "done" | "aborted" | "failed";

export interface NetworkEntry {
  id: number;
  kind: NetworkKind;
  method: string;
  url: string;
  /** The path and query as the API sees them, without the dev server's prefix. */
  path: string;
  q: string | null;
  viaDevServer: boolean;
  startedAt: number;
  headersAt: number | null;
  endedAt: number | null;
  status: number | null;
  /** Bytes of the decoded response body. */
  size: number | null;
  /** `Server-Timing` `total`, the autocomplete service's own time. */
  serverMs: number | null;
  outcome: NetworkOutcome;
  requestHeaders: Record<string, string>;
  responseHeaders: Record<string, string>;
  /** What the request sent, when it sent text: credentials cut short. */
  requestBody: string | null;
  /** The response body, its tokens cut short, then cut at `maxBody(kind)`. */
  body: string | null;
}

const MAX_ENTRIES = 200;
const DEV_PREFIX = "/_baselayer";

/** A search's answer is a whole report, which 16 kB would cut off. */
export function maxBody(kind: NetworkKind): number {
  return kind === "search" ? 262_144 : 16_384;
}

/** A credential as the panels show it: the start of it, and how long it is. */
export function cutShort(value: string): string {
  return `${value.slice(0, 16)}… (${value.length} characters)`;
}

function redact(name: string, value: string): string {
  switch (name.toLowerCase()) {
    case "x-api-key":
      return "•••••• (redacted)";
    case "x-autocomplete-session":
      return cutShort(value);
    default:
      return value;
  }
}

/**
 * The string values of the keys that hold a credential: a mint's
 * `session_token`, a search's `business_token`, and the `token` every row of
 * the autocomplete service's answer carries, which is the same pick token.
 */
const TOKEN_VALUE =
  /("(?:session_token|business_token|token)"\s*:\s*")([^"\\]*)(")/g;

/**
 * The tokens a body carries, cut short. It works on the text, so a body that
 * is not JSON, or that is JSON cut off part-way, is covered the same way.
 */
export function redactTokens(text: string): string {
  return text.replace(
    TOKEN_VALUE,
    (_all, open: string, value: string, close: string) =>
      `${open}${cutShort(value)}${close}`,
  );
}

/** A body as indented JSON. A body that is not JSON (or was cut off) stays as it is. */
export function indentJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

/** A request's body as the panels show it: tokens cut short, JSON indented. */
export function redactBody(text: string): string {
  return indentJson(redactTokens(text));
}

export function kindOf(path: string): NetworkKind {
  if (path.startsWith("/autocomplete/sessions")) return "mint";
  if (path.startsWith("/autocomplete/businesses")) return "autocomplete";
  if (path.startsWith("/searches")) return "search";
  return "other";
}

function serverTotal(header: string | null): number | null {
  const match = header?.match(/(?:^|,)\s*total;dur=([\d.]+)/);
  return match?.[1] !== undefined ? Number(match[1]) : null;
}

export class NetworkLog {
  private entries: NetworkEntry[] = [];
  private readonly listeners = new Set<() => void>();
  private next = 1;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): NetworkEntry[] => this.entries;

  /** Empties the log, except for requests still out: their answers land here. */
  clear(): void {
    this.entries = this.entries.filter(entry => entry.outcome === "pending");
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  private patch(id: number, patch: Partial<NetworkEntry>): void {
    this.entries = this.entries.map(entry =>
      entry.id === id ? { ...entry, ...patch } : entry,
    );
    this.emit();
  }

  /** `fetch`, recording what it does. */
  readonly fetch = async (
    input: string,
    init: RequestInit = {},
  ): Promise<Response> => {
    const id = this.next++;
    const url = new URL(input, window.location.href);
    const viaDevServer = url.pathname.startsWith(`${DEV_PREFIX}/`);
    const pathname = viaDevServer
      ? url.pathname.slice(DEV_PREFIX.length)
      : url.pathname;
    const headers = new Headers(init.headers);
    const requestHeaders: Record<string, string> = {};
    headers.forEach((value, name) => {
      requestHeaders[name] = redact(name, value);
    });
    const kind = kindOf(pathname);
    const entry: NetworkEntry = {
      id,
      kind,
      method: (init.method ?? "GET").toUpperCase(),
      url: url.href,
      path: `${pathname}${url.search}`,
      q: url.searchParams.get("q"),
      viaDevServer,
      startedAt: performance.now(),
      headersAt: null,
      endedAt: null,
      status: null,
      size: null,
      serverMs: null,
      outcome: "pending",
      requestHeaders,
      responseHeaders: {},
      requestBody: typeof init.body === "string" ? redactBody(init.body) : null,
      body: null,
    };
    this.entries = [...this.entries, entry].slice(-MAX_ENTRIES);
    this.emit();

    let response: Response;
    try {
      response = await fetch(input, init);
    } catch (error) {
      this.patch(id, {
        endedAt: performance.now(),
        outcome: init.signal?.aborted === true ? "aborted" : "failed",
      });
      throw error;
    }
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, name) => {
      responseHeaders[name] = value;
    });
    this.patch(id, {
      headersAt: performance.now(),
      status: response.status,
      serverMs: serverTotal(response.headers.get("server-timing")),
      responseHeaders,
    });
    response
      .clone()
      .text()
      .then(text => {
        const limit = maxBody(kind);
        // Tokens are cut before the body is cut: a body over the limit is no
        // longer JSON, but the text still holds them.
        const shown = redactTokens(text);
        this.patch(id, {
          endedAt: performance.now(),
          size: new TextEncoder().encode(text).length,
          body: shown.length > limit ? `${shown.slice(0, limit)}\n…` : shown,
          outcome: "done",
        });
      })
      .catch(() => {
        this.patch(id, {
          endedAt: performance.now(),
          outcome: init.signal?.aborted === true ? "aborted" : "failed",
        });
      });
    return response;
  };
}
