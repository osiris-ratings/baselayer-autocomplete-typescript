import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";

import { TryIt } from "../../site/api/TryIt";

import "../../site/shared/brand.css";
import "../../site/api/api.css";

let done: (() => void) | null = null;
afterEach(() => {
  done?.();
  done = null;
  vi.unstubAllGlobals();
});

/** A search's Try it here, in a block as wide as the reference's. */
function draw(width: number) {
  const host = document.createElement("div");
  host.className = "code";
  host.style.width = `${width}px`;
  document.body.append(host);
  const root = createRoot(host);
  const tool = document.createElement("div");
  tool.className = "code-tool";
  host.append(tool);
  const inner = createRoot(tool);
  flushSync(() =>
    inner.render(
      <TryIt
        method="get"
        sample={{
          url: "https://api.baselayer.com/autocomplete/people",
          headers: [{ name: "X-Autocomplete-Session", value: "$SESSION" }],
          query: [{ name: "q", value: "dana whit" }],
          body: undefined,
        }}
        body={undefined}
        parameters={["q", "limit"]}
        labels={[]}
        required={["X-Autocomplete-Session", "q"]}
        schemas={{}}
        onCode={() => {}}
        onResponse={() => {}}
      />,
    ),
  );
  done = () => {
    inner.unmount();
    root.unmount();
    host.remove();
  };
  return host;
}

const rect = (element: Element) => element.getBoundingClientRect();

describe("the bar under Try it here, after a refusal", () => {
  for (const width of [640, 400, 320]) {
    it(`keeps how it ended, the request and the unfold control apart at ${width}px`, async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(
          async () =>
            new Response(
              JSON.stringify({
                code: 24,
                message:
                  "Unauthorized access. The given X-API-Key is not recognized, and a long reason follows it.",
              }),
              { status: 401, headers: { "content-type": "application/json" } },
            ),
        ),
      );
      const host = draw(width);

      await userEvent.click(host.querySelector<HTMLElement>(".try-send")!);
      await expect
        .poll(() => host.querySelector(".try-outcome"))
        .not.toBeNull();

      const bar = host.querySelector(".try-status-bar")!;
      const outcome = host.querySelector(".try-outcome")!;
      const ms = host.querySelector(".try-outcome-ms")!;
      const summary = host.querySelector(".try-status-text")!;
      const open = host.querySelector(".try-status-open")!;

      // Nothing runs past the bar's sides.
      expect(bar.scrollWidth).toBeLessThanOrEqual(bar.clientWidth + 1);
      // The timing stays on one line, and how it ended is above the request.
      expect(rect(ms).height).toBeLessThan(24);
      expect(rect(outcome).bottom).toBeLessThanOrEqual(rect(summary).top + 1);
      // The request's summary and the unfold control do not overlap.
      const apart =
        rect(summary).right <= rect(open).left + 1 ||
        rect(summary).bottom <= rect(open).top + 1;
      expect(apart).toBe(true);
    });
  }
});
