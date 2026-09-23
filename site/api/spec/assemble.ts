// Builds the one OpenAPI document the API reference renders: the tier's
// `GET /autocomplete/businesses` and the API's `POST /autocomplete/sessions`,
// both vendored under contracts/, with the documentation the upstream
// specs do not carry yet applied from an OpenAPI Overlay. No imports, so the
// Vite plugin, the tests and the vendoring script can all load it.

export interface JsonSchema {
  $ref?: string;
  type?: string | string[];
  title?: string;
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: (string | number)[];
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  allOf?: JsonSchema[];
  format?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  examples?: unknown[];
  [key: string]: unknown;
}

export interface Parameter {
  name: string;
  in: string;
  required?: boolean;
  description?: string;
  schema?: JsonSchema;
  [key: string]: unknown;
}

export interface MediaType {
  schema?: JsonSchema;
  example?: unknown;
  examples?: Record<string, { summary?: string; value: unknown }>;
}

export interface Response {
  description?: string;
  headers?: Record<string, { description?: string; schema?: JsonSchema }>;
  content?: Record<string, MediaType>;
}

export interface CodeSample {
  lang: string;
  label?: string;
  source: string;
}

export interface Operation {
  tags?: string[];
  summary?: string;
  description?: string;
  operationId?: string;
  security?: Record<string, string[]>[];
  parameters?: Parameter[];
  responses: Record<string, Response>;
  "x-codeSamples"?: CodeSample[];
  [key: string]: unknown;
}

export type Method = "get" | "put" | "post" | "delete" | "patch";
export type PathItem = Partial<Record<Method, Operation>>;

export interface Tag {
  name: string;
  description?: string;
  "x-traitTag"?: boolean;
}

export interface SecurityScheme {
  type: string;
  in?: string;
  name?: string;
  description?: string;
}

export interface OpenApiDocument {
  openapi: string;
  info: { title: string; version: string; description?: string };
  servers?: { url: string; description?: string }[];
  tags?: Tag[];
  paths: Record<string, PathItem>;
  components?: {
    schemas?: Record<string, JsonSchema>;
    securitySchemes?: Record<string, SecurityScheme>;
  };
  [key: string]: unknown;
}

/** An OpenAPI Overlay 1.0.0 document. */
export interface Overlay {
  overlay: string;
  info: { title: string; version: string };
  actions: {
    target: string;
    description?: string;
    update?: unknown;
    remove?: boolean;
  }[];
}

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

const SCHEMA_REF = "#/components/schemas/";

function clone<T>(value: T): T {
  return structuredClone(value);
}

/** Every `$ref` anywhere under `value`. */
export function refsIn(value: unknown): string[] {
  const out: string[] = [];
  const walk = (node: unknown) => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (node === null || typeof node !== "object") {
      return;
    }
    for (const [key, child] of Object.entries(node)) {
      if (key === "$ref" && typeof child === "string") {
        out.push(child);
      } else {
        walk(child);
      }
    }
  };
  walk(value);
  return out;
}

/**
 * One operation of a larger document, with the schemas it reaches and the
 * security schemes it names, and without its tags: the reference assigns its
 * own, and a tag flip upstream (Internal to public) is not a contract change.
 */
export function extractOperation(
  source: OpenApiDocument,
  path: string,
  method: Method,
): OpenApiDocument {
  const operation = source.paths[path]?.[method];
  if (operation === undefined) {
    throw new Error(`The document has no ${method} ${path}`);
  }
  const rest = clone(operation);
  delete rest.tags;
  const schemas = source.components?.schemas ?? {};
  const kept: Record<string, JsonSchema> = {};
  const pending = refsIn(rest);
  while (pending.length > 0) {
    const ref = pending.pop()!;
    if (!ref.startsWith(SCHEMA_REF)) {
      throw new Error(`Only component schema references are supported: ${ref}`);
    }
    const name = ref.slice(SCHEMA_REF.length);
    if (name in kept) {
      continue;
    }
    const schema = schemas[name];
    if (schema === undefined) {
      throw new Error(`${ref} does not resolve`);
    }
    kept[name] = clone(schema);
    pending.push(...refsIn(schema));
  }
  const schemeNames = new Set(
    (rest.security ?? []).flatMap(s => Object.keys(s)),
  );
  const securitySchemes = Object.fromEntries(
    Object.entries(source.components?.securitySchemes ?? {}).filter(([name]) =>
      schemeNames.has(name),
    ),
  );
  return {
    openapi: source.openapi,
    info: { title: source.info.title, version: source.info.version },
    ...(source.servers !== undefined ? { servers: source.servers } : {}),
    paths: { [path]: { [method]: rest as Operation } },
    components: {
      schemas: Object.fromEntries(
        Object.entries(kept).sort(([a], [b]) => a.localeCompare(b)),
      ),
      securitySchemes,
    },
  };
}

type Step = { key: string } | { name: string };

/**
 * The target paths the overlay may use: `$` followed by `.key`, `['key']`,
 * `["key"]` or `[?(@.name=='value')]` (the array element with that name).
 * Anything else fails loudly rather than matching nothing.
 */
