import { join } from "node:path";

import ts from "typescript";

/** The three entry points a package consumer imports. */
export const ENTRY_POINTS = {
  ".": "src/index.ts",
  "./react": "src/react/index.ts",
  "./server": "src/server/index.ts",
} as const;

/** What an export is, as a consumer can use it: a value, a type, or both. */
export type Kind = "value" | "type" | "value+type";

export type Surface = Record<keyof typeof ENTRY_POINTS, Record<string, Kind>>;

/**
 * Every name each entry point exports, and whether it is a value, a type or
 * both, read with the compiler from the sources under `root`. A rename or a
 * removal changes this; an addition does not break anything that was there.
 */
export function surfaceOf(root: string): Surface {
  const configPath = join(root, "tsconfig.json");
  const read = ts.readConfigFile(configPath, ts.sys.readFile);
  const options = ts.parseJsonConfigFileContent(
    read.config,
    ts.sys,
    root,
  ).options;
  const entries = Object.values(ENTRY_POINTS).map(file => join(root, file));
  const program = ts.createProgram(entries, options);
  const checker = program.getTypeChecker();
  const surface = {} as Surface;
  for (const [name, file] of Object.entries(ENTRY_POINTS)) {
    const source = program.getSourceFile(join(root, file))!;
    const moduleSymbol = checker.getSymbolAtLocation(source)!;
    const names: Record<string, Kind> = {};
    for (const exported of checker.getExportsOfModule(moduleSymbol)) {
      const target =
        exported.flags & ts.SymbolFlags.Alias
          ? checker.getAliasedSymbol(exported)
          : exported;
      const value = (target.flags & ts.SymbolFlags.Value) !== 0;
      const type = (target.flags & ts.SymbolFlags.Type) !== 0;
      names[exported.name] =
        value && type ? "value+type" : value ? "value" : "type";
    }
    surface[name as keyof typeof ENTRY_POINTS] = Object.fromEntries(
      Object.entries(names).sort(([a], [b]) => a.localeCompare(b)),
    );
  }
  return surface;
}
