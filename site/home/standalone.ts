// The site's diagrams as standalone SVG files, for the README and the docs.
// An SVG shown as an image loads no fonts and sees no CSS variables, so the
// brand's font variables become system stacks with the same metrics class,
// and a white ground goes under everything for GitHub's dark theme.

const FONTS: Record<string, string> = {
  "var(--mono)":
    'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
  "var(--sans)":
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
};

const escapeAttribute = (value: string) => value.replace(/"/g, "&quot;");

export function standaloneSvg(markup: string): string {
  const viewBox = markup.match(/viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/);
  if (viewBox === null) {
    throw new Error("The diagram has no viewBox");
  }
  const [, width, height] = viewBox;
  let svg = markup
    .replace(/ class="diagram"/, "")
    .replace(
      /^<svg /,
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" `,
    );
  for (const [variable, stack] of Object.entries(FONTS)) {
    svg = svg
      .split(`font-family="${variable}"`)
      .join(`font-family="${escapeAttribute(stack)}"`);
  }
  if (svg.includes("var(--")) {
    throw new Error("A CSS variable survived the export");
  }
  // The ground, first after the title and description so it paints under everything.
  svg = svg.replace(
    /(<\/desc>|<\/title>)(?![\s\S]*<\/(?:desc|title)>)/,
    `$1<rect width="100%" height="100%" fill="#ffffff"/>`,
  );
  return `${svg}\n`;
}
