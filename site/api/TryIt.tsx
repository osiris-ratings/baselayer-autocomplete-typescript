// An operation's "Try it here" tab: its request as a form, inside the code
// block. On top, the URL it calls, read-only but selectable, coloured part by
// part; then the headers, the query parameters and the body, each a table as
// wide as the block. The body is flat: a row for every field it holds, named
// by its whole path (`scope.routes.businesses`), with a field for its value;
// a list of choices is a row of chips to switch on and off. The fields the
// schema names and the body does not hold yet are offered in the table's last
// row, to add. The copy button takes the request as curl. It sends nothing:
// the session mint takes an API key, which belongs on a backend, and the
// autocomplete routes take a session.

import { useEffect, useId, useState } from "react";

import { LEGAL_RELATIONS, type Route } from "@baselayer-sdk/autocomplete";

import { NO_FILL_ATTRIBUTES } from "../../src/react/inputAttributes";
import { Icon } from "../shared/icons";
import { urlOf, type Pair, type Sample } from "./curl";
import { resolveIn, type Schemas } from "./schema";
import { samplesOf } from "./snippets";
import type { JsonSchema } from "./spec/assemble";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** What the form draws for a schema. */
type Shape =
  | {
      kind: "object";
      properties: Record<string, JsonSchema>;
      required: string[];
    }
  | { kind: "map"; keys: string[]; holds: JsonSchema | undefined }
  | { kind: "array"; items: JsonSchema | undefined }
  | { kind: "enum"; values: string[] }
  | { kind: "number"; min: number | undefined; max: number | undefined }
  | { kind: "boolean" }
  | { kind: "string" };

function shapeOf(schemas: Schemas, schema: JsonSchema | undefined): Shape {
  if (schema === undefined) {
    return { kind: "string" };
  }
  const resolved = resolveIn(schemas, schema);
  if (resolved.enum !== undefined) {
    return { kind: "enum", values: resolved.enum.map(String) };
  }
  if (resolved.properties !== undefined) {
    return {
      kind: "object",
      properties: resolved.properties,
      required: resolved.required ?? [],
    };
  }
  const holds = resolved["additionalProperties"];
  const names = resolved["propertyNames"] as JsonSchema | undefined;
  if (names !== undefined || (holds !== null && typeof holds === "object")) {
    return {
      kind: "map",
      keys:
        names === undefined
          ? []
          : (resolveIn(schemas, names).enum ?? []).map(String),
      holds: typeof holds === "object" ? (holds as JsonSchema) : undefined,
    };
  }
  const types = Array.isArray(resolved.type) ? resolved.type : [resolved.type];
  const type = types.find(each => each !== "null");
  if (type === "array") {
    return { kind: "array", items: resolved.items };
  }
  if (type === "integer" || type === "number") {
    return { kind: "number", min: resolved.minimum, max: resolved.maximum };
  }
  if (type === "boolean") {
    return { kind: "boolean" };
  }
  return { kind: "string" };
}

/** A field of the body the form has a row for: a value, at its whole path. */
interface Slot {
  path: string[];
  schema: JsonSchema | undefined;
  shape: Shape;
  /** Every object on its way names it required: it cannot be taken out. */
  required: boolean;
}

/**
 * Every field a body may hold, in the schema's order: an object's fields, a
 * map's fields by each key its schema names, down to what holds a value.
 */
function slotsOf(
  schemas: Schemas,
  schema: JsonSchema | undefined,
  path: string[] = [],
  required = true,
): Slot[] {
  const shape = shapeOf(schemas, schema);
  if (shape.kind === "object") {
    return Object.entries(shape.properties).flatMap(([key, child]) =>
      slotsOf(
        schemas,
        child,
        [...path, key],
        required && shape.required.includes(key),
      ),
    );
  }
  if (shape.kind === "map" && shape.keys.length > 0) {
    return shape.keys.flatMap(key =>
      slotsOf(schemas, shape.holds, [...path, key], false),
    );
  }
  return [{ path, schema, shape, required }];
}

/** A new value for a field: an example where it has one, else its least. */
function defaultFor(schemas: Schemas, slot: Slot): Json {
  const { schema, shape } = slot;
  const example =
    schema === undefined
      ? undefined
      : (schema.examples?.[0] ?? resolveIn(schemas, schema).examples?.[0]);
  switch (shape.kind) {
    case "object":
    case "map":
      return {};
    case "array":
      return [];
    case "enum":
      return shape.values[0] ?? "";
    case "number":
      return typeof example === "number" ? example : (shape.min ?? 0);
    case "boolean":
      return false;
    case "string":
      return typeof example === "string" ? example : "";
  }
}

