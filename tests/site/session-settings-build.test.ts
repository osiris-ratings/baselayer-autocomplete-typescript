import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { build, createServer, type ViteDevServer } from "vite";
import { afterEach, describe, expect, it, vi } from "vitest";

// The key step's Session fold sets what the page asks of each session it mints.
// It is on the page `pnpm demo` serves, and not on the page that is published:
// a build has no row, no panel and no label.

const SITE_CONFIG = join(__dirname, "../../site/vite.config.ts");

const scratch: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const dir of scratch.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "session-settings-"));
  scratch.push(dir);
  return dir;
}

/** Every file under `dir`, with its text. */
function everything(dir: string): { path: string; text: string }[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory()
      ? everything(path)
      : [{ path, text: readFileSync(path, "utf8") }];
  });
}

const WORDS = [
  "Session settings",
  "demo-session-settings",
  "demo-session-toggle",
  "Match profile",
  "Custom profile",
  "Most rows",
  "Asked of every session",
];

describe("the Session fold, in the dev server's page and not the published one", () => {
  it("is in the page the dev server serves", async () => {
    let server: ViteDevServer | undefined;
    try {
      server = await createServer({
        configFile: SITE_CONFIG,
        cacheDir: join(tempDir(), "cache"),
        logLevel: "silent",
        server: { middlewareMode: true, hmr: false, watch: null },
        optimizeDeps: { noDiscovery: true },
      });
      const app = (await server.transformRequest("/demo/App.tsx"))?.code ?? "";

      for (const word of WORDS) {
        expect(app).toContain(word);
      }
    } finally {
      await server?.close();
    }
  }, 60_000);

  it("is not in a build: no row, no panel and no label", async () => {
    // Vitest runs under NODE_ENV=test, which Vite keeps for a build: not the
    // production build the site is published from.
    vi.stubEnv("NODE_ENV", "production");
    const outDir = join(tempDir(), "site");
    mkdirSync(outDir);

    await build({
      configFile: SITE_CONFIG,
      logLevel: "silent",
      build: { outDir, emptyOutDir: true },
    });

    const files = everything(outDir);
    // The control: the demo's code is in what was scanned.
    expect(files.some(file => file.text.includes("Dana Whitfield"))).toBe(true);
    for (const { path, text } of files) {
      for (const word of WORDS) {
        expect(text, `${path}: ${word}`).not.toContain(word);
      }
    }
  }, 120_000);
});
