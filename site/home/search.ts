// Step 3's code: the body your backend sends to `POST /searches` for a pick.
// The token goes on its own, since the search refuses it beside a name or an
// address. Apart from Home, so a test reads it without the page's assets.

import type { Snippet } from "../shared/Code";

export const SEARCH_SNIPPET: Snippet[] = [
  {
    label: "POST /searches",
    lang: "json",
    code: `{
  "business_token": "A4uYMdTtN1PuVsmNF8…"
}`,
  },
];
