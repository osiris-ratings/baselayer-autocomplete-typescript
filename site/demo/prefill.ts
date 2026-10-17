// DEV ONLY: the page's side of the API key prefill (site/demo-key.ts is the dev
// server's). Only ever called behind `__DEMO_PREFILL__`, which the build makes
// a literal `false`, so nothing here is in a published page.

/** Where the dev server answers with the key it was started with. */
export const DEMO_KEY_PATH = "/__demo/api-key";

/**
 * The key the dev server holds for the page, or null when it has none or will
 * not give it to this page. Not the page's network log's `fetch`: that records
 * what it carries, and this carries the key.
 */
export async function readPrefilledKey(
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  try {
    const response = await fetchImpl(DEMO_KEY_PATH, {
      cache: "no-store",
      credentials: "same-origin",
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { key?: unknown };
    return typeof body.key === "string" && body.key.trim() !== ""
      ? body.key.trim()
      : null;
  } catch {
    return null;
  }
}
