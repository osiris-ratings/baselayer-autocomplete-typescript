// How a contract the API publishes becomes the copy this public repository
// vendors: the same document, worded for readers outside Baselayer.

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

const SERVICE = /\b(the|an older) service\b/g;
const ENVELOPE_CLASS = / \(`[A-Za-z0-9_.]+\.APIError`\)/g;

function rewrite(text: string): string {
  return text
    .replace(ENVELOPE_CLASS, "")
    .replace(SERVICE, (_match, lead: string) => `${lead} autocomplete service`);
}

/**
 * The autocomplete service's OpenAPI document as this repository vendors it:
 * every string names the autocomplete service where the upstream text says
 * only "the service", and no description names the server-side class behind
 * the error envelope. Everything else is kept as it is.
 */
export function publicAutocompleteSpec<T>(spec: T): T {
  const walk = (value: Json): Json => {
    if (typeof value === "string") {
      return rewrite(value);
    }
    if (Array.isArray(value)) {
      return value.map(walk);
    }
    if (value !== null && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([key, entry]) => [key, walk(entry)]),
      );
    }
    return value;
  };
  return walk(spec as Json) as T;
}

/**
 * JSON as the upstream documents spell it: two-space indents, and every
 * character past ASCII escaped, so a re-vendor diffs only what changed.
 */
export function vendoredJson(value: unknown): string {
  const text = JSON.stringify(value, null, 2).replace(
    /[\u007f-\uffff]/g,
    character => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
  return `${text}\n`;
}

export interface ScopeContract {
  routes: string[];
  relations: string[];
  legal_relations: Record<string, string[]>;
}

function names(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || !value.every(item => typeof item === "string")) {
    throw new Error(`the scope fixture's ${field} is not a list of names`);
  }
  return value;
}

/**
 * The session scope fixture as this repository vendors it: the routes, the
 * relations and which relations each route's rows carry, without the
 * fixture's comment, which names who reads it upstream.
 */
export function publicScope(fixture: Record<string, unknown>): ScopeContract {
  const routes = names(fixture.routes, "routes");
  const relations = names(fixture.relations, "relations");
  const table = fixture.legal_relations;
  if (table === null || typeof table !== "object" || Array.isArray(table)) {
    throw new Error("the scope fixture's legal_relations is not a table");
  }
  const legal: Record<string, string[]> = {};
  for (const [route, carried] of Object.entries(table)) {
    if (!routes.includes(route)) {
      throw new Error(`legal_relations names ${route}, which is not a route`);
    }
    legal[route] = names(carried, `legal_relations.${route}`);
    for (const relation of legal[route]) {
      if (!relations.includes(relation)) {
        throw new Error(
          `legal_relations.${route} names ${relation}, which is not a relation`,
        );
      }
    }
  }
  return { routes, relations, legal_relations: legal };
}
