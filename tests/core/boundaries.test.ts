import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const src = fileURLToPath(new URL("../../src/", import.meta.url));

function sources(dir: string): string[] {
  return readdirSync(join(src, dir), { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory()
      ? sources(join(dir, entry.name))
      : /\.tsx?$/.test(entry.name)
        ? [join(dir, entry.name)]
        : [],
  );
}

const IMPORT = /(?:from\s+|import\s*\(\s*|require\s*\(\s*)["']([^"']+)["']/g;

function importsOf(file: string): string[] {
  const text = readFileSync(join(src, file), "utf8");
  return [...text.matchAll(IMPORT)].map(match => match[1] ?? "");
}

describe("the package's boundaries", () => {
  // The core runs in any browser framework and in Node; the server helper runs
  // on a customer's backend. Neither may pull React or the combobox in.
  const frameworkFree = ["index.ts", ...sources("core"), ...sources("server")];

  it.each(frameworkFree)(
    "%s imports no React, React DOM or downshift",
    file => {
      const offending = importsOf(file).filter(specifier =>
        /^(react|react-dom|downshift)(\/|$)/.test(specifier),
      );
      expect(offending).toEqual([]);
    },
  );

  it.each(sources("react"))(
    "%s reaches the core through the package name, so apps load one copy",
    file => {
      const relativeCore = importsOf(file).filter(specifier =>
        specifier.startsWith("../core"),
      );
      expect(relativeCore).toEqual([]);
    },
  );

  it("the server helper does not depend on the browser core", () => {
    for (const file of sources("server")) {
      expect(
        importsOf(file).filter(specifier => specifier.startsWith("../core")),
      ).toEqual([]);
    }
  });
});
