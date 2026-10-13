// How the reference sends a request, and how it reads a refusal: shared by the
// forms and by the session they pass between them.

/**
 * Where the page sends a request: in `pnpm site` through the dev server, which
 * forwards it (or answers it, on made-up data), as the demo's calls go; built,
 * to the URL it shows.
 */
export function sendTarget(url: string): string {
  return import.meta.env.DEV
    ? url.replace(/^https?:\/\/[^/]+/, "/_baselayer")
    : url;
}

/** A refusal's reason, from its body: the code and the message, or a 422's. */
export function refusalOf(body: unknown): string | null {
  if (body === null || typeof body !== "object") {
    return null;
  }
  const record = body as Record<string, unknown>;
  if (typeof record.message === "string") {
    return record.code === undefined || record.code === null
      ? record.message
      : `${String(record.code)} · ${record.message}`;
  }
  const first = Array.isArray(record.detail) ? record.detail[0] : undefined;
  if (first !== null && typeof first === "object") {
    const { loc, msg } = first as { loc?: unknown[]; msg?: string };
    return [Array.isArray(loc) ? loc.join(".") : null, msg]
      .filter(Boolean)
      .join(": ");
  }
  return null;
}
