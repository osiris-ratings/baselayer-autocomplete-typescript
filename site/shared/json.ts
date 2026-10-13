// JSON as the site draws it: indented, and marked up in the rich palette the
// demo's network panel set (`.json-rich` in brand.css): keys pink, strings
// mint, numbers and true or false orange, null grey, the punctuation muted.

import { highlight } from "sugar-high";

/** A body as indented JSON. A body that is not JSON (or was cut off) stays as it is. */
export function indentJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

/**
 * JSON indented and marked up, null in a colour of its own, which the
 * highlighter gives `true` and `false` too. The highlighter escapes the text
 * it marks up, so what a server sent is safe to set as HTML. Draw it inside a
 * `.json-rich` element for its colours.
 */
export function jsonHtml(text: string): string {
  return highlight(indentJson(text), {
    lang: "json",
    mark: token => {
      if (token.type === "keyword" && token.value === "null") {
        token.style = { color: "var(--json-null)" };
      }
    },
  });
}