function parseTarget(target: string): Step[] {
  if (!target.startsWith("$")) {
    throw new Error(`An overlay target starts with $: ${target}`);
  }
  const steps: Step[] = [];
  const pattern =
    /\.([A-Za-z_$][\w$-]*)|\[(?:'([^']*)'|"([^"]*)")\]|\[\?\(@\.name==(?:'([^']*)'|"([^"]*)")\)\]/y;
  let index = 1;
  while (index < target.length) {
    pattern.lastIndex = index;
    const match = pattern.exec(target);
    if (match === null) {
      throw new Error(`Unsupported overlay target: ${target}`);
    }
    const name = match[4] ?? match[5];
    steps.push(
      name !== undefined
        ? { name }
        : { key: match[1] ?? match[2] ?? match[3] ?? "" },
    );
    index = pattern.lastIndex;
  }
  return steps;
}

function isObject(value: unknown): value is Record<string, Json> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Overlay 1.0.0 merge: objects merge, arrays append, primitives replace. */
function merge(target: Json, update: Json): Json {
  if (Array.isArray(target)) {
    return [...target, ...(Array.isArray(update) ? update : [update])];
  }
  if (isObject(target) && isObject(update)) {
    const out: Record<string, Json> = { ...target };
    for (const [key, value] of Object.entries(update)) {
      out[key] = key in out ? merge(out[key]!, value) : clone(value);
    }
    return out;
  }
  return clone(update);
}

/** Where a target lands: each match as its container and the key in it. */
interface Location {
  container: Record<string, Json> | Json[];
  key: string | number;
}

function locate(root: Json, steps: Step[]): Location[] {
  let nodes: Json[] = [root];
  let locations: Location[] = [];
  for (const step of steps) {
    locations = [];
    for (const node of nodes) {
      if ("key" in step) {
        if (isObject(node) && step.key in node) {
          locations.push({ container: node, key: step.key });
        }
      } else if (Array.isArray(node)) {
        node.forEach((element, i) => {
          if (isObject(element) && element["name"] === step.name) {
            locations.push({ container: node, key: i });
          }
        });
      }
    }
    nodes = locations.map(({ container, key }) =>
      Array.isArray(container)
        ? container[key as number]!
        : container[key as string]!,
    );
  }
  return locations;
}

export function applyOverlay(
  document: OpenApiDocument,
  overlay: Overlay,
): OpenApiDocument {
  const root = clone(document) as unknown as Record<string, Json>;
  for (const action of overlay.actions) {
    const steps = parseTarget(action.target);
    if (steps.length === 0) {
      if (action.remove === true) {
        throw new Error("The overlay cannot remove the whole document");
      }
      Object.assign(root, merge(root, action.update as Json));
      continue;
    }
    const locations = locate(root, steps);
    if (locations.length === 0) {
      throw new Error(`Overlay target matches nothing: ${action.target}`);
    }
    // Last first, so removing array elements keeps the earlier indices valid.
    for (const { container, key } of locations.reverse()) {
      if (Array.isArray(container)) {
        const i = key as number;
        if (action.remove === true) container.splice(i, 1);
        else container[i] = merge(container[i]!, action.update as Json);
      } else {
        const k = key as string;
        if (action.remove === true) delete container[k];
        else container[k] = merge(container[k]!, action.update as Json);
      }
    }
  }
  return root as unknown as OpenApiDocument;
}

/** FastAPI's docstrings write ``code``; Markdown writes `code`. */
export function normalizeMarkdown(text: string): string {
  return text.replace(/``([^`]+)``/g, "`$1`");
}

export interface ReferenceSources {
  tier: OpenApiDocument;
  sessions: OpenApiDocument;
  overlay: Overlay;
}

function mergeRecords<T>(
  kind: string,
  ...records: (Record<string, T> | undefined)[]
): Record<string, T> {
  const out: Record<string, T> = {};
  for (const record of records) {
    for (const [name, value] of Object.entries(record ?? {})) {
      if (name in out && JSON.stringify(out[name]) !== JSON.stringify(value)) {
        throw new Error(`Two specs define ${kind} ${name} differently`);
      }
      out[name] = value;
    }
  }
  return out;
}

/** The published reference: the two routes, one document, the overlay applied. */
export function assembleReference({
  tier,
  sessions,
  overlay,
}: ReferenceSources): OpenApiDocument {
  const businesses = extractOperation(tier, "/autocomplete/businesses", "get");
  const session = extractOperation(sessions, "/autocomplete/sessions", "post");
  const merged: OpenApiDocument = {
    openapi: "3.1.0",
    info: { title: "Baselayer Autocomplete API", version: tier.info.version },
    servers: [{ url: "https://api.baselayer.com" }],
    paths: { ...session.paths, ...businesses.paths },
    components: {
      schemas: mergeRecords(
        "schema",
        session.components?.schemas,
        businesses.components?.schemas,
      ),
      securitySchemes: mergeRecords(
        "security scheme",
        session.components?.securitySchemes,
        businesses.components?.securitySchemes,
      ),
    },
  };
  return applyOverlay(merged, overlay);
}
