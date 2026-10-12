// An operation's "Try it here" tab: its request as an editor, inside the code
// block. The URL on top follows every edit; the headers take values; the query
// parameters can be renamed, added and removed; and the body reads as its JSON,
// highlighted, with a field for every value. A body's keys are the schema's,
// never typed: `+ add` offers the ones it does not have yet. The copy button
// takes the request as curl. It sends nothing: the session mint takes an API
// key, which belongs on a backend, and the autocomplete routes take a session.

import {
  createContext,
  Fragment,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { NO_FILL_ATTRIBUTES } from "../../src/react/inputAttributes";
import type { JsonSchema } from "./spec/assemble";
import { curlOf, urlOf, type Pair, type Sample } from "./curl";
import { resolveIn, type Schemas } from "./schema";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** What the editor draws for a schema. */
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

/** A new value for a schema: an example where it has one, else its least. */
function defaultFor(
  schemas: Schemas,
  schema: JsonSchema | undefined,
  taken: string[] = [],
): Json {
  const shape = shapeOf(schemas, schema);
  const example =
    schema === undefined
      ? undefined
      : (schema.examples?.[0] ?? resolveIn(schemas, schema).examples?.[0]);
  switch (shape.kind) {
    case "object":
      return Object.fromEntries(
        shape.required.map(key => [
          key,
          defaultFor(schemas, shape.properties[key]),
        ]),
      );
    case "map":
      return {};
    case "array":
      return [];
    case "enum":
      return shape.values.find(value => !taken.includes(value)) ?? "";
    case "number":
      return typeof example === "number" ? example : (shape.min ?? 0);
    case "boolean":
      return false;
    case "string":
      return typeof example === "string" ? example : "";
  }
}

/** The document's schemas, which a body's `$ref`s point into. */
const SchemasOf = createContext<Schemas>({});

/** Room for what a field holds, so a short value keeps a short field. */
const sizeOf = (text: string) => Math.max(4, Math.min(48, text.length + 1));

function Sign({ children }: { children: ReactNode }) {
  return <span className="try-sign">{children}</span>;
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
      ×
    </button>
  );
}

/**
 * `+ add`: a button, which adds at once where anything may be added, and
 * otherwise opens the choices in line, each a button, until one is taken.
 */
function Add({
  label,
  choices,
  onAdd,
}: {
  label: string;
  choices: string[] | null;
  onAdd(choice: string): void;
}) {
  const [open, setOpen] = useState(false);
  if (choices !== null && choices.length === 0) {
    return null;
  }
  if (!open || choices === null) {
    return (
      <button
        type="button"
        className="try-add"
        aria-label={label}
        aria-expanded={choices === null ? undefined : false}
        onClick={() => (choices === null ? onAdd("") : setOpen(true))}
      >
        + add
      </button>
    );
  }
  return (
    <span className="try-choices" role="group" aria-label={label}>
      {choices.map(choice => (
        <button
          key={choice}
          type="button"
          className="try-choice"
          onClick={() => {
            setOpen(false);
            onAdd(choice);
          }}
        >
          {choice}
        </button>
      ))}
      <button
        type="button"
        className="try-remove"
        aria-label="Cancel"
        title="Cancel"
        onClick={() => setOpen(false)}
      >
        ×
      </button>
    </span>
  );
}

