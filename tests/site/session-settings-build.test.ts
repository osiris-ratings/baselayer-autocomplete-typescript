import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import react from "@vitejs/plugin-react";
import { JSDOM } from "jsdom";
import {
  build,
  createServer,
  loadConfigFromFile,
  type ViteDevServer,
} from "vite";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

// The key step's Session settings set what the page asks of each session it
// mints. The page `pnpm demo` serves has the toggle from the start. The page
// that is published has none: a visitor sees the page as it always was, and a
// shift-click on the Connect step's title reveals the toggle there. The second
// half builds the page as it is published and runs that build.

const SITE_CONFIG = join(__dirname, "../../site/vite.config.ts");
const ENTRY = join(__dirname, "support/published-entry.tsx");

const scratch: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
});
afterAll(() => {
  for (const dir of scratch.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "session-settings-"));
  scratch.push(dir);
  return dir;
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

describe("the Session settings, in the page the dev server serves", () => {
  it("are in it, to be shown from the start", async () => {
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
});

/** What the built page hands the test: it is drawn into a host, and clicked. */
interface Published {
  draw(host: HTMLElement): () => void;
  flushSync(change: () => void): void;
}

/**
 * The demo page as the site is published: App built for production (so
 * `import.meta.env.DEV` is off, which Vitest's own run is not), with React,
 * minified, as one script. It takes the site's own aliases and defines.
 */
async function publishedPage(): Promise<string> {
  // Vitest runs under NODE_ENV=test, which Vite keeps for a build.
  vi.stubEnv("NODE_ENV", "production");
  const loaded = await loadConfigFromFile(
    { command: "build", mode: "production" },
    SITE_CONFIG,
  );
  const site = loaded!.config;
  const outDir = tempDir();
  await build({
    configFile: false,
    root: dirname(SITE_CONFIG),
    logLevel: "silent",
    plugins: [react()],
    define: {
      ...site.define,
      // A literal false in every build (site/demo-key.ts).
      __DEMO_PREFILL__: "false",
      "process.env.NODE_ENV": '"production"',
    },
    resolve: site.resolve ?? {},
    build: {
      lib: {
        entry: ENTRY,
        name: "Published",
        formats: ["iife"],
        fileName: () => "published.js",
      },
      outDir,
      emptyOutDir: true,
      cssCodeSplit: false,
    },
  });
  return readFileSync(join(outDir, "published.js"), "utf8");
}

describe("the Session settings, in the page as it is published", () => {
  let script = "";
  beforeAll(async () => {
    script = await publishedPage();
  }, 120_000);

  /** The built page drawn in a window of its own, with a way to click it. */
  function drawn() {
    const dom = new JSDOM('<!doctype html><body><div id="host"></div></body>', {
      runScripts: "outside-only",
      pretendToBeVisual: true,
      url: "https://sdk.baselayer.com/demo/",
    });
    const { window } = dom;
    // jsdom draws no media queries.
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList;
    window.eval(script);
    const published = (window as unknown as { Published: Published }).Published;
    const host = window.document.getElementById("host")!;
    const stop = published.draw(host);
    const click = (element: Element, { shiftKey = false } = {}) =>
      published.flushSync(() => {
        element.dispatchEvent(
          new window.MouseEvent("click", {
            bubbles: true,
            cancelable: true,
            shiftKey,
          }),
        );
      });
    const query = (testId: string) =>
      window.document.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
    return {
      window,
      document: window.document,
      click,
      query,
      stop,
      step: () => query("demo-connect")!,
      /** The key step's own fold: the button on its title. */
      fold: () =>
        query("demo-connect")!.querySelector<HTMLButtonElement>(
          ".fold-heading > .fold-toggle",
        )!,
      toggle: () => query("demo-session-toggle"),
      panel: () => window.document.getElementById("demo-session-settings"),
    };
  }

  it("is the page as a visitor first sees it: no toggle, no panel and none of their words", () => {
    const page = drawn();
    try {
      // The control: the demo is on the page, and it is the published one,
      // which has no dev server to call.
      expect(page.step()).toBeTruthy();
      expect(
        [...page.step().querySelectorAll("option")].map(each => each.value),
      ).toEqual(["production", "custom"]);

      expect(page.toggle()).toBeNull();
      expect(page.panel()).toBeNull();
      for (const word of WORDS) {
        expect(page.document.body.innerHTML, word).not.toContain(word);
      }
    } finally {
      page.stop();
    }
  });

  it("folds and opens the step with a plain click, as it always did, and shows nothing", () => {
    const page = drawn();
    try {
      page.click(page.fold());
      expect(page.fold().getAttribute("aria-expanded")).toBe("false");
      expect(page.toggle()).toBeNull();

      page.click(page.fold());
      expect(page.fold().getAttribute("aria-expanded")).toBe("true");
      expect(page.toggle()).toBeNull();
      expect(page.panel()).toBeNull();
    } finally {
      page.stop();
    }
  });

  it("has a shift-click on the Connect step's title reveal the toggle there, closed, with the step still open", () => {
    const page = drawn();
    try {
      page.click(page.fold(), { shiftKey: true });

      expect(page.fold().getAttribute("aria-expanded")).toBe("true");
      expect(page.toggle()?.textContent).toBe("+ Session settings");
      expect(page.toggle()?.getAttribute("aria-expanded")).toBe("false");
      expect(page.step().contains(page.toggle())).toBe(true);
      expect(page.panel()?.hidden).toBe(true);
    } finally {
      page.stop();
    }
  });

  it("offers three profiles and a custom one in the published page, and no other", () => {
    const page = drawn();
    try {
      page.click(page.fold(), { shiftKey: true });
      page.click(page.toggle()!, { shiftKey: true });

      const select = page.panel()!.querySelector("select")!;
      expect([...select.options].map(each => each.value)).toEqual([
        "",
        "standard",
        "reduced",
        "minimal",
        "custom",
      ]);
    } finally {
      page.stop();
    }
  });

  it("opens the scope under the revealed toggle with a plain click, and the match profile too with a shift-click", () => {
    const page = drawn();
    try {
      page.click(page.fold(), { shiftKey: true });

      page.click(page.toggle()!);
      expect(page.panel()?.hidden).toBe(false);
      expect(page.panel()?.textContent).toContain("Most rows");
      expect(page.panel()?.textContent).not.toContain("Match profile");

      page.click(page.toggle()!, { shiftKey: true });
      expect(page.panel()?.hidden).toBe(false);
      expect(page.panel()?.textContent).toContain("Match profile");
    } finally {
      page.stop();
    }
  });
});
