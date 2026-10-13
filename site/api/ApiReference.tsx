// The API reference, rendered from one OpenAPI document and nothing else:
// the sections, the fields, the refusals and the examples all come from
// `virtual:api-reference` (contracts/ + the overlay, assembled at build
// time). Nothing here names a route.

import { Fragment, useState } from "react";
import { document, html } from "virtual:api-reference";

import { Code, type CodeTool, type Snippet } from "../shared/Code";
import { SiteFooter } from "../shared/SiteFooter";
import { SiteHeader } from "../shared/SiteHeader";
import { useScrollSpy } from "../shared/useScrollSpy";
import { fieldTree, visibleRows } from "./fieldTree";
import {
  describeType,
  FORMER_IDS,
  fieldRows,
  operations,
  requestBodyOf,
  schemaOf,
  sections,
  snippetLang,
  type OperationEntry,
  type Section,
} from "./model";
import { SessionCountdown, SessionProvider } from "./session";
import { TryIt, type LiveResponse } from "./TryIt";
import { parseCurl } from "./curl";
import type {
  JsonSchema,
  Operation,
  Parameter,
  Response,
} from "./spec/assemble";

function Markdown({
  text,
  inline = false,
}: {
  text: string | undefined;
  inline?: boolean;
}) {
  if (text === undefined || text === "") {
    return null;
  }
  const rendered = html[text];
  if (rendered === undefined) {
    return <p>{text}</p>;
  }
  return (
    <div
      className={inline ? "md md-inline" : "md"}
      dangerouslySetInnerHTML={{ __html: rendered }}
    />
  );
}

/** What a field may be, written out: a lead, then each value. */
function Choices({ lead, values }: { lead: string; values: string[] }) {
  return (
    <p className="field-values">
      {lead}{" "}
      {values.map((value, i) => (
        <Fragment key={value}>
          {i > 0 && ", "}
          <code>{value}</code>
        </Fragment>
      ))}
      .
    </p>
  );
}

/** A schema this small is shown whole: a long one folds its nested models. */
const SHOWN_WHOLE = 12;

/** A nested model this small is open to begin with, wherever it sits. */
const OPEN_BELOW = 3;

/** The rows a long schema opens to begin with: its small nested models. */
function openToBegin(rows: readonly { path: string; depth: number }[]) {
  if (rows.length <= SHOWN_WHOLE) {
    return new Set(rows.map(row => row.path));
  }
  const open = new Set<string>();
  rows.forEach((row, index) => {
    let beneath = 0;
    for (let next = index + 1; next < rows.length; next++) {
      if (rows[next]!.depth <= row.depth) break;
      beneath += 1;
    }
    if (beneath > 0 && beneath <= OPEN_BELOW) open.add(row.path);
  });
  return open;
}

/**
 * A schema's fields, nested models folded under their parent until opened:
 * a response reads as its top level first, and a reader opens what they came
 * for. A small schema, such as a request body, is open to begin with, and a
 * long one opens its small nested models, so a `scope` of two fields reads
 * at once. A request's fields say which are optional, where a response's say
 * which are required.
 */