const isRecord = (value: Json | undefined): value is Record<string, Json> =>
  value !== null &&
  value !== undefined &&
  typeof value === "object" &&
  !Array.isArray(value);

function getAt(value: Json | undefined, path: readonly string[]) {
  let at: Json | undefined = value;
  for (const key of path) {
    at = isRecord(at) ? at[key] : undefined;
  }
  return at;
}

function setAt(
  value: Json | undefined,
  path: readonly string[],
  next: Json,
): Json {
  if (path.length === 0) {
    return next;
  }
  const record = isRecord(value) ? value : {};
  const [key, ...rest] = path as [string, ...string[]];
  return { ...record, [key]: setAt(record[key], rest, next) };
}

/** The body without a field, and without an object it leaves empty. */
function removeAt(value: Json | undefined, path: readonly string[]): Json {
  const record = isRecord(value) ? value : {};
  const [key, ...rest] = path as [string, ...string[]];
  if (rest.length === 0) {
    return Object.fromEntries(
      Object.entries(record).filter(([k]) => k !== key),
    );
  }
  const inner = removeAt(record[key], rest);
  return isRecord(inner) && Object.keys(inner).length === 0
    ? Object.fromEntries(Object.entries(record).filter(([k]) => k !== key))
    : { ...record, [key]: inner };
}

