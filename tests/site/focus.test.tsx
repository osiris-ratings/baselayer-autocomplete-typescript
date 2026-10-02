/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { useFocusWithin } from "../../site/demo/focus";

function Fields() {
  const [within, bind] = useFocusWithin();
  return (
    <>
      <div
        data-testid="group"
        data-within={within ? "true" : "false"}
        {...bind}
      >
        <input aria-label="first" />
        <input aria-label="second" />
      </div>
      <input aria-label="outside" />
    </>
  );
}

afterEach(cleanup);

const within = () => screen.getByTestId("group").dataset["within"];

describe("useFocusWithin", () => {
  it("is on while focus is in one of the fields", () => {
    render(<Fields />);
    expect(within()).toBe("false");

    fireEvent.focus(screen.getByLabelText("first"));

    expect(within()).toBe("true");
  });

  it("stays on as focus moves from one field to another", () => {
    render(<Fields />);
    const first = screen.getByLabelText("first");
    const second = screen.getByLabelText("second");
    fireEvent.focus(first);

    fireEvent.blur(first, { relatedTarget: second });
    fireEvent.focus(second);

    expect(within()).toBe("true");
  });

  it("goes off when focus leaves them all, for another element or for none", () => {
    render(<Fields />);
    const first = screen.getByLabelText("first");
    fireEvent.focus(first);
    fireEvent.blur(first, { relatedTarget: screen.getByLabelText("outside") });
    expect(within()).toBe("false");

    fireEvent.focus(first);
    fireEvent.blur(first, { relatedTarget: null });
    expect(within()).toBe("false");
  });
});