function FieldList({
  schema,
  request = false,
}: {
  schema: JsonSchema | undefined;
  request?: boolean;
}) {
  const rows = schema === undefined ? [] : fieldRows(schema);
  const [open, setOpen] = useState<ReadonlySet<string>>(() =>
    openToBegin(rows),
  );
  if (schema === undefined) {
    return null;
  }
  const tree = fieldTree(rows);
  const childCount = new Map(
    rows.map((row, i) => [row.path, tree[i]!.childCount]),
  );
  const toggle = (path: string) =>
    setOpen(previous => {
      const next = new Set(previous);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  return (
    <dl className="fields">
      {visibleRows(rows, open).map(row => {
        const children = childCount.get(row.path) ?? 0;
        const isOpen = open.has(row.path);
        const count = `${children} field${children === 1 ? "" : "s"}`;
        return (
          <div
            key={row.path}
            className="field"
            data-depth={row.depth}
            style={{ marginLeft: `${row.depth * 20}px` }}
          >
            <dt>
              <code className="field-name">{row.name}</code>
              <span className="field-type">{row.type}</span>
              {row.required && <span className="pill">required</span>}
              {request && !row.required && (
                <span className="pill pill-quiet">optional</span>
              )}
              {row.depth > 0 && <span className="field-path">{row.path}</span>}
              {children > 0 && (
                <button
                  type="button"
                  className="field-toggle"
                  aria-expanded={isOpen}
                  aria-label={`${isOpen ? "Hide" : "Show"} the ${count} of ${row.path}`}
                  onClick={() => toggle(row.path)}
                >
                  <span aria-hidden="true">{count}</span>
                  <span
                    className="field-chevron"
                    data-open={isOpen ? "true" : "false"}
                    aria-hidden="true"
                  />
                </button>
              )}
            </dt>
            <dd>
              <Markdown text={row.description} inline />
              {row.values.length > 0 && (
                <Choices lead="One of" values={row.values} />
              )}
              {row.keys.length > 0 && (
                <Choices lead="Each key is one of" values={row.keys} />
              )}
              {row.itemValues.length > 0 && (
                <Choices
                  lead={
                    row.keys.length > 0
                      ? "Each value is a list of any of"
                      : "Any of"
                  }
                  values={row.itemValues}
                />
              )}
              {row.range !== null && (
                <p className="field-values">
                  From <code>{row.range.split(" to ")[0]}</code> to{" "}
                  <code>{row.range.split(" to ")[1]}</code>.
                </p>
              )}
              {row.sameAs !== null && (
                <p className="field-values">
                  Same shape as <code>{row.sameAs}</code>.
                </p>
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function ParameterList({ parameters }: { parameters: Parameter[] }) {
  return (
    <dl className="fields">
      {parameters.map(parameter => (
        <div key={`${parameter.in}-${parameter.name}`} className="field">
          <dt>
            <code className="field-name">{parameter.name}</code>
            <span className="field-type">{describeType(parameter.schema)}</span>
            {parameter.required === true && (
              <span className="pill">required</span>
            )}
          </dt>
          <dd>
            <Markdown text={parameter.description} inline />
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Headers({ response }: { response: Response }) {
  const headers = Object.entries(response.headers ?? {});
  if (headers.length === 0) {
    return null;
  }
  return (
    <dl className="fields">
      {headers.map(([name, header]) => (
        <div key={name} className="field">
          <dt>
            <code className="field-name">{name}</code>
            <span className="field-type">header</span>
          </dt>
          <dd>
            <Markdown text={header.description} inline />
          </dd>
        </div>
      ))}
    </dl>
  );
}

function requestSnippets(operation: Operation): Snippet[] {
  return (operation["x-codeSamples"] ?? []).map(sample => ({
    label: sample.label ?? sample.lang,
    lang: snippetLang(sample.lang),
    code: sample.source,
  }));
}

function responseSnippets(operation: Operation): Snippet[] {
  return Object.entries(operation.responses).flatMap(([status, response]) => {
    const media = response.content?.["application/json"];
    const examples = Object.entries(media?.examples ?? {});
    return examples.map(([name, example]) => ({
      label: examples.length > 1 ? `${status} ${name}` : status,
      lang: "json" as const,
      code: JSON.stringify(example.value, null, 2),
    }));
  });
}

function OperationSection({
  entry,
  index,
}: {
  entry: OperationEntry;
  index: number;
}) {
  const { operation, method, path } = entry;
  const security = (operation.security ?? [])
    .flatMap(requirement => Object.keys(requirement))
    .map(name => ({
      name,
      scheme: document.components?.securitySchemes?.[name],
    }));
  const headers = [
    ...security.flatMap(({ scheme }) =>
      scheme?.in === "header" && scheme.name !== undefined
        ? [
            {
              name: scheme.name,
              in: "header",
              required: true,
              description: scheme.description ?? "",
            } satisfies Parameter,
          ]
        : [],
    ),
    ...(operation.parameters ?? []).filter(p => p.in === "header"),
  ];
  const groups = [
    { title: "Request headers", parameters: headers },
    {
      title: "Path parameters",
      parameters: (operation.parameters ?? []).filter(p => p.in === "path"),
    },
    {
      title: "Query parameters",
      parameters: (operation.parameters ?? []).filter(p => p.in === "query"),
    },
  ].filter(group => group.parameters.length > 0);
  const responses = Object.entries(operation.responses);
  const requestBody = requestBodyOf(operation);
  const successes = responses.filter(([status]) => status.startsWith("2"));
  const refusals = responses.filter(([status]) => !status.startsWith("2"));
  const request = requestSnippets(operation);
  const examples = responseSnippets(operation);
  // The editor starts from the curl sample, so it asks what the sample asks.
  const curl = (operation["x-codeSamples"] ?? []).find(
    sample => snippetLang(sample.lang) === "shell",
  );
  const sample = curl === undefined ? null : parseCurl(curl.source);
  // What the last request sent from Try it here came back with, numbered so
  // the response block shows each one as it arrives.
  const [live, setLive] = useState<(LiveResponse & { key: number }) | null>(
    null,
  );
  const tryIt: CodeTool | undefined =
    sample === null
      ? undefined
      : {
          label: "Try it here",
          // The tab copies curl; every sample follows the form as it is edited.
          copies: curl?.label ?? curl?.lang ?? "curl",
          render: onCode => (
            <TryIt
              method={method}
              sample={sample}
              body={requestBody?.schema}
              labels={request.map(snippet => snippet.label)}
              required={[
                ...headers.filter(each => each.required === true),
                ...(operation.parameters ?? []).filter(
                  each => each.in === "query" && each.required === true,
                ),
              ].map(each => each.name)}
              parameters={(operation.parameters ?? [])
                .filter(parameter => parameter.in === "query")
                .map(parameter => parameter.name)}
              schemas={document.components?.schemas ?? {}}
              onCode={onCode}
              onResponse={response =>
                setLive(previous => ({
                  ...response,
                  key: (previous?.key ?? 0) + 1,
                }))
              }
            />
          ),
        };

  return (
    <section
      className="panel"
      id={entry.id}
      aria-labelledby={`${entry.id}-title`}
    >
      {FORMER_IDS[entry.id] !== undefined && (
        // Where a link to the section's former id still lands.
        <span id={FORMER_IDS[entry.id]} aria-hidden="true" />
      )}
      <div className="panel-num">{String(index).padStart(2, "0")}</div>
      <div className="panel-body endpoint">
        <div className="endpoint-docs">
          <p className="route">
            <span className={`method method-${method}`}>
              {method.toUpperCase()}
            </span>
            <code>{path}</code>
          </p>
          <h2 className="display-sm" id={`${entry.id}-title`}>
            {operation.summary ?? `${method.toUpperCase()} ${path}`}
          </h2>
          <div className="lede-md">
            <Markdown text={operation.description} />
          </div>
          <div className="endpoint-code">
            {request.length > 0 && (
              <p className="code-caption" aria-hidden="true">
                Request
              </p>
            )}
            {request.length > 0 && (
              <Code
                title="Request"
                snippets={request}
                {...(tryIt !== undefined ? { tool: tryIt } : {})}
              />
            )}
            {(examples.length > 0 || live !== null) && (
              <p className="code-caption" aria-hidden="true">
                Response
              </p>
            )}
            {(examples.length > 0 || live !== null) && (
              <Code
                title="Response"
                snippets={examples}
                live={
                  live === null
                    ? null
                    : {
                        key: live.key,
                        label: `Live · ${live.status ?? "failed"}`,
                        lang: live.json ? "json" : "plaintext",
                        code: live.body,
                        ...(live.expiresAt !== undefined
                          ? {
                              note: (
                                <SessionCountdown expiresAt={live.expiresAt} />
                              ),
                            }
                          : {}),
                      }
                }
              />
            )}
          </div>

          {groups.map(group => (
            <Fragment key={group.title}>
              <h3 className="subhead">{group.title}</h3>
              <ParameterList parameters={group.parameters} />
            </Fragment>
          ))}
          {method !== "get" && operation["requestBody"] === undefined && (
            <p className="note">No request body.</p>
          )}
          {requestBody !== undefined && (
            <>
              <h3 className="subhead">
                Request body{" "}
                {requestBody.optional && (
                  <span className="pill pill-quiet">optional</span>
                )}
              </h3>
              <Markdown text={requestBody.description} />
              <FieldList schema={requestBody.schema} request />
            </>
          )}

          {successes.map(([status, response]) => (
            <Fragment key={status}>
              <h3 className="subhead">
                Response <span className="pill">{status}</span>
              </h3>
              <Markdown text={response.description} />
              {Object.keys(response.headers ?? {}).length > 0 && (
                <p className="mono-label field-group">Headers</p>
              )}
              <Headers response={response} />
              {schemaOf(response) !== undefined && (
                <p className="mono-label field-group">Body</p>
              )}
              <FieldList schema={schemaOf(response)} />
            </Fragment>
          ))}

          {refusals.length > 0 && (
            <>
              <h3 className="subhead">Refusals</h3>
              <dl className="fields refusals">
                {refusals.map(([status, response]) => (
                  <div key={status} className="field">
                    <dt>
                      <span className="pill">{status}</span>
                    </dt>
                    <dd>
                      <Markdown text={response.description} inline />
                      {Object.entries(response.headers ?? {}).map(
                        ([name, header]) => (
                          <p key={name} className="field-values">
                            <code>{name}</code>: {header.description}
                          </p>
                        ),
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function SectionView({ section, index }: { section: Section; index: number }) {
  switch (section.kind) {
    case "overview":
      return (
        <section
          className="panel"
          id={section.id}
          aria-labelledby="overview-title"
        >
          <div className="panel-num">{String(index).padStart(2, "0")}</div>
          <div className="panel-body">
            <p className="eyebrow">API reference</p>
            <h1 className="display" id="overview-title">
              {document.info.title}
            </h1>
            <div className="lede-md">
              <Markdown text={document.info.description} />
            </div>
            <dl className="facts-list">
              {(document.servers ?? []).slice(0, 1).map(server => (
                <div key={server.url}>
                  <dt className="mono-label">Base URL</dt>
                  <dd>
                    <code>{server.url}</code>
                  </dd>
                </div>
              ))}
              <div>
                <dt className="mono-label">Specification</dt>
                <dd>
                  <a href="openapi.json">openapi.json</a>, OpenAPI{" "}
                  {document.openapi}
                </dd>
              </div>
              <div>
                <dt className="mono-label">Routes</dt>
                <dd>{operations.length}</dd>
              </div>
            </dl>
          </div>
        </section>
      );
    case "tag":
      return (
        <section
          className="panel"
          id={section.id}
          aria-labelledby={`${section.id}-title`}
        >
          <div className="panel-num">{String(index).padStart(2, "0")}</div>
          <div className="panel-body">
            <h2 className="display-sm" id={`${section.id}-title`}>
              {section.label}
            </h2>
            <Markdown text={section.tag.description} />
          </div>
        </section>
      );
    case "operation":
      return <OperationSection entry={section.entry} index={index} />;
  }
}

const SECTION_IDS = sections.map(section => section.id);

export function ApiReference() {
  const active = useScrollSpy(SECTION_IDS);
  return (
    <>
      <SiteHeader current="api" />
      <main className="wrap reference">
        <nav className="toc" aria-label="On this page">
          <ul>
            {sections.map(section => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  aria-current={active === section.id ? "location" : undefined}
                >
                  {section.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        {/* One session for the page: a Create a session that succeeds leaves
            it for the autocomplete routes' forms to start from. */}
        <SessionProvider>
          <div className="reference-body">
            {sections.map((section, i) => (
              <SectionView key={section.id} section={section} index={i + 1} />
            ))}
          </div>
        </SessionProvider>
      </main>
      <SiteFooter />
    </>
  );
}
