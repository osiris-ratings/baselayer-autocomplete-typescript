import { readFileSync, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";

import type { Plugin } from "vite";

import { DEMO_KEY_PATH } from "./demo/prefill";

// DEV ONLY. `DEMO_API_KEY_FILE` (a path, preferred, so the key never sits in
// shell history) or `DEMO_API_KEY` starts the dev server with an API key for
// the demo to prefill and apply once on load, so nobody has to paste it.
//
// The key never reaches the page the way a constant would. The page is built
// with `__DEMO_PREFILL__` a literal `false` unless this server is serving and
// has a key, so a build holds neither the code that asks nor the path it asks
// at; and when it is serving, the key is not in any module or in the HTML: the
// page asks this server for it, once, and only a browser page of this
// machine's own is answered. Nothing here logs the key, and a problem with
// where it comes from is a warning that names the variable and never its
// content.
//
// What "a browser page of this machine's own" is, in code: the request's peer
// is the loopback; its Host is the machine's own name for itself; its
// Sec-Fetch-Site, which a browser sets and a page's script cannot, is
// `same-origin`; its Origin, if it has one, is this server's; and nothing in it
// says a proxy or a tunnel forwarded it. A client that is not a browser can
// write any header it likes, so the headers alone prove nothing about one; the
// peer address is what keeps a machine on the network out, and a server that
// listens beyond this machine (`--host`) prefills nothing at all.

export interface DemoKeyEnv {
  DEMO_API_KEY?: string | undefined;
  DEMO_API_KEY_FILE?: string | undefined;
}

/**
 * The key to prefill, or null: from the file when `DEMO_API_KEY_FILE` names
 * one, which must be a regular file only its owner can read, else from
 * `DEMO_API_KEY`. A key that cannot be had is a warning, never an error that
 * stops the server, and the warning never holds the key.
 */
export function readDemoKey(
  env: DemoKeyEnv,
  warn: (message: string) => void,
): string | null {
  const path = env.DEMO_API_KEY_FILE;
  if (path !== undefined && path !== "") {
    try {
      const stat = statSync(path);
      if (!stat.isFile()) {
        warn("DEMO_API_KEY_FILE is not a regular file: no key is prefilled.");
        return null;
      }
      if ((stat.mode & 0o077) !== 0) {
        warn(
          "DEMO_API_KEY_FILE can be read by others (chmod 600 it): no key is prefilled.",
        );
        return null;
      }
      const key = readFileSync(path, "utf8").trim();
      if (key === "") {
        warn("DEMO_API_KEY_FILE is empty: no key is prefilled.");
        return null;
      }
      return key;
    } catch {
      warn("DEMO_API_KEY_FILE cannot be read: no key is prefilled.");
      return null;
    }
  }
  const key = env.DEMO_API_KEY?.trim();
  return key === undefined || key === "" ? null : key;
}

/** `host` is this machine's own name for itself, which a DNS-rebinding page is not. */
function isLocalHost(host: string | undefined): boolean {
  if (host === undefined) return false;
  const name = host.startsWith("[")
    ? host.slice(0, host.indexOf("]") + 1)
    : host.replace(/:\d+$/, "");
  return name === "localhost" || name === "127.0.0.1" || name === "[::1]";
}

const LOOPBACK_V4 = /^127(\.\d{1,3}){3}$/;

/** Whether the other end of the connection is this machine itself. */
function isLoopbackPeer(address: string | undefined): boolean {
  if (address === undefined) return false;
  const bare = address.replace(/^::ffff:/i, "");
  return bare === "::1" || LOOPBACK_V4.test(bare);
}

/** What a proxy or a tunnel adds to a request it passes on. */
const FORWARDING_HEADERS = [
  "forwarded",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-forwarded-port",
  "x-real-ip",
];

/**
 * Whether the server listens on this machine only. Vite's own default
 * (`undefined`, or `false`) is `localhost`; `true` is every address, and any
 * other name or address that is not the loopback is a way in from outside.
 */
export function listensOnThisMachineOnly(
  host: string | boolean | undefined,
): boolean {
  if (host === undefined || host === false) return true;
  if (host === true) return false;
  const name = host.replace(/^\[(.*)\]$/, "$1");
  return name === "localhost" || name === "::1" || LOOPBACK_V4.test(name);
}

/**
 * Whether `request` comes from a browser page of this machine's own origin.
 * See the top of the file for what that takes. Anything else is not answered,
 * and not told apart from a path that does not exist.
 */
export function isOwnPage(request: IncomingMessage): boolean {
  const { headers } = request;
  const { host, origin } = headers;
  return (
    isLoopbackPeer(request.socket.remoteAddress) &&
    !FORWARDING_HEADERS.some(name => headers[name] !== undefined) &&
    isLocalHost(host) &&
    (origin === undefined || origin === `http://${host}`) &&
    headers["sec-fetch-site"] === "same-origin"
  );
}

function answer(response: ServerResponse, status: number, body?: string): void {
  response.statusCode = status;
  response.setHeader("Cache-Control", "no-store");
  if (body === undefined) {
    response.end();
    return;
  }
  response.setHeader("Content-Type", "application/json");
  response.end(body);
}

/**
 * The dev server's side of the prefill, and the build-time constant that tells
 * the page whether to ask: `true` only when serving with a key, `false` in
 * every build, whatever the environment holds.
 */
export function demoKeyPrefill(env: DemoKeyEnv = process.env): Plugin {
  return {
    name: "demo-key-prefill",
    config(userConfig, { command }) {
      const prefill =
        command === "serve" &&
        listensOnThisMachineOnly(userConfig.server?.host) &&
        readDemoKey(env, () => {}) !== null;
      return { define: { __DEMO_PREFILL__: JSON.stringify(prefill) } };
    },
    configureServer(server) {
      const key = readDemoKey(env, message =>
        server.config.logger.warn(`demo: ${message}`),
      );
      if (key === null) return;
      if (!listensOnThisMachineOnly(server.config.server.host)) {
        server.config.logger.warn(
          "demo: the dev server listens beyond this machine (--host): no key is prefilled.",
        );
        return;
      }
      server.config.logger.info(
        "demo: an API key will be prefilled and applied on load.",
      );
      server.middlewares.use(
        DEMO_KEY_PATH,
        (request: IncomingMessage, response: ServerResponse, next) => {
          if (request.method !== "GET" || !isOwnPage(request)) {
            // As if there were nothing at this path.
            next();
            return;
          }
          // Read each time, so a rotated file is the one that is used.
          const current = readDemoKey(env, () => {});
          if (current === null) {
            answer(response, 404);
            return;
          }
          answer(response, 200, JSON.stringify({ key: current }));
        },
      );
    },
  };
}
