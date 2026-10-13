import {
  parseErrorEnvelope,
  parseSuggestResponse,
  validationErrors,
  type Route,
} from "@baselayer-sdk/autocomplete";
import { describe, expect, it } from "vitest";

import { buildReference } from "../../site/api/spec/plugin";

// The page's document, assembled from contracts/ as the build assembles it.
const { document: reference } = buildReference(process.cwd());

interface Example {
  value: unknown;
}

/** The examples a route documents for a status, by name. */
function examplesOf(path: string, status: string): [string, unknown][] {
  const operation = reference.paths[path]!["get"]!;
  const response = operation.responses[status] as
    | { content?: Record<string, { examples?: Record<string, Example> }> }
    | undefined;
  const examples = response?.content?.["application/json"]?.examples ?? {};
  return Object.entries(examples).map(([name, example]) => [
    name,
    example.value,
  ]);
}

describe("the reference's examples", () => {
  const routes: Route[] = ["businesses", "people", "addresses"];

  it.each(routes)("show a %s answer the SDK's own decoder reads", route => {
    const examples = examplesOf(`/autocomplete/${route}`, "200");

    expect(examples.length).toBeGreaterThan(0);
    for (const [, value] of examples) {
      expect(() => parseSuggestResponse(route, value)).not.toThrow();
    }
  });

  it("show a refused filter as the envelope that names its parameters", () => {
    const [[, value]] = examplesOf("/autocomplete/businesses", "422") as [
      [string, unknown],
    ];

    const envelope = parseErrorEnvelope(value)!;

    expect(envelope.code).toBe(422);
    expect(envelope.metadata?.reason).toBe("request_invalid");
    expect(validationErrors(envelope).map(error => error.loc)).toEqual([
      ["query", "q"],
    ]);
  });
});
