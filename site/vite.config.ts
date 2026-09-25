import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin, type ProxyOptions } from "vite";

import { apiReference } from "./api/spec/plugin";

const src = (path: string) =>
  fileURLToPath(new URL(`../src/${path}`, import.meta.url));
const page = (path: string) => fileURLToPath(new URL(path, import.meta.url));

/**
 * The published pages load nothing but their own bundles and fonts, and talk
 * to nothing but a Baselayer API host (or the custom URL a demo visitor
 * types). Added at build time only: the dev server's hot reload needs an
 * inline script.
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

/** Where the Site workflow publishes the site; link previews need full URLs. */
const siteOrigin = "https://sdk.baselayer.com";

/**
 * The preview a link to any page unfurls into, in Slack, iMessage, X and the
 * like: a screenshot of the dropdown, and a PNG icon beside the SVG favicon,
 * which most of them do not draw.
 */
function linkPreview(): Plugin {
  let base = "/";
  return {
    name: "link-preview",
    configResolved: config => {
      base = config.base;
    },
    transformIndexHtml: () => {
      const image = new URL(`${base}og.png`, siteOrigin).href;
      const meta = (attrs: Record<string, string>) => ({
        tag: "meta",
        attrs,
        injectTo: "head" as const,
      });
      return [
        meta({ property: "og:type", content: "website" }),
        meta({ property: "og:site_name", content: "Baselayer" }),
        meta({ property: "og:image", content: image }),
        meta({ property: "og:image:width", content: "1200" }),
        meta({ property: "og:image:height", content: "628" }),
        meta({
          property: "og:image:alt",
          content: "The autocomplete dropdown, matching businesses as you type",
        }),
        meta({ name: "twitter:card", content: "summary_large_image" }),
        {
          tag: "link",
          attrs: {
            rel: "apple-touch-icon",
            href: `${base}apple-touch-icon.png`,
          },
          injectTo: "head",
        },
      ];
    },
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

// The site: the overview at `/`, the API reference at `/api/` and the demo at
// `/demo/`. The demo runs on the SDK's source, so it always shows what `main`
// does. `SITE_BASE` serves it under a sub-path of whatever domain hosts it.
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  base: process.env.SITE_BASE ?? "/",
  appType: "mpa",
  plugins: [
    react(),
    contentSecurityPolicy(),
    linkPreview(),
    apiReference(fileURLToPath(new URL("..", import.meta.url))),
  ],
  resolve: {
    alias: [
      {
        find: "@baselayer-sdk/autocomplete/react/styles.css",
        replacement: src("react/styles.css"),
      },
      {
        find: "@baselayer-sdk/autocomplete/react",
        replacement: src("react/index.ts"),
      },
      { find: /^@baselayer-sdk\/autocomplete$/, replacement: src("index.ts") },
    ],
  },
  server: {
    port: Number(process.env.SITE_PORT ?? 3000),
    strictPort: true,
    proxy: { "/_baselayer/autocomplete": throughDevServer },
  },
  build: {
    outDir: fileURLToPath(new URL("../site-dist", import.meta.url)),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        home: page("index.html"),
        api: page("api/index.html"),
        demo: page("demo/index.html"),
      },
    },
  },
});
