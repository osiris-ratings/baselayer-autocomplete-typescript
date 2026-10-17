import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer as createHttpServer, request } from "node:http";
import { connect, type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  build,
  createLogger,
  createServer,
  resolveConfig,
  type ViteDevServer,
} from "vite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEMO_KEY_PATH } from "../../site/demo/prefill";
import {
  demoKeyPrefill,
  readDemoKey,
  type DemoKeyEnv,
} from "../../site/demo-key";

// DEV ONLY: `DEMO_API_KEY_FILE` (or `DEMO_API_KEY`) starts the demo's dev
// server with a key the page prefills and applies on load. The key is a secret,
// so what is held here is where it can and cannot be: only a page on the dev
// server's own origin is given it, nothing logs it, and no build has it, nor
// the code that asks for it, whatever the environment of the build holds. The
// canaries below are keys that would show if any of that leaked.

const CANARY = "bl_live_CANARY_7f3a91c2d4e85b60aa17";
const OTHER_CANARY = "bl_live_CANARY_0b9e44d1c37a62f8e5d3";

const SITE_CONFIG = join(__dirname, "../../site/vite.config.ts");

const scratch: string[] = [];

afterEach(() => {
  for (const dir of scratch.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
  vi.restoreAllMocks();
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "demo-key-"));
  scratch.push(dir);
  return dir;
}

/** A file holding `contents`, readable by `mode`: 0600 is the one that is used. */
function keyFile(contents = CANARY, mode = 0o600): string {
  const path = join(tempDir(), "key");
  writeFileSync(path, `${contents}\n`);
  chmodSync(path, mode);
  return path;
}

/** Everything written to the console or the process's streams while it runs. */
function recordOutput(): () => string {
  const written: string[] = [];
  const take = (...args: unknown[]) => {
    written.push(args.map(arg => String(arg)).join(" "));
    return true;
  };
  for (const method of ["log", "info", "warn", "error", "debug"] as const) {
    vi.spyOn(console, method).mockImplementation(take);
  }
  vi.spyOn(process.stdout, "write").mockImplementation(take as never);
  vi.spyOn(process.stderr, "write").mockImplementation(take as never);
  return () => written.join("\n");
}

/** A reply with the path it echoes taken out: a missing path's page names it. */
const withoutPath = (reply: Reply, path: string): string =>
  reply.body.replaceAll(path, "<path>");

interface Reply {
  status: number;
  body: string;
  headers: Record<string, string | string[] | undefined>;
}

describe("reading the key the dev server starts with", () => {
  const warnings = () => {
    const seen: string[] = [];
    return { seen, warn: (message: string) => seen.push(message) };
  };

  it("reads it from the file DEMO_API_KEY_FILE names, trimmed", () => {
    const { seen, warn } = warnings();

    expect(
      readDemoKey({ DEMO_API_KEY_FILE: keyFile(`  ${CANARY}  `) }, warn),
    ).toBe(CANARY);
    expect(seen).toEqual([]);
  });

  it("reads it from DEMO_API_KEY when no file is named, trimmed", () => {
    const { seen, warn } = warnings();

    expect(readDemoKey({ DEMO_API_KEY: `  ${CANARY} ` }, warn)).toBe(CANARY);
    expect(seen).toEqual([]);
  });

  it("prefers the file, and does not fall back to the variable when the file fails", () => {
    const { seen, warn } = warnings();

    expect(
      readDemoKey(
        { DEMO_API_KEY_FILE: keyFile(OTHER_CANARY), DEMO_API_KEY: CANARY },
        warn,
      ),
    ).toBe(OTHER_CANARY);
    expect(
      readDemoKey(
        {
          DEMO_API_KEY_FILE: join(tempDir(), "missing"),
          DEMO_API_KEY: CANARY,
        },
        warn,
      ),
    ).toBeNull();
    expect(seen).toHaveLength(1);
  });

  it("has no key when neither is set, or when either is empty", () => {
    const { warn } = warnings();

    expect(readDemoKey({}, warn)).toBeNull();
    expect(readDemoKey({ DEMO_API_KEY: "   " }, warn)).toBeNull();
    expect(readDemoKey({ DEMO_API_KEY_FILE: "" }, warn)).toBeNull();
  });

  it.each([
    ["a file others can read", () => keyFile(CANARY, 0o644)],
    ["a file its group can read", () => keyFile(CANARY, 0o640)],
    ["a file others can write", () => keyFile(CANARY, 0o602)],
    ["an empty file", () => keyFile("")],
    ["a path that is not there", () => join(tempDir(), "missing")],
    ["a directory", () => tempDir()],
  ])("warns about %s, naming the variable and never the key", (_, make) => {
    const { seen, warn } = warnings();
    const path = make();

    expect(readDemoKey({ DEMO_API_KEY_FILE: path }, warn)).toBeNull();
    expect(seen).toHaveLength(1);
    expect(seen[0]).toContain("DEMO_API_KEY_FILE");
    expect(seen[0]).not.toContain(CANARY);
    // Nor where it is: a path can say more than the warning needs.
    expect(seen[0]).not.toContain(path);
  });
});

