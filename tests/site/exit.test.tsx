/** @vitest-environment jsdom */

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useExit } from "../../site/demo/exit";

function Probe({ value, ms = 300 }: { value: string | null; ms?: number }) {
  const { shown, leaving } = useExit(value, ms);
  return (
    <p data-testid="probe" data-leaving={leaving ? "true" : "false"}>
      {shown ?? "nothing"}
    </p>
  );
}

const probe = () => screen.getByTestId("probe");

beforeEach(() => vi.useFakeTimers());

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useExit", () => {
  it("shows nothing, and leaves nothing, when there never was a value", () => {
    render(<Probe value={null} />);

    expect(probe().textContent).toBe("nothing");
    expect(probe().dataset["leaving"]).toBe("false");
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(probe().textContent).toBe("nothing");
  });

  it("shows a value as soon as it comes, not leaving", () => {
    const { rerender } = render(<Probe value={null} />);

    rerender(<Probe value="a" />);

    expect(probe().textContent).toBe("a");
    expect(probe().dataset["leaving"]).toBe("false");
  });

  it("keeps the last value, leaving, for as long as it is told, and then takes it away", () => {
    const { rerender } = render(<Probe value="a" />);

    rerender(<Probe value={null} />);

    expect(probe().textContent).toBe("a");
    expect(probe().dataset["leaving"]).toBe("true");
    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(probe().textContent).toBe("a");
    expect(probe().dataset["leaving"]).toBe("true");
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(probe().textContent).toBe("nothing");
    expect(probe().dataset["leaving"]).toBe("false");
  });

  it("puts a new value in the place of the one leaving at once, and cancels the removal", () => {
    const { rerender } = render(<Probe value="a" />);
    rerender(<Probe value={null} />);
    act(() => {
      vi.advanceTimersByTime(200);
    });

    rerender(<Probe value="b" />);

    expect(probe().textContent).toBe("b");
    expect(probe().dataset["leaving"]).toBe("false");
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(probe().textContent).toBe("b");
  });

  it("stays when the same value comes back before it has gone", () => {
    const { rerender } = render(<Probe value="a" />);
    rerender(<Probe value={null} />);

    rerender(<Probe value="a" />);

    expect(probe().dataset["leaving"]).toBe("false");
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(probe().textContent).toBe("a");
  });

  it("goes again after it has come back", () => {
    const { rerender } = render(<Probe value="a" />);
    rerender(<Probe value={null} />);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    rerender(<Probe value="b" />);

    rerender(<Probe value={null} />);

    expect(probe().textContent).toBe("b");
    expect(probe().dataset["leaving"]).toBe("true");
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(probe().textContent).toBe("nothing");
  });
});