/** A value of the body, drawn as its JSON with a field for each scalar. */
function Value({
  schema,
  value,
  path,
  onChange,
}: {
  schema: JsonSchema | undefined;
  value: Json;
  path: string;
  onChange(value: Json): void;
}) {
  const schemas = useContext(SchemasOf);
  const shape = shapeOf(schemas, schema);
  const at = (key: string) => (path === "" ? key : `${path}.${key}`);

  if (shape.kind === "object" || shape.kind === "map") {
    const entries = Object.entries(
      value !== null && typeof value === "object" && !Array.isArray(value)
        ? value
        : {},
    );
    const present = entries.map(([key]) => key);
    const addable =
      shape.kind === "object"
        ? Object.keys(shape.properties).filter(key => !present.includes(key))
        : shape.keys.filter(key => !present.includes(key));
    const childSchema = (key: string) =>
      shape.kind === "object" ? shape.properties[key] : shape.holds;
    const set = (next: [string, Json][]) => onChange(Object.fromEntries(next));
    return (
      <>
        <Sign>{"{"}</Sign>
        <div className="try-block">
          {entries.map(([key, entry], index) => (
            <div className="try-line" key={key}>
              <span className="try-key">{JSON.stringify(key)}</span>
              <Sign>: </Sign>
              <Value
                schema={childSchema(key)}
                value={entry}
                path={at(key)}
                onChange={next =>
                  set(entries.map(([k, v]) => [k, k === key ? next : v]))
                }
              />
              {index < entries.length - 1 && <Sign>,</Sign>}
              {(shape.kind === "map" || !shape.required.includes(key)) && (
                <Remove
                  label={`Remove ${at(key)}`}
                  onRemove={() => set(entries.filter(([k]) => k !== key))}
                />
              )}
            </div>
          ))}
          {addable.length > 0 && (
            <div className="try-line">
              <Add
                label={`Add a key to ${path === "" ? "the body" : path}`}
                choices={addable}
                onAdd={key =>
                  set([
                    ...entries,
                    [key, defaultFor(schemas, childSchema(key))],
                  ])
                }
              />
            </div>
          )}
        </div>
        <Sign>{"}"}</Sign>
      </>
    );
  }

  if (shape.kind === "array") {
    const items = Array.isArray(value) ? value : [];
    const itemShape = shapeOf(schemas, shape.items);
    const taken = items.map(String);
    const choices =
      itemShape.kind === "enum"
        ? itemShape.values.filter(choice => !taken.includes(choice))
        : null;
    return (
      <>
        <Sign>[</Sign>
        {items.map((item, index) => (
          <Fragment key={index}>
            <Value
              schema={shape.items}
              value={item}
              path={`${path}[${index}]`}
              onChange={next =>
                onChange(items.map((v, i) => (i === index ? next : v)))
              }
            />
            <Remove
              label={`Remove ${path}[${index}]`}
              onRemove={() => onChange(items.filter((_, i) => i !== index))}
            />
            {index < items.length - 1 && <Sign>, </Sign>}
          </Fragment>
        ))}
        <Add
          label={`Add to ${path}`}
          choices={choices}
          onAdd={choice =>
            onChange([
              ...items,
              choice === "" ? defaultFor(schemas, shape.items, taken) : choice,
            ])
          }
        />
        <Sign>]</Sign>
      </>
    );
  }

  if (shape.kind === "enum") {
    return (
      <>
        <Sign>&quot;</Sign>
        <select
          className="try-input"
          aria-label={path}
          value={String(value)}
          onChange={event => onChange(event.target.value)}
        >
          {shape.values.map(choice => (
            <option key={choice} value={choice}>
              {choice}
            </option>
          ))}
        </select>
        <Sign>&quot;</Sign>
      </>
    );
  }

  if (shape.kind === "boolean") {
    return (
      <select
        className="try-input"
        aria-label={path}
        value={String(value)}
        onChange={event => onChange(event.target.value === "true")}
      >
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    );
  }

  if (shape.kind === "number") {
    return (
      <input
        type="number"
        className="try-input try-number"
        aria-label={path}
        {...NO_FILL_ATTRIBUTES}
        {...(shape.min !== undefined ? { min: shape.min } : {})}
        {...(shape.max !== undefined ? { max: shape.max } : {})}
        size={sizeOf(String(value))}
        value={value === null ? "" : String(value)}
        onChange={event => {
          const text = event.target.value;
          const number = Number(text);
          onChange(text === "" || Number.isNaN(number) ? text : number);
        }}
      />
    );
  }

  return (
    <>
      <Sign>&quot;</Sign>
      <input
        type="text"
        className="try-input"
        aria-label={path}
        {...NO_FILL_ATTRIBUTES}
        size={sizeOf(String(value ?? ""))}
        value={String(value ?? "")}
        onChange={event => onChange(event.target.value)}
      />
      <Sign>&quot;</Sign>
    </>
  );
}

