// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Code } from "../../site/shared/Code";
import { indentJson, jsonHtml } from "../../site/shared/json";

afterEach(cleanup);

describe("JSON as the site draws it", () => {
  it("indents it, and gives null a colour of its own", () => {
    const html = jsonHtml('{"a":null,"b":true,"c":"null"}');
    expect(html.split('class="sh__line"')).toHaveLength(6);
    expect(html).toContain("color:var(--json-null)");
    // true keeps the highlighter's own; a string that says null stays a string.
    expect(html).toContain('style="color:var(--sh-keyword)">true<');
    expect(html).toContain("&quot;null&quot;");
  });

  it("escapes what it is given", () => {
    expect(jsonHtml('{"x":"<b>"}')).toContain("&lt;b&gt;");
  });

  it("leaves text that is no JSON as it is", () => {
    expect(indentJson("not json {")).toBe("not json {");
  });
});

describe("a code block's JSON", () => {
  it("is drawn in the rich palette, and anything else as the highlighter colours it", () => {
    render(
      <Code
        title="Response"
        snippets={[
          { label: "201", lang: "json", code: '{\n  "ok": null\n}' },
          { label: "curl", lang: "shell", code: "curl -s https://x.test" },
        ]}
      />,
    );
    const json = screen.getByRole("tabpanel").querySelector("code")!;
    expect(json.classList.contains("json-rich")).toBe(true);
    expect(json.innerHTML).toContain("var(--json-null)");
  });
});
