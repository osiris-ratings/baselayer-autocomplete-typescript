import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin, type ProxyOptions } from "vite";

const src = (path: string) =>
  fileURLToPath(new URL(`../src/${path}`, import.meta.url));

/**
 * The published page loads nothing but its own bundle and talks to nothing
 * but a Baselayer API host (or the custom URL a visitor types). Added at build
 * time only: the dev server's hot reload needs an inline script.
 */
function contentSecurityPolicy(): Plugin {
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "connect-src https://api.baselayer.com https:",
    "base-uri 'self'",
    "form-action 'none'",
  ].join("; ");
  return {
    name: "demo-csp",
    apply: "build",
    transformIndexHtml: () => [
      {
        tag: "meta",
        attrs: { "http-equiv": "Content-Security-Policy", content: policy },
        injectTo: "head-prepend",
      },
    ],
  };
}

/**
 * `pnpm demo` stands in for your backend: the page calls this dev server on
 * its own origin, and the dev server forwards the autocomplete routes to the
 * API. The browser makes no cross-origin call, so no CORS list has to admit
 * localhost, and the API key goes where a customer's backend would send it.
 * The session stays bound to the page: the mint's POST carries the page's
 * `Origin`, and the tier's GET, which a browser sends same-origin without
 * one, is given the origin it came to (this server is plain http). The page
 * sends no `Referer`, on purpose, so that cannot stand in.
 */
const throughDevServer: ProxyOptions = {
  target: process.env.DEMO_API ?? "https://api.baselayer.com",
  changeOrigin: true,
  rewrite: path => path.replace(/^\/_baselayer/, ""),
  configure: server => {
    server.on("proxyReq", (proxyReq, request) => {
      proxyReq.removeHeader("cookie");
      if (request.headers.origin === undefined) {
        proxyReq.setHeader("origin", `http://${request.headers.host ?? ""}`);
      }
    });
  },
};

// The demo runs on the SDK's source, so it always shows what `main` does.
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  base: process.env.DEMO_BASE ?? "/",
  plugins: [react(), contentSecurityPolicy()],
  resolve: {
    alias: [
      {
        find: "@baselayer/autocomplete/react/styles.css",
        replacement: src("react/styles.css"),
      },
      {
        find: "@baselayer/autocomplete/react",
        replacement: src("react/index.ts"),
      },
      { find: /^@baselayer\/autocomplete$/, replacement: src("index.ts") },
    ],
  },
  server: {
    port: Number(process.env.DEMO_PORT ?? 3000),
    strictPort: true,
    proxy: { "/_baselayer/autocomplete": throughDevServer },
  },
  build: {
    outDir: fileURLToPath(new URL("../demo-dist", import.meta.url)),
    emptyOutDir: true,
  },
});
