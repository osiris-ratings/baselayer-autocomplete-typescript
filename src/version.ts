import { version } from "../package.json";

/**
 * This SDK's version: `package.json`'s, read when the SDK is built and never
 * written down a second time, so a release cannot carry another version than
 * the one it is published as.
 */
export const SDK_VERSION: string = version;

/**
 * What the SDK calls itself to the autocomplete service and the API:
 * `baselayer-autocomplete-typescript/<version>`, a product token, so it is also
 * the start of a `User-Agent`.
 */
export const CLIENT_PRODUCT = `baselayer-autocomplete-typescript/${SDK_VERSION}`;

/**
 * The request header that carries `CLIENT_PRODUCT`, on every suggest request
 * the browser client makes and on the mint the server helper makes. A browser
 * ignores a `User-Agent` set from `fetch`, so this is the header that survives.
 * It is not a CORS-safelisted header: the autocomplete service has to name it
 * in `Access-Control-Allow-Headers`, or a browser's preflight refuses every
 * search.
 */
export const CLIENT_HEADER = "X-Baselayer-Client";

/** The part of the global scope `runtimeToken` reads, so a test can give it one. */
export interface RuntimeGlobals {
  navigator?: { userAgent?: unknown } | undefined;
  process?: { versions?: { node?: unknown } | undefined } | undefined;
}

/** What a header value may hold: printable ASCII, so `fetch` never throws on it. */
const PRINTABLE = /^[\x20-\x7e]{1,100}$/;

/**
 * The runtime's own product token, for the `User-Agent` of a request made from
 * a server: what `navigator.userAgent` says where there is one (`Node.js/22`,
 * `Deno/2.1.4`, `Bun/1.1.38`, `Cloudflare-Workers`), else `Node.js/<version>`
 * on a Node without it, else nothing.
 */
export function runtimeToken(
  scope: RuntimeGlobals = globalThis as RuntimeGlobals,
): string | null {
  const agent = scope.navigator?.userAgent;
  if (typeof agent === "string" && PRINTABLE.test(agent.trim())) {
    return agent.trim();
  }
  const node = scope.process?.versions?.node;
  if (typeof node === "string" && PRINTABLE.test(node)) {
    return `Node.js/${node}`;
  }
  return null;
}

/** The `User-Agent` of a request the server helper makes. */
export function userAgent(scope?: RuntimeGlobals): string {
  const runtime = runtimeToken(scope);
  return runtime === null ? CLIENT_PRODUCT : `${CLIENT_PRODUCT} ${runtime}`;
}
