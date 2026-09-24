// Generates the API reference's data at build time: assembles the document
// from contracts/, renders every description from Markdown to HTML (so no
// Markdown parser ships to the browser), exposes both as
// `virtual:api-reference`, and publishes the document at api/openapi.json.

import { readFileSync } from "node:fs";

import { marked } from "marked";
import type { Plugin } from "vite";
import { parse } from "yaml";

import {
  assembleReference,
  normalizeMarkdown,
  type OpenApiDocument,
  type Overlay,
} from "./assemble";

const VIRTUAL = "virtual:api-reference";
const RESOLVED = `\0${VIRTUAL}`;
const SOURCES = {
  tier: "contracts/tier-openapi.json",
  sessions: "contracts/sessions-openapi.json",
  overlay: "contracts/autocomplete.overlay.yaml",
} as const;

function descriptions(value: unknown, out: Set<string>): Set<string> {
  if (Array.isArray(value)) {
    value.forEach(item => descriptions(item, out));
  } else if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (key === "description" && typeof child === "string") {
        out.add(child);
      } else if (key !== "examples" && key !== "x-codeSamples") {
        descriptions(child, out);
      }
    }
  }
  return out;
}

export interface ApiReferenceData {
  document: OpenApiDocument;
  /** Every description in the document, rendered, keyed by its Markdown. */
  html: Record<string, string>;
}

export function buildReference(repoRoot: string): ApiReferenceData {
  const read = (path: string) => readFileSync(`${repoRoot}/${path}`, "utf8");
  const document = assembleReference({
    tier: JSON.parse(read(SOURCES.tier)) as OpenApiDocument,
    sessions: JSON.parse(read(SOURCES.sessions)) as OpenApiDocument,
    overlay: parse(read(SOURCES.overlay)) as Overlay,
  });
  const html: Record<string, string> = {};
  for (const text of descriptions(document, new Set())) {
    html[text] = marked.parse(normalizeMarkdown(text), { async: false });
  }
  return { document, html };
}

export function apiReference(repoRoot: string): Plugin {
  let base = "/";
  return {
    name: "api-reference",
    configResolved(config) {
      base = config.base;
    },
    resolveId(id) {
      return id === VIRTUAL ? RESOLVED : undefined;
    },
    load(id) {
      if (id !== RESOLVED) {
        return undefined;
      }
      for (const path of Object.values(SOURCES)) {
        this.addWatchFile(`${repoRoot}/${path}`);
      }
      const { document, html } = buildReference(repoRoot);
      return [
        `export const document = ${JSON.stringify(document)};`,
        `export const html = ${JSON.stringify(html)};`,
      ].join("\n");
    },
    configureServer(server) {
      server.middlewares.use(
        `${base}api/openapi.json`,
        (_request, response) => {
          response.setHeader("content-type", "application/json");
          response.end(
            `${JSON.stringify(buildReference(repoRoot).document, null, 2)}\n`,
          );
        },
      );
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "api/openapi.json",
        source: `${JSON.stringify(buildReference(repoRoot).document, null, 2)}\n`,
      });
    },
  };
}
