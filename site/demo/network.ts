// A fetch that records every request the demo makes, for the network
// timeline: when it started, when its headers and its body arrived, its
// status and size, the server's own time, and whether a newer keystroke
// aborted it. Credentials are redacted before anything is kept.

export type NetworkKind = "mint" | "tier" | "other";
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
  /** `Server-Timing` `total`, the tier's own time. */
  serverMs: number | null;
  outcome: NetworkOutcome;
  requestHeaders: Record<string, string>;
  responseHeaders: Record<string, string>;
  /** The response body, cut at 16 kB. */
  body: string | null;
}

const MAX_ENTRIES = 200;
const MAX_BODY = 16_384;
const DEV_PREFIX = "/_baselayer";

function redact(name: string, value: string): string {
  switch (name.toLowerCase()) {
    case "x-api-key":
      return "•••••• (redacted)";
    case "x-autocomplete-session":
      return `${value.slice(0, 16)}… (${value.length} characters)`;
    default:
      return value;
  }
}

function kindOf(path: string): NetworkKind {
  if (path.startsWith("/autocomplete/sessions")) return "mint";
  if (path.startsWith("/autocomplete/businesses")) return "tier";
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

  clear(): void {
    this.entries = [];
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
    const entry: NetworkEntry = {
      id,
      kind: kindOf(pathname),
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
        this.patch(id, {
          endedAt: performance.now(),
          size: new TextEncoder().encode(text).length,
          body: text.length > MAX_BODY ? `${text.slice(0, MAX_BODY)}\n…` : text,
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