let nextRow = 0;
const withIds = (pairs: readonly Pair[]) =>
  pairs.map(pair => ({ ...pair, id: (nextRow += 1) }));

export function TryIt({
  method,
  sample,
  body: bodySchema,
  schemas,
  onCode,
}: {
  method: string;
  sample: Sample;
  /** The document's schemas, which the body's `$ref`s point into. */
  schemas: Schemas;
  /** The body's schema, for a request that takes one. */
  body: JsonSchema | undefined;
  onCode(code: string): void;
}) {
  const [headers, setHeaders] = useState(() => sample.headers);
  const [query, setQuery] = useState(() => withIds(sample.query));
  const [body, setBody] = useState<Json | undefined>(() =>
    bodySchema === undefined
      ? undefined
      : ((sample.body as Json | undefined) ?? defaultFor(schemas, bodySchema)),
  );
  const url = urlOf(sample.url, query);

  useEffect(() => {
    onCode(curlOf({ method, url, headers, body }));
  }, [onCode, method, url, headers, body]);

  return (
    <div className="try">
      <p className="try-url">
        <span className="try-method">{method.toUpperCase()}</span>{" "}
        <span data-testid="try-url">{url}</span>
      </p>

      <p className="try-label">Headers</p>
      {headers.map((header, index) => (
        <div className="try-line" key={header.name}>
          <span className="try-key">{header.name}</span>
          <Sign>: </Sign>
          <input
            type="text"
            className="try-input"
            aria-label={`Header ${header.name}`}
            {...NO_FILL_ATTRIBUTES}
            size={sizeOf(header.value)}
            value={header.value}
            onChange={event =>
              setHeaders(
                headers.map((h, i) =>
                  i === index ? { ...h, value: event.target.value } : h,
                ),
              )
            }
          />
        </div>
      ))}

      <p className="try-label">Query parameters</p>
      {query.map((pair, index) => (
        <div className="try-line" key={pair.id}>
          <input
            type="text"
            className="try-input"
            aria-label={`Name of query parameter ${index + 1}`}
            {...NO_FILL_ATTRIBUTES}
            size={sizeOf(pair.name)}
            value={pair.name}
            onChange={event =>
              setQuery(
                query.map(p =>
                  p.id === pair.id ? { ...p, name: event.target.value } : p,
                ),
              )
            }
          />
          <Sign>=</Sign>
          <input
            type="text"
            className="try-input"
            aria-label={`Value of query parameter ${pair.name || index + 1}`}
            {...NO_FILL_ATTRIBUTES}
            size={sizeOf(pair.value)}
            value={pair.value}
            onChange={event =>
              setQuery(
                query.map(p =>
                  p.id === pair.id ? { ...p, value: event.target.value } : p,
                ),
              )
            }
          />
          <Remove
            label={`Remove query parameter ${pair.name || index + 1}`}
            onRemove={() => setQuery(query.filter(p => p.id !== pair.id))}
          />
        </div>
      ))}
      <div className="try-line">
        <Add
          label="Add a query parameter"
          choices={null}
          onAdd={() =>
            setQuery([...query, ...withIds([{ name: "", value: "" }])])
          }
        />
      </div>

      {bodySchema !== undefined && body !== undefined && (
        <>
          <p className="try-label">Body</p>
          <div className="try-body">
            <SchemasOf.Provider value={schemas}>
              <Value
                schema={bodySchema}
                value={body}
                path=""
                onChange={setBody}
              />
            </SchemasOf.Provider>
          </div>
        </>
      )}
    </div>
  );
}
