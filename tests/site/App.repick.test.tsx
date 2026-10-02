/** @vitest-environment jsdom */

import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { isOpen, pickABusiness, step, useDemoPage } from "./support/demo-page";

// A step takes FOLD_MS to close, and stays on the page while it does. Stretched
// here, so that there is time to pick again before it has gone.
vi.mock("../../site/demo/controls", async importOriginal => ({
  ...(await importOriginal<typeof import("../../site/demo/controls")>()),
  FOLD_MS: 10_000,
}));

useDemoPage();

describe("picking the same business again while the third step closes", () => {
  it("starts the step over, not on the run the closing one had", async () => {
    const user = await pickABusiness();
    const first = step();
    await user.type(screen.getByPlaceholderText("dana"), "x");
    // Closing, with the old step still in its slot.
    expect(isOpen()).toBe("false");
    expect(step()).toBe(first);

    // The same business, so the same token.
    const rows = await screen.findAllByTestId("business-suggestion");
    await user.click(rows[0]!);

    // A new step in the slot, not the old one opened again with the phase and
    // the idempotency key of the run it had.
    await waitFor(() => expect(isOpen()).toBe("true"));
    expect(step()).not.toBeNull();
    expect(step()).not.toBe(first);
    expect(first?.isConnected).toBe(false);
  });
});