describe("the constant that tells the page whether to ask", () => {
  const defined = async (
    command: "serve" | "build",
    env: DemoKeyEnv,
  ): Promise<unknown> => {
    const config = await resolveConfig(
      { configFile: false, logLevel: "silent", plugins: [demoKeyPrefill(env)] },
      command,
    );
    return config.define?.["__DEMO_PREFILL__"];
  };

  it("is true only when serving with a key", async () => {
    expect(await defined("serve", { DEMO_API_KEY: CANARY })).toBe("true");
    expect(await defined("serve", { DEMO_API_KEY_FILE: keyFile() })).toBe(
      "true",
    );
  });

  it("is false in a build, whatever the environment holds", async () => {
    expect(await defined("build", { DEMO_API_KEY: CANARY })).toBe("false");
    expect(await defined("build", { DEMO_API_KEY_FILE: keyFile() })).toBe(
      "false",
    );
  });

  it("is false when serving with no key it can use", async () => {
    expect(await defined("serve", {})).toBe("false");
    expect(
      await defined("serve", { DEMO_API_KEY_FILE: keyFile(CANARY, 0o644) }),
    ).toBe("false");
  });
});

describe("the dev server's answer", () => {
  const stops: (() => Promise<void>)[] = [];
  afterEach(async () => {
    for (const stop of stops.splice(0)) await stop();
  });

  /** A dev server with only the plugin, listening on a free port, and what it logged. */
  async function serve(env: DemoKeyEnv) {
    const logged: string[] = [];
    const logger = createLogger("info");
    for (const level of ["info", "warn", "warnOnce", "error"] as const) {
      logger[level] = message => void logged.push(message);
    }
    const server = await createServer({
      configFile: false,
      root: tempDir(),
      appType: "custom",
      customLogger: logger,
      plugins: [demoKeyPrefill(env)],
      server: { middlewareMode: true, hmr: false, watch: null },
      optimizeDeps: { noDiscovery: true },
    });
    const http = createHttpServer(server.middlewares);
    await new Promise<void>(resolve => http.listen(0, "127.0.0.1", resolve));
    stops.push(async () => {
      await new Promise<void>(resolve => http.close(() => resolve()));
      await server.close();
    });
    const { port } = http.address() as AddressInfo;
    return {
      logged,
      port,
      get: (
        headers: Record<string, string> = {},
        path = DEMO_KEY_PATH,
        method = "GET",
      ) =>
        new Promise<Reply>((resolve, reject) => {
          const call = request(
            {
              host: "127.0.0.1",
              port,
              path,
              method,
              headers: { host: `127.0.0.1:${port}`, ...headers },
            },
            response => {
              const chunks: Buffer[] = [];
              response.on("data", (chunk: Buffer) => chunks.push(chunk));
              response.on("end", () =>
                resolve({
                  status: response.statusCode ?? 0,
                  body: Buffer.concat(chunks).toString(),
                  headers: response.headers,
                }),
              );
            },
          );
          call.on("error", reject);
          call.end();
        }),
    };
  }

  it("gives a page on its own origin the key, as JSON that is never cached", async () => {
    const dev = await serve({ DEMO_API_KEY_FILE: keyFile() });

    // What a browser sends for the page's own fetch.
    const reply = await dev.get({
      "sec-fetch-site": "same-origin",
      origin: `http://127.0.0.1:${dev.port}`,
    });

    expect(reply.status).toBe(200);
    expect(JSON.parse(reply.body)).toEqual({ key: CANARY });
    expect(reply.headers["cache-control"]).toBe("no-store");
    expect(reply.headers["content-type"]).toBe("application/json");
  });

  it("answers a request that carries no Origin or Sec-Fetch-Site, as a same-origin GET does", async () => {
    const dev = await serve({ DEMO_API_KEY: CANARY });

    expect(JSON.parse((await dev.get()).body)).toEqual({ key: CANARY });
  });

  it.each(["localhost", "[::1]", "127.0.0.1"])(
    "answers the machine's own name for itself: %s",
    async name => {
      const dev = await serve({ DEMO_API_KEY: CANARY });
      const host = `${name}:${dev.port}`;

      const reply = await dev.get({ host, origin: `http://${host}` });

      expect(reply.status).toBe(200);
    },
  );

  it.each([
    ["another site's origin", { origin: "http://evil.example" }],
    ["a cross-site fetch", { "sec-fetch-site": "cross-site" }],
    ["a same-site fetch", { "sec-fetch-site": "same-site" }],
    ["a navigation typed into the address bar", { "sec-fetch-site": "none" }],
    ["a DNS name that points here", { host: "evil.example" }],
    [
      "a name that only starts like localhost",
      { host: "localhost.evil.example" },
    ],
    [
      "a name that only starts like the loopback",
      { host: "127.0.0.1.evil.example" },
    ],
    ["another machine's address", { host: "192.168.1.20:3001" }],
    ["a tailnet name", { host: "laptop.tail1234.ts.net:3001" }],
  ])(
    "does not answer %s, and says no more than a missing path",
    async (_, headers) => {
      const dev = await serve({ DEMO_API_KEY: CANARY });
      // What a path with nothing at it gets, asked the same way.
      const missing = await dev.get(headers, "/__demo/not-there");

      const reply = await dev.get(headers);

      expect(reply.status).toBe(missing.status);
      expect(withoutPath(reply, DEMO_KEY_PATH)).toBe(
        withoutPath(missing, "/__demo/not-there"),
      );
      expect(reply.body).not.toContain(CANARY);
      expect(JSON.stringify(reply.headers)).not.toContain(CANARY);
    },
  );

  it("does not answer a request that names no host", async () => {
    const dev = await serve({ DEMO_API_KEY: CANARY });

    // HTTP/1.0 may leave the Host header out, which node:http's client cannot.
    const text = await new Promise<string>((resolve, reject) => {
      const socket = connect(dev.port, "127.0.0.1", () =>
        socket.write(`GET ${DEMO_KEY_PATH} HTTP/1.0\r\n\r\n`),
      );
      const chunks: Buffer[] = [];
      socket.on("data", (chunk: Buffer) => chunks.push(chunk));
      socket.on("end", () => resolve(Buffer.concat(chunks).toString()));
      socket.on("error", reject);
    });

    expect(text).not.toContain(CANARY);
    expect(text).not.toMatch(/^HTTP\/1\.\d 200/);
  });

  it.each(["POST", "PUT", "DELETE", "HEAD", "OPTIONS"])(
    "does not answer %s",
    async method => {
      const dev = await serve({ DEMO_API_KEY: CANARY });
      const missing = await dev.get({}, "/__demo/not-there", method);

      const reply = await dev.get({}, DEMO_KEY_PATH, method);

      expect(reply.status).toBe(missing.status);
      expect(withoutPath(reply, DEMO_KEY_PATH)).toBe(
        withoutPath(missing, "/__demo/not-there"),
      );
      expect(reply.body).not.toContain(CANARY);
    },
  );

  it("serves nothing when it has no key, and says so at startup without a word of any key", async () => {
    const dev = await serve({ DEMO_API_KEY_FILE: keyFile(CANARY, 0o644) });

    expect((await dev.get()).status).toBe(404);
    expect(dev.logged.join("\n")).toContain("DEMO_API_KEY_FILE");
    expect(dev.logged.join("\n")).not.toContain(CANARY);
  });

  it("reads the file each time, so a rotated key is the one given", async () => {
    const path = keyFile();
    const dev = await serve({ DEMO_API_KEY_FILE: path });
    expect(JSON.parse((await dev.get()).body)).toEqual({ key: CANARY });

    writeFileSync(path, `${OTHER_CANARY}\n`);

    expect(JSON.parse((await dev.get()).body)).toEqual({ key: OTHER_CANARY });
  });

  it("stops giving a key once the file is made readable by others", async () => {
    const path = keyFile();
    const dev = await serve({ DEMO_API_KEY_FILE: path });
    chmodSync(path, 0o644);

    const reply = await dev.get();

    expect(reply.status).toBe(404);
    expect(reply.body).not.toContain(CANARY);
  });

  it("never logs the key: not at startup, not when it gives it, not when it refuses", async () => {
    const output = recordOutput();
    const dev = await serve({ DEMO_API_KEY_FILE: keyFile() });

    await dev.get();
    await dev.get({ origin: "http://evil.example" });
    await dev.get({ host: "evil.example" });
    await dev.get({}, DEMO_KEY_PATH, "POST");
    const bad = await serve({ DEMO_API_KEY: CANARY, DEMO_API_KEY_FILE: "/x" });
    await bad.get();

    expect(dev.logged.join("\n")).toContain("prefilled");
    expect(dev.logged.join("\n")).not.toContain(CANARY);
    expect(bad.logged.join("\n")).not.toContain(CANARY);
    expect(output()).not.toContain(CANARY);
  });
});

