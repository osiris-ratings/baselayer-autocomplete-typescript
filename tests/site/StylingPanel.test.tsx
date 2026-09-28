// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { StylingPanel } from "../../site/demo/StylingPanel";
import {
  CUSTOM_FONT,
  DEFAULT_STYLE,
  type StyleState,
} from "../../site/demo/style-state";

afterEach(cleanup);

/** The panel with its state kept, as the demo keeps it. */
function Panel({ initial }: { initial: StyleState }) {
  const [state, setState] = useState(initial);
  return <StylingPanel state={state} onChange={setState} />;
}

/** The select that offers a font of your own. */
function fontSelect(): HTMLSelectElement {
  return screen.getByRole("option", { name: "Your own…" }).closest("select")!;
}

function fontStack(): HTMLInputElement | null {
  return screen.queryByRole("textbox", { name: /Font stack/ });
}

describe("the Font fold", () => {
  it("keeps the font stack's field while it is cleared and retyped", () => {
    render(<Panel initial={DEFAULT_STYLE} />);
    fireEvent.change(fontSelect(), { target: { value: CUSTOM_FONT } });
    const stack = fontStack()!;
    stack.focus();

    fireEvent.change(stack, { target: { value: "" } });
    expect(fontStack()).toBe(stack);
    expect(document.activeElement).toBe(stack);
    expect(fontSelect().value).toBe(CUSTOM_FONT);

    // A stack typed to match one of the choices is still your own.
    fireEvent.change(stack, {
      target: { value: 'system-ui, -apple-system, "Segoe UI", sans-serif' },
    });
    expect(fontStack()).toBe(stack);
    expect(fontSelect().value).toBe(CUSTOM_FONT);
  });

  it("picks afresh when the font is set from elsewhere", () => {
    const own: StyleState = {
      ...DEFAULT_STYLE,
      vars: { ...DEFAULT_STYLE.vars, "--bl-ac-font": '"Inter", sans-serif' },
    };
    const { rerender } = render(
      <StylingPanel state={own} onChange={() => {}} />,
    );
    expect(fontSelect().value).toBe(CUSTOM_FONT);

    rerender(<StylingPanel state={DEFAULT_STYLE} onChange={() => {}} />);
    expect(fontSelect().value).toBe("");
    expect(fontStack()).toBeNull();
  });
});