/** The URL as read-only text, each part in its colour. */
function UrlParts({ url }: { url: string }) {
  const match = /^(\w+:\/\/)([^/?#]+)([^?#]*)(?:\?(.*))?$/.exec(url);
  if (match === null) {
    return <>{url}</>;
  }
  const [, protocol, host, path, query] = match;
  const segments = (path ?? "").split("/").filter(Boolean);
  const pairs = query === undefined ? [] : query.split("&");
  return (
    <>
      <span className="url-protocol">{protocol}</span>
      <span className="url-host">{host}</span>
      {segments.map((segment, index) => (
        <span key={index}>
          <span className="url-sign">/</span>
          <span className="url-path">{segment}</span>
        </span>
      ))}
      {pairs.map((pair, index) => {
        const [key, ...rest] = pair.split("=");
        return (
          <span key={index}>
            <span className="url-sign">{index === 0 ? "?" : "&"}</span>
            <span className="url-key">{key}</span>
            {rest.length > 0 && (
              <>
                <span className="url-sign">=</span>
                <span className="url-value">{rest.join("=")}</span>
              </>
            )}
          </span>
        );
      })}
    </>
  );
}

function Remove({ label, onRemove }: { label: string; onRemove(): void }) {
  return (
    <button
      type="button"
      className="try-remove"
      aria-label={label}
      title={label}
      onClick={onRemove}
    >
      <Icon name="cross" size={14} />
    </button>
  );
}

/** A field's whole path, the parents quiet and its own key bright. */
function FieldPath({ path }: { path: readonly string[] }) {
  return (
    <>
      {path.slice(0, -1).map((key, index) => (
        <span key={index} className="try-parent">
          {key}.
        </span>
      ))}
      <span className="try-key">{path[path.length - 1]}</span>
    </>
  );
}

/** The route a scope's `routes.<route>` names, or null for any other field. */
function routeKey(path: readonly string[]): Route | null {
  const key = path[path.length - 1];
  return path[path.length - 2] === "routes" &&
    key !== undefined &&
    key in LEGAL_RELATIONS
    ? (key as Route)
    : null;
}

/** The editor for a field's value: a field, a list, or chips. */
function Editor({
  slot,
  schemas,
  value,
  onChange,
}: {
  slot: Slot;
  schemas: Schemas;
  value: Json;
  onChange(value: Json): void;
}) {
  const { shape } = slot;
  const label = slot.path.join(".");
  if (shape.kind === "array") {
    const items = Array.isArray(value) ? value : [];
    const itemShape = shapeOf(schemas, shape.items);
    if (itemShape.kind === "enum") {
      // A scope's route lists the relations its requests may include or
      // filter by. The spec types that list as any relation; the scope's own
      // contract, which the SDK holds, says which ones each route carries, and
      // a route never relates to itself.
      const route = routeKey(slot.path);
      const choices =
        route === null
          ? itemShape.values
          : itemShape.values.filter(choice =>
              (LEGAL_RELATIONS[route] as readonly string[]).includes(choice),
            );
      // Chips, one for each choice, on where the list has it.
      return (
        <span className="try-chips-row">
          <span className="try-chips" role="group" aria-label={label}>
            {choices.map(choice => {
              const on = items.includes(choice);
              return (
                <button
                  key={choice}
                  type="button"
                  className="try-chip"
                  aria-pressed={on}
                  onClick={() =>
                    onChange(
                      on
                        ? items.filter(item => item !== choice)
                        : choices.filter(
                            each => each === choice || items.includes(each),
                          ),
                    )
                  }
                >
                  {choice}
                </button>
              );
            })}
          </span>
          {route !== null && (
            <span className="try-hint try-hint-line">
              {items.length === 0
                ? "none on: searches it, with nothing related"
                : "may include / filter by"}
            </span>
          )}
        </span>
      );
    }
    return (
      <input
        type="text"
        className="try-input"
        aria-label={label}
        {...NO_FILL_ATTRIBUTES}
        value={items.map(String).join(", ")}
        onChange={event =>
          onChange(
            event.target.value
              .split(",")
              .map(item => item.trim())
              .filter(Boolean),
          )
        }
      />
    );
  }
  if (shape.kind === "enum" || shape.kind === "boolean") {
    const choices = shape.kind === "enum" ? shape.values : ["true", "false"];
    return (
      <select
        className="try-input"
        aria-label={label}
        value={String(value)}
        onChange={event =>
          onChange(
            shape.kind === "boolean"
              ? event.target.value === "true"
              : event.target.value,
          )
        }
      >
        {choices.map(choice => (
          <option key={choice} value={choice}>
            {choice}
          </option>
        ))}
      </select>
    );
  }
  if (shape.kind === "number") {
    return (
      <span className="try-number">
        <input
          type="number"
          className="try-input"
          aria-label={label}
          {...NO_FILL_ATTRIBUTES}
          {...(shape.min !== undefined ? { min: shape.min } : {})}
          {...(shape.max !== undefined ? { max: shape.max } : {})}
          value={value === null ? "" : String(value)}
          onChange={event => {
            const text = event.target.value;
            const number = Number(text);
            onChange(text === "" || Number.isNaN(number) ? text : number);
          }}
        />
        {shape.min !== undefined && shape.max !== undefined && (
          <span className="try-hint">
            {shape.min} to {shape.max}
          </span>
        )}
      </span>
    );
  }
  return (
    <input
      type="text"
      className="try-input"
      aria-label={label}
      {...NO_FILL_ATTRIBUTES}
      value={typeof value === "string" ? value : JSON.stringify(value ?? "")}
      onChange={event => onChange(event.target.value)}
    />
  );
}

/**
 * A table's head, which is its section's title too: the first column says what
 * the rows are (Headers, Query, Body), the second that each holds a value.
 */
function Head({ title }: { title: string }) {
  return (
    <thead>
      <tr>
        <th scope="col" className="try-col-name">
          {title}
        </th>
        <th scope="col">Value</th>
        <th scope="col" className="try-actions">
          <span className="visually-hidden">Remove</span>
        </th>
      </tr>
    </thead>
  );
}

/** What a sent request came back with, for the response block's live tab. */
export interface LiveResponse {
  /** The HTTP status, or null where the request never completed. */
  status: number | null;
  ms: number;
  /** The body, as JSON laid out where it is JSON, else as it came. */
  body: string;
  json: boolean;
}

/** Headers a page may not set: the browser sends its own. */
const BROWSER_HEADERS = new Set(["origin", "host", "content-length", "cookie"]);

/**
 * Headers the form shows but does not take: the browser's own, and the body's
 * type, which is the API's.
 */
const FIXED_HEADERS: Readonly<Record<string, string>> = {
  origin: "Your browser sends this page's own",
  "content-type": "The API takes JSON",
};

/** Where a header's row goes: Content-Type, Origin, then the rest as sent. */
function headerRank(name: string): number {
  const fixed = Object.keys(FIXED_HEADERS);
  const at = [
    "content-type",
    ...fixed.filter(each => each !== "content-type"),
  ].indexOf(name.toLowerCase());
  return at === -1 ? fixed.length : at;
}

/** A required row's asterisk, which a screen reader hears as a word. */
function Required() {
  return (
    <>
      <span className="try-required" aria-hidden="true">
        *
      </span>
      <span className="visually-hidden"> (required)</span>
    </>
  );
}

/**
 * Where the page sends a request: in `pnpm site` through the dev server, which
 * forwards it (or answers it, on made-up data), as the demo's calls go; built,
 * to the URL it shows.
 */
function sendTarget(url: string): string {
  return import.meta.env.DEV
    ? url.replace(/^https?:\/\/[^/]+/, "/_baselayer")
    : url;
}

/** The request as HTTP writes it: the line, the headers, then the body. */
function HttpRequest({
  method,
  url,
  headers,
  body,
}: {
  method: string;
  url: string;
  headers: readonly Pair[];
  body: string | null;
}) {
  const at = new URL(url);
  return (
    <pre className="try-request">
      <span className="http-method">{method.toUpperCase()}</span>{" "}
      <span className="http-path">
        {at.pathname}
        {at.search}
      </span>{" "}
      <span className="http-version">HTTP/1.1</span>
      {"\n"}
      <span className="http-name">Host</span>
      {": "}
      {at.host}
      {"\n"}
      {headers.map(header => (
        <span key={header.name}>
          <span className="http-name">{header.name}</span>
          {": "}
          {BROWSER_HEADERS.has(header.name.toLowerCase()) ? (
            <span className="http-note">
              {typeof window === "undefined" ? "" : window.location.origin} (set
              by your browser)
            </span>
          ) : (
            header.value
          )}
          {"\n"}
        </span>
      ))}
      {body !== null && (
        <>
          {"\n"}
          <span className="http-body">{body}</span>
        </>
      )}
    </pre>
  );
}

/** How a sent request ended, as the status bar says it. */
interface Outcome {
  status: number | null;
  ms: number;
  ok: boolean;
  /** For a refusal, its code and message; for a failure, what failed. */
  detail: string | null;
}

/** A refusal's reason, from its body: the code and the message, or a 422's. */
function refusalOf(body: unknown): string | null {
  if (body === null || typeof body !== "object") {
    return null;
  }
  const record = body as Record<string, unknown>;
  if (typeof record.message === "string") {
    return record.code === undefined || record.code === null
      ? record.message
      : `${String(record.code)} · ${record.message}`;
  }
  const first = Array.isArray(record.detail) ? record.detail[0] : undefined;
  if (first !== null && typeof first === "object") {
    const { loc, msg } = first as { loc?: unknown[]; msg?: string };
    return [Array.isArray(loc) ? loc.join(".") : null, msg]
      .filter(Boolean)
      .join(": ");
  }
  return null;
}

let nextRow = 0;
const withIds = (pairs: readonly Pair[]) =>
  pairs.map(pair => ({ ...pair, id: (nextRow += 1) }));

export function TryIt({
  method,
  sample,
  body: bodySchema,
  parameters,
  labels,
  required,
  schemas,
  onCode,
  onResponse,
}: {
  method: string;
  sample: Sample;
  /** The body's schema, for a request that takes one. */
  body: JsonSchema | undefined;
  /** The query parameters the operation names, which the form offers. */
  parameters: readonly string[];
  /** The samples' labels, each written from the form as it is edited. */
  labels: readonly string[];
  /** The headers and query parameters the operation requires, by name. */
  required: readonly string[];
  /** The document's schemas, which the body's `$ref`s point into. */
  schemas: Schemas;
  /** The samples, by label, written from the form. */
  onCode(codes: Readonly<Record<string, string>>): void;
  /** What a sent request came back with. */
  onResponse(response: LiveResponse): void;
}) {
  // The browser sends its own Origin, this page's, so that is what it shows.
  const [headers, setHeaders] = useState(() =>
    sample.headers.map(header =>
      header.name.toLowerCase() === "origin" && typeof window !== "undefined"
        ? { ...header, value: window.location.origin }
        : header,
    ),
  );
  const [result, setResult] = useState<Outcome | null>(null);
  const [query, setQuery] = useState(() => withIds(sample.query));
  const [body, setBody] = useState<Json | undefined>(() =>
    bodySchema === undefined ? undefined : ((sample.body as Json) ?? {}),
  );
  const [sending, setSending] = useState(false);
  const [showRequest, setShowRequest] = useState(false);
  const previewId = useId();
  const url = urlOf(sample.url, query);
  const takesQuery = parameters.length > 0 || sample.query.length > 0;
  // The fixed headers first, then the ones to fill in, so those sit by the
  // fields below; the request itself keeps the sample's order.
  const shownHeaders = [...headers].sort(
    (a, b) => headerRank(a.name) - headerRank(b.name),
  );
  const isRequired = (name: string) =>
    required.some(each => each.toLowerCase() === name.toLowerCase());
  const absentParameters = parameters.filter(
    name => !query.some(pair => pair.name === name),
  );
  const slots = bodySchema === undefined ? [] : slotsOf(schemas, bodySchema);
  const held = slots.filter(slot => getAt(body, slot.path) !== undefined);
  const free = slots.filter(slot => getAt(body, slot.path) === undefined);
  const sentBody = body === undefined ? null : JSON.stringify(body, null, 2);
  const sentHeaders = headers.filter(header => header.name.trim() !== "");

  const labelsKey = labels.join("\n");
  useEffect(() => {
    onCode(
      samplesOf(
        { method, url: sample.url, headers, query, body },
        labelsKey.split("\n"),
      ),
    );
  }, [onCode, method, sample.url, headers, query, body, labelsKey]);

  const send = async () => {
    setSending(true);
    const started = performance.now();
    const elapsed = () => Math.round(performance.now() - started);
    try {
      const response = await fetch(sendTarget(url), {
        method: method.toUpperCase(),
        headers: Object.fromEntries(
          sentHeaders
            .filter(header => !BROWSER_HEADERS.has(header.name.toLowerCase()))
            .map(header => [header.name, header.value]),
        ),
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        credentials: "omit",
      });
      const text = await response.text();
      let json = false;
      let shown = text;
      try {
        shown = JSON.stringify(JSON.parse(text), null, 2);
        json = true;
      } catch {
        // Not JSON: shown as it came.
      }
      const ms = elapsed();
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }
      setResult({
        status: response.status,
        ms,
        ok: response.ok,
        detail: response.ok ? null : refusalOf(parsed),
      });
      onResponse({ status: response.status, ms, body: shown, json });
    } catch (error) {
      setResult({
        status: null,
        ms: elapsed(),
        ok: false,
        detail: `Did not reach the API: ${String(error)}`,
      });
      onResponse({
        status: null,
        ms: elapsed(),
        body: `The request did not complete: ${String(error)}\n\nA browser keeps an answer from a page the API does not admit, and drops a request it cannot send.`,
        json: false,
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="try">
      <div className="try-url-box">
        <span className={`try-method try-method-${method.toLowerCase()}`}>
          {method.toUpperCase()}
        </span>
        <code className="try-url" data-testid="try-url">
          <UrlParts url={url} />
        </code>
        <button
          type="button"
          className="try-send"
          onClick={() => void send()}
          aria-disabled={sending || undefined}
          disabled={sending}
        >
          <Icon name="send" size={14} />
          {sending ? "Sending…" : "Send"}
        </button>
      </div>

      <table className="try-table">
        <Head title="Headers" />
        <tbody>
          {shownHeaders.map(header => (
            <tr key={header.name}>
              <th scope="row" className="try-name">
                <span className="try-key">{header.name}</span>
                {/* A fixed header is filled in already: nothing to require. */}
                {isRequired(header.name) &&
                  FIXED_HEADERS[header.name.toLowerCase()] === undefined && (
                    <Required />
                  )}
              </th>
              <td>
                <input
                  type="text"
                  className="try-input"
                  aria-label={`Header ${header.name}`}
                  {...NO_FILL_ATTRIBUTES}
                  readOnly={
                    FIXED_HEADERS[header.name.toLowerCase()] !== undefined
                  }
                  title={FIXED_HEADERS[header.name.toLowerCase()]}
                  value={header.value}
                  onChange={event =>
                    setHeaders(
                      headers.map(h =>
                        h.name === header.name
                          ? { ...h, value: event.target.value }
                          : h,
                      ),
                    )
                  }
                />
              </td>
              <td className="try-actions" />
            </tr>
          ))}
        </tbody>
      </table>

      {takesQuery && (
        <table className="try-table">
          <Head title="Query" />
          <tbody>
            {query.map(pair => (
              <tr key={pair.id}>
                <th scope="row" className="try-name">
                  <span className="try-key">{pair.name}</span>
                  {isRequired(pair.name) && <Required />}
                </th>
                <td>
                  <input
                    type="text"
                    className="try-input"
                    aria-label={`Value of query parameter ${pair.name}`}
                    {...NO_FILL_ATTRIBUTES}
                    value={pair.value}
                    onChange={event =>
                      setQuery(
                        query.map(p =>
                          p.id === pair.id
                            ? { ...p, value: event.target.value }
                            : p,
                        ),
                      )
                    }
                  />
                </td>
                <td className="try-actions">
                  {!isRequired(pair.name) && (
                    <Remove
                      label={`Remove query parameter ${pair.name}`}
                      onRemove={() =>
                        setQuery(query.filter(p => p.id !== pair.id))
                      }
                    />
                  )}
                </td>
              </tr>
            ))}
            {absentParameters.length > 0 && (
              <tr className="try-addrow">
                <td />
                <td colSpan={2}>
                  <span
                    className="try-chips"
                    role="group"
                    aria-label="Add a query parameter"
                  >
                    {absentParameters.map(name => (
                      <button
                        key={name}
                        type="button"
                        className="try-add"
                        onClick={() =>
                          setQuery([
                            ...query,
                            ...withIds([{ name, value: "" }]),
                          ])
                        }
                      >
                        <Icon name="plus" size={12} />
                        {name}
                      </button>
                    ))}
                  </span>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {bodySchema !== undefined && body !== undefined && (
        <table className="try-table">
          <Head title="Body" />
          <tbody>
            {held.map(slot => {
              const path = slot.path.join(".");
              return (
                <tr key={path}>
                  <th scope="row" className="try-name">
                    <FieldPath path={slot.path} />
                    {slot.required && <Required />}
                  </th>
                  <td>
                    <Editor
                      slot={slot}
                      schemas={schemas}
                      value={getAt(body, slot.path) ?? null}
                      onChange={next => setBody(setAt(body, slot.path, next))}
                    />
                  </td>
                  <td className="try-actions">
                    {!slot.required && (
                      <Remove
                        label={`Remove ${path}`}
                        onRemove={() => setBody(removeAt(body, slot.path))}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
            {/* With no route listed the body leaves `routes` out, which the
                API reads as every route, not none (an empty `routes` is a
                422): said where the routes would be. */}
            {free.some(slot => routeKey(slot.path) !== null) &&
              !held.some(slot => routeKey(slot.path) !== null) && (
                <tr className="try-note">
                  <td />
                  <td colSpan={2}>
                    No route listed, so <code>scope.routes</code> is left out:
                    the session may search every route your organization may,
                    with every relation.
                  </td>
                </tr>
              )}
            {free.length > 0 && (
              <tr className="try-addrow">
                <td />
                <td colSpan={2}>
                  <span
                    className="try-chips"
                    role="group"
                    aria-label="Add a body field"
                  >
                    {free.map(slot => (
                      <button
                        key={slot.path.join(".")}
                        type="button"
                        className="try-add"
                        onClick={() =>
                          setBody(
                            setAt(body, slot.path, defaultFor(schemas, slot)),
                          )
                        }
                      >
                        <Icon name="plus" size={12} />
                        {slot.path.join(".")}
                      </button>
                    ))}
                  </span>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      <div className="try-status">
        <button
          type="button"
          className="try-status-bar"
          aria-expanded={showRequest}
          aria-controls={previewId}
          onClick={() => setShowRequest(open => !open)}
        >
          {result !== null && (
            <span
              className="try-outcome"
              data-ok={result.ok ? "true" : "false"}
              role="status"
            >
              <span className="try-outcome-status">
                {result.status ?? "Failed"}
              </span>
              {result.detail !== null && (
                <span className="try-outcome-detail">{result.detail}</span>
              )}
              <span className="try-outcome-ms">{result.ms} ms</span>
            </span>
          )}
          <span className="try-status-text">
            <Icon name="code" size={15} />
            <span className="try-status-what">Request</span>
            <span className="try-status-summary">
              {method.toUpperCase()} {new URL(url).pathname}
              {" · "}
              {sentHeaders.length} header{sentHeaders.length === 1 ? "" : "s"}
              {sentBody !== null &&
                ` · body ${new TextEncoder().encode(JSON.stringify(body)).length} B`}
            </span>
          </span>
          <span className="try-status-open">
            {showRequest ? "Hide" : "Show"}{" "}
            {sentBody !== null ? "headers and body" : "headers"}
            <span
              className="try-chevron"
              data-open={showRequest ? "true" : "false"}
            >
              <Icon name="chevron" size={16} />
            </span>
          </span>
        </button>
        {/* Unfolds as a grid row grows from nothing to its content, so it
            animates without a measured height; out of reach while folded. */}
        <div
          id={previewId}
          className="try-preview"
          data-open={showRequest ? "true" : "false"}
          inert={!showRequest}
          aria-hidden={!showRequest}
        >
          <div className="try-preview-inner">
            <HttpRequest
              method={method}
              url={url}
              headers={sentHeaders}
              body={sentBody}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
