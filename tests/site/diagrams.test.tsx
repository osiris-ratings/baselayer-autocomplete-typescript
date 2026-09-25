import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { ReactElement } from "react";
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

// React's escapes, undone, so a label reads as it is drawn.
const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&quot;": '"',
  "&#x27;": "'",
  "&lt;": "<",
  "&gt;": ">",
};

/** Everything a diagram says, in the order it draws it: title, desc, labels. */
function says(element: ReactElement): string[] {
  return [
    ...renderToStaticMarkup(element).matchAll(
      /<(title|desc|text)\b[^>]*>([\s\S]*?)<\/\1>/g,
    ),
  ].map(([, , text]) =>
    text!
      .replace(/<[^>]*>/g, "")
      .replace(/&(?:amp|quot|#x27|lt|gt);/g, entity => ENTITIES[entity]!),
  );
}

// `POST /searches` takes a picked row's token on its own, and refuses one sent
// beside a name or an address.
describe("what the diagrams say the search carries", () => {
  const flow = says(<RequestFlow />);
  const architecture = says(<ArchitectureDiagram />);

  it("posts the token alone to the search, with your key", () => {
    // A message's detail is drawn right after its label.
    expect(flow[flow.indexOf("POST /searches") + 1]).toBe(
      "{ business_token } · X-API-Key",
    );
  });

  it("has your backend send the search the token alone", () => {
    expect(architecture).toContain("Sends only the token to its search");
    expect(architecture).toContainEqual(
      expect.stringContaining(
        "your backend, which sends it, and only it, to its search.",
      ),
    );
  });

  it("has your form carry the name and address beside the token, for the fallback", () => {
    // Your backend searches by the name and address as typed when the search
    // refuses the token, so the form sends them with it; only the search gets
    // the token alone.
    expect(flow.filter(label => label.startsWith("your form"))).toEqual([
      "your form: name, address + business_token",
    ]);
    expect(architecture[architecture.indexOf("your form") + 1]).toBe(
      "the name, address and business_token",
    );
  });
});
