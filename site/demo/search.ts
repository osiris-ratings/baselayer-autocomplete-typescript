// The search a pick belongs in, as the demo shows it under the form. The
// token goes on its own: `POST /searches` refuses it beside a name or an
// address.

/** How much of the token the example shows; the rest is only for the API. */
const TOKEN_SHOWN = 24;

/** `POST /searches` for a picked row, its token cut short with an ellipsis. */
export function searchExample(apiHost: string, businessToken: string): string {
  return `POST ${apiHost}/searches
{
  "business_token": "${businessToken.slice(0, TOKEN_SHOWN)}…"
}`;
}
