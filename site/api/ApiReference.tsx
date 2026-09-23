// The API reference, rendered from one OpenAPI document and nothing else:
// the sections, the fields, the refusals and the examples all come from
// `virtual:api-reference` (contracts/ + the overlay, assembled at build
// time). Nothing here names a route.

import { Fragment, useEffect, useState } from "react";
import { document, html } from "virtual:api-reference";

import { Code, type Snippet } from "../shared/Code";
import { SiteFooter } from "../shared/SiteFooter";
import { SiteHeader } from "../shared/SiteHeader";
import {
  describeType,
  fieldRows,
  operations,
  schemaOf,
  sections,
  snippetLang,
  type OperationEntry,
  type Section,
} from "./model";
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

function FieldList({ schema }: { schema: JsonSchema | undefined }) {
  if (schema === undefined) {
    return null;
  }
  const rows = fieldRows(schema);
  return (
    <dl className="fields">
      {rows.map(row => (
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
            {row.depth > 0 && <span className="field-path">{row.path}</span>}
          </dt>
          <dd>
            <Markdown text={row.description} inline />
            {row.values.length > 0 && (
              <p className="field-values">
                One of{" "}
                {row.values.map((value, i) => (
                  <Fragment key={value}>
                    {i > 0 && ", "}
                    <code>{value}</code>
                  </Fragment>
                ))}
                .
              </p>
            )}
            {row.sameAs !== null && (
              <p className="field-values">
                Same shape as <code>{row.sameAs}</code>.
              </p>
            )}
          </dd>
        </div>
      ))}
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
  const successes = responses.filter(([status]) => status.startsWith("2"));
  const refusals = responses.filter(([status]) => !status.startsWith("2"));
  const request = requestSnippets(operation);
  const examples = responseSnippets(operation);

  return (
    <section
      className="panel"
      id={entry.id}
      aria-labelledby={`${entry.id}-title`}
    >
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
            {request.length > 0 && <Code title="Request" snippets={request} />}
            {examples.length > 0 && (
              <Code title="Response" snippets={examples} />
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

function useActiveSection(ids: string[]): string {
  const [active, setActive] = useState(ids[0] ?? "");
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        const visible = entries
          .filter(entry => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0] !== undefined) setActive(visible[0].target.id);
      },
      { rootMargin: "-90px 0px -60% 0px" },
    );
    for (const id of ids) {
      const element = window.document.getElementById(id);
      if (element !== null) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [ids]);
  return active;
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

export function ApiReference() {
  const ids = sections.map(section => section.id);
  const active = useActiveSection(ids);
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
        <div className="reference-body">
          {sections.map((section, i) => (
            <SectionView key={section.id} section={section} index={i + 1} />
          ))}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