/** The text of every file under `dir`, whatever it is. */
function everything(dir: string): { path: string; text: string }[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    return entry.isDirectory()
      ? everything(path)
      : [{ path, text: readFileSync(path, "latin1") }];
  });
}

describe("the real site config, with a key in the environment", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    process.env["DEMO_API_KEY"] = CANARY;
    process.env["DEMO_API_KEY_FILE"] = keyFile(OTHER_CANARY);
  });
  afterEach(() => {
    for (const name of ["DEMO_API_KEY", "DEMO_API_KEY_FILE"]) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  });

  it("serves a page that asks for the key, and has the key in neither the page nor its code", async () => {
    const output = recordOutput();
    let server: ViteDevServer | undefined;
    try {
      server = await createServer({
        configFile: SITE_CONFIG,
        cacheDir: join(tempDir(), "cache"),
        logLevel: "silent",
        server: { middlewareMode: true, hmr: false, watch: null },
        optimizeDeps: { noDiscovery: true },
      });
      const served = async (url: string) =>
        (await server!.transformRequest(url))?.code ?? "";
      const app = await served("/demo/App.tsx");
      const asker = await served("/demo/prefill.ts");
      // The dev server hands a page its `define`s as globals, in this module.
      const defines = await served("/@vite/env");
      const html = await server.transformIndexHtml(
        "/demo/index.html",
        readFileSync(join(__dirname, "../../site/demo/index.html"), "utf8"),
      );

      // The control: this is a page that asks, and the server told it to, so
      // it is the build that leaves the ask out and not a page that never had one.
      expect(app).toContain("readPrefilledKey");
      expect(asker).toContain(DEMO_KEY_PATH);
      expect(defines).toMatch(/"__DEMO_PREFILL__":\s*true/);
      for (const text of [app, asker, defines, html]) {
        expect(text).not.toContain(CANARY);
        expect(text).not.toContain(OTHER_CANARY);
      }
    } finally {
      await server?.close();
    }
    expect(output()).not.toContain(CANARY);
    expect(output()).not.toContain(OTHER_CANARY);
  }, 60_000);

  it("builds a site with neither the key, the path it is asked at, nor the code that asks", async () => {
    const output = recordOutput();
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
      expect(text, path).not.toContain(CANARY);
      expect(text, path).not.toContain(OTHER_CANARY);
      expect(text, path).not.toContain(DEMO_KEY_PATH);
      expect(text, path).not.toContain("__demo");
      expect(text, path).not.toContain("__DEMO_PREFILL__");
      expect(text, path).not.toContain("DEMO_API_KEY");
    }
    expect(output()).not.toContain(CANARY);
    expect(output()).not.toContain(OTHER_CANARY);
  }, 120_000);
});
