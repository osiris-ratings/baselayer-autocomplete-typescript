import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ArchitectureDiagram } from "../../site/home/ArchitectureDiagram";
import { RequestFlow } from "../../site/home/RequestFlow";
import { standaloneSvg } from "../../site/home/standalone";

// The README shows the site's own diagrams as files. These keep the files
// equal to the components; `pnpm diagrams` rewrites them after a change.
const DIAGRAMS = [
  { file: "docs/images/architecture.svg", element: <ArchitectureDiagram /> },
  { file: "docs/images/request-flow.svg", element: <RequestFlow /> },
];

const path = (file: string) =>
  fileURLToPath(new URL(`../../${file}`, import.meta.url));

describe("the diagram files", () => {
  for (const { file, element } of DIAGRAMS) {
    it(`${file} is the component, rendered`, () => {
      const svg = standaloneSvg(renderToStaticMarkup(element));
      if (process.env["UPDATE_DIAGRAMS"] === "1") {
        writeFileSync(path(file), svg);
      }
      expect(readFileSync(path(file), "utf8")).toBe(svg);
    });
  }

  it("leaves no CSS variable and no class behind", () => {
    const svg = standaloneSvg(renderToStaticMarkup(<RequestFlow />));
    expect(svg).not.toContain("var(--");
    expect(svg).not.toContain('class="');
    expect(svg).toMatch(
      /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="1120" height="\d+"/,
    );
  });
});
